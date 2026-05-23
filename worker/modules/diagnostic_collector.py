import json
import os
import re
from pathlib import Path
from typing import Any

HEAVY_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".nuxt",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "bin",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "obj",
    "out",
    "target",
    "tmp",
    "venv",
}

SECRET_KEYWORDS = (
    "api_key",
    "apikey",
    "authorization",
    "connectionstring",
    "connectionstrings",
    "password",
    "private_key",
    "privatekey",
    "secret",
    "token",
)

LOG_SIGNAL_PATTERNS = (
    "error",
    "failed",
    "failure",
    "exception",
    "not found",
    "cannot find",
    "missing",
    "exit code",
    "npm err",
    "traceback",
)

MAX_TREE_ENTRIES = 200
MAX_TREE_DEPTH = 4
MAX_SELECTED_FILES = 20
MAX_FILE_BYTES = 64 * 1024
MAX_PACKAGE_LOCK_METADATA_BYTES = 2 * 1024 * 1024
MAX_LOG_LINES = 120
MAX_LOG_CHARS = 12_000


def build_diagnostic_snapshot(
    source_path: str | None,
    detected_stack: str | None,
    full_logs: str,
    failure_step: str,
    error_message: str | None = None,
) -> dict[str, Any]:
    """Build a compact, non-throwing snapshot for a failed deployment."""
    root = Path(source_path).resolve() if source_path else None
    if not root or not root.exists() or not root.is_dir():
        repository_tree: list[dict[str, str]] = []
        selected_files: dict[str, str] = {}
    else:
        repository_tree = collect_repository_tree(root)
        selected_files = collect_selected_files(root, detected_stack)

    return {
        "failure_step": failure_step or "unknown",
        "detected_stack": detected_stack,
        "error_summary": summarize_error(failure_step, error_message, full_logs),
        "relevant_log_excerpt": extract_relevant_log_excerpt(full_logs),
        "repository_tree": repository_tree,
        "selected_files": selected_files,
    }


