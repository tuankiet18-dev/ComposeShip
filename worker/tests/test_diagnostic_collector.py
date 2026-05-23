import os
import sys

worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules.diagnostic_collector import (  # noqa: E402
    build_diagnostic_snapshot,
    collect_repository_tree,
    collect_selected_files,
    extract_relevant_log_excerpt,
    summarize_error,
)


def test_repository_tree_excludes_heavy_folders(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.js").write_text("console.log('ok')", encoding="utf-8")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "left-pad.js").write_text("module.exports = {}", encoding="utf-8")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("[core]", encoding="utf-8")
    (tmp_path / "dist").mkdir()
    (tmp_path / "dist" / "bundle.js").write_text("compiled", encoding="utf-8")
    (tmp_path / ".env").write_text("SECRET=actual", encoding="utf-8")

    tree = collect_repository_tree(tmp_path)
    paths = {entry["path"] for entry in tree}

    assert "src" in paths
    assert "src/main.js" in paths
    assert not any(path.startswith("node_modules") for path in paths)
    assert not any(path.startswith(".git") for path in paths)
    assert not any(path.startswith("dist") for path in paths)
    assert ".env" not in paths


def test_selected_files_for_react_stack_and_env_safety(tmp_path):
    (tmp_path / "package.json").write_text(
        '{"scripts":{"build":"vite build"},"dependencies":{"react":"latest","vite":"latest"}}',
        encoding="utf-8",
    )
    (tmp_path / "vite.config.ts").write_text("export default {}", encoding="utf-8")
    (tmp_path / ".env.example").write_text("VITE_API_URL=http://api\nVITE_TOKEN=secret", encoding="utf-8")
    (tmp_path / ".env").write_text("VITE_TOKEN=actual-secret", encoding="utf-8")

    selected = collect_selected_files(tmp_path, "react")

    assert "package.json" in selected
    assert "vite.config.ts" in selected
    assert ".env.example" in selected
    assert ".env" not in selected
    assert "VITE_TOKEN=<redacted>" in selected[".env.example"]
    assert "actual-secret" not in "\n".join(selected.values())


def test_snapshot_uses_deployed_subfolder_as_root(tmp_path):
    repo_root = tmp_path / "repo"
    frontend = repo_root / "frontend"
    backend = repo_root / "backend"
    frontend.mkdir(parents=True)
    backend.mkdir()
    (repo_root / "package.json").write_text('{"name":"repo-root"}', encoding="utf-8")
    (frontend / "package.json").write_text(
        '{"name":"frontend","dependencies":{"react":"latest","vite":"latest"}}',
        encoding="utf-8",
    )
    (frontend / "vite.config.ts").write_text("export default {}", encoding="utf-8")
    (backend / "Program.cs").write_text("var builder = WebApplication.CreateBuilder(args);", encoding="utf-8")

    snapshot = build_diagnostic_snapshot(
        source_path=str(frontend),
        detected_stack="react",
        full_logs="Docker build failed",
        failure_step="docker_build",
        error_message="Docker build failed",
    )

    tree_paths = {entry["path"] for entry in snapshot["repository_tree"]}
    assert "package.json" in tree_paths
    assert "vite.config.ts" in tree_paths
    assert "frontend/package.json" not in tree_paths
    assert "backend/Program.cs" not in tree_paths
    assert snapshot["selected_files"]["package.json"].find('"name": "frontend"') != -1
    assert all(not path.startswith("frontend/") for path in snapshot["selected_files"])


def test_log_excerpt_prefers_failure_signal_with_context():
    logs = "\n".join(
        [
            "installing dependencies",
            "download complete",
            "running build",
            "src/App.tsx: Cannot find module './Missing'",
            "npm ERR! code 1",
            "npm ERR! command failed",
            "cleanup",
        ]
    )

    excerpt = extract_relevant_log_excerpt(logs)

    assert "Cannot find module" in excerpt
    assert "npm ERR! code 1" in excerpt
    assert "running build" in excerpt


def test_log_excerpt_uses_tail_when_no_signal():
    logs = "\n".join(f"line {index}" for index in range(150))

    excerpt = extract_relevant_log_excerpt(logs)

    assert "line 30" in excerpt
    assert "line 29" not in excerpt
    assert "line 149" in excerpt


def test_error_summary_for_docker_build_failure():
    assert summarize_error("docker_build", "Docker build failed. See logs above.", "") == "Docker build failure"