def collect_repository_tree(
    root_path: str | Path,
    max_depth: int = MAX_TREE_DEPTH,
    max_entries: int = MAX_TREE_ENTRIES,
) -> list[dict[str, str]]:
    root = Path(root_path)
    entries: list[dict[str, str]] = []

    def walk(directory: Path, depth: int):
        if depth > max_depth or len(entries) >= max_entries:
            return

        try:
            children = sorted(
                directory.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
        except OSError:
            return

        for child in children:
            if len(entries) >= max_entries:
                return
            if _should_skip_path(root, child):
                continue

            rel_path = child.relative_to(root).as_posix()
            if child.is_dir():
                entries.append({"path": rel_path, "type": "directory"})
                walk(child, depth + 1)
            elif child.is_file():
                entries.append({"path": rel_path, "type": "file"})

    walk(root, 1)
    return entries


def collect_selected_files(root_path: str | Path, detected_stack: str | None) -> dict[str, str]:
    root = Path(root_path)
    selected: dict[str, str] = {}

    for file_path in _candidate_files(root, detected_stack):
        if len(selected) >= MAX_SELECTED_FILES:
            break
        if not file_path.exists() or not file_path.is_file() or _should_skip_path(root, file_path):
            continue
        if _is_secret_env_file(file_path):
            continue

        rel_path = file_path.relative_to(root).as_posix()
        if rel_path in selected:
            continue

        selected[rel_path] = _read_selected_file(file_path)

    return selected


def extract_relevant_log_excerpt(logs: str | None) -> str:
    lines = (logs or "").splitlines()
    if not lines:
        return ""

    signal_indexes = [
        index
        for index, line in enumerate(lines)
        if any(pattern in line.lower() for pattern in LOG_SIGNAL_PATTERNS)
    ]

    if not signal_indexes:
        return _bounded_lines(lines[-MAX_LOG_LINES:])

    selected_indexes: set[int] = set()
    for index in signal_indexes[:8]:
        start = max(0, index - 6)
        end = min(len(lines), index + 7)
        selected_indexes.update(range(start, end))

    excerpt_lines = [lines[index] for index in sorted(selected_indexes)]
    return _bounded_lines(excerpt_lines)


def summarize_error(failure_step: str, error_message: str | None, logs: str | None) -> str | None:
    text = f"{error_message or ''}\n{logs or ''}".lower()

    if "package.json" in text and any(term in text for term in ("not found", "missing", "cannot find")):
        return "missing package.json"
    if "missing script" in text and "build" in text:
        return "missing build script"
    if "npm err" in text or "npm error" in text:
        return "npm install/build failure"
    if failure_step == "docker_build" or "docker build failed" in text or "failed to solve" in text:
        return "Docker build failure"
    if failure_step == "container_start" and any(
        term in text for term in ("failed startup stability", "exited", "exit code")
    ):
        return "container exited after startup"
    if failure_step == "stack_detection" and "could not detect a supported tech stack" in text:
        return "unsupported or undetected project stack"

    return f"Deployment failed during {failure_step or 'unknown'}"


def _candidate_files(root: Path, detected_stack: str | None) -> list[Path]:
    stack = (detected_stack or "").lower()
    candidates: list[Path] = []

    def add_exact(*names: str):
        for name in names:
            candidates.append(root / name)

    def add_glob(pattern: str):
        candidates.extend(sorted(root.glob(pattern), key=lambda p: p.as_posix()))

    if stack == "react":
        add_exact("package.json", "package-lock.json")
        add_glob("vite.config.*")
        add_exact("tsconfig.json", "jsconfig.json", "Dockerfile", ".env.example")
    elif stack == "angular":
        add_exact("package.json", "package-lock.json", "angular.json")
        add_exact("tsconfig.json", "tsconfig.app.json", "Dockerfile", ".env.example")
    elif stack == "nextjs":
        add_exact("package.json")
        add_glob("next.config.*")
        add_exact("tsconfig.json", "jsconfig.json", "Dockerfile", ".env.example")
    elif stack == "aspnet":
        add_glob("*.csproj")
        add_exact("Program.cs", "appsettings.json", "Dockerfile")
    elif stack == "springboot-maven":
        add_exact("pom.xml")
        add_glob("**/application.properties")
        add_glob("**/application.yml")
        add_exact("Dockerfile")
    elif stack == "springboot-gradle":
        add_exact("build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts")
        add_glob("**/application.properties")
        add_glob("**/application.yml")
        add_exact("Dockerfile")
    else:
        add_exact("package.json", "Dockerfile", ".env.example")
        add_glob("*.csproj")
        add_exact("pom.xml", "build.gradle", "build.gradle.kts")

    seen: set[Path] = set()
    unique: list[Path] = []
    for path in candidates:
        try:
            resolved = path.resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        unique.append(path)
    return unique


def _read_selected_file(file_path: Path) -> str:
    size = file_path.stat().st_size
    if file_path.name == "package-lock.json" and size > MAX_FILE_BYTES:
        return _package_lock_metadata(file_path, size)
    if size > MAX_FILE_BYTES:
        return f"<omitted: file is {size} bytes, above {MAX_FILE_BYTES} byte diagnostic limit>"

    content = file_path.read_text(encoding="utf-8", errors="replace")
    return _redact_secret_values(content, file_path)


def _package_lock_metadata(file_path: Path, size: int) -> str:
    metadata: dict[str, Any] = {
        "_omitted": "package-lock.json content is above diagnostic size limit",
        "sizeBytes": size,
    }
    if size <= MAX_PACKAGE_LOCK_METADATA_BYTES:
        try:
            data = json.loads(file_path.read_text(encoding="utf-8", errors="replace"))
            packages = data.get("packages") or {}
            metadata.update({
                "name": data.get("name"),
                "version": data.get("version"),
                "lockfileVersion": data.get("lockfileVersion"),
                "packageCount": len(packages) if isinstance(packages, dict) else None,
            })
        except (OSError, json.JSONDecodeError):
            pass
    return json.dumps(metadata, indent=2, sort_keys=True)


def _redact_secret_values(content: str, file_path: Path) -> str:
    if file_path.suffix.lower() == ".json":
        try:
            parsed = json.loads(content)
            return json.dumps(_redact_json(parsed), indent=2, sort_keys=True)
        except json.JSONDecodeError:
            pass

    redacted_lines = []
    assignment_pattern = re.compile(r"^(\s*['\"]?([^'\":=\s]+)['\"]?\s*[:=]\s*)(.*)$")
    for line in content.splitlines():
        match = assignment_pattern.match(line)
        if match and _is_secret_key(match.group(2)):
            redacted_lines.append(f"{match.group(1)}<redacted>")
        else:
            redacted_lines.append(line)
    return "\n".join(redacted_lines)


def _redact_json(value: Any, parent_key: str | None = None) -> Any:
    if isinstance(value, dict):
        redacted = {}
        for key, nested in value.items():
            redacted[key] = "<redacted>" if _is_secret_key(key) or _is_secret_key(parent_key) else _redact_json(nested, key)
        return redacted
    if isinstance(value, list):
        return [_redact_json(item, parent_key) for item in value]
    return value


def _should_skip_path(root: Path, path: Path) -> bool:
    try:
        relative_parts = path.relative_to(root).parts
    except ValueError:
        return True
    if any(part in HEAVY_DIRS for part in relative_parts):
        return True
    return path.is_file() and _is_secret_env_file(path)


def _is_secret_env_file(file_path: Path) -> bool:
    name = file_path.name.lower()
    return name.startswith(".env") and name != ".env.example"


def _is_secret_key(key: str | None) -> bool:
    normalized = (key or "").lower().replace("-", "_")
    return any(keyword in normalized for keyword in SECRET_KEYWORDS)


def _bounded_lines(lines: list[str]) -> str:
    excerpt = "\n".join(lines[-MAX_LOG_LINES:])
    if len(excerpt) <= MAX_LOG_CHARS:
        return excerpt
    return excerpt[-MAX_LOG_CHARS:]
