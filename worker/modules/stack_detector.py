import os
import json
import logging

logger = logging.getLogger(__name__)


def detect_stack(source_path: str) -> str:
    """
    Detect the technology stack of a project by examining its files.

    Returns one of: 'aspnet', 'springboot-maven', 'springboot-gradle',
    'python-fastapi', 'nextjs', 'react'
    Raises ValueError if no supported stack is detected.
    """

    # ── ASP.NET Core ──────────────────────────────
    csproj_files = [f for f in os.listdir(source_path) if f.endswith(".csproj")]
    if csproj_files and os.path.exists(os.path.join(source_path, "Program.cs")):
        # Verify it's a web project
        for csproj in csproj_files:
            with open(os.path.join(source_path, csproj), "r") as f:
                content = f.read()
                if 'Microsoft.NET.Sdk.Web' in content:
                    logger.info(f"Detected stack: aspnet (via {csproj})")
                    return "aspnet"

    # ── Spring Boot (Maven) ───────────────────────
    pom_path = os.path.join(source_path, "pom.xml")
    if os.path.exists(pom_path):
        with open(pom_path, "r") as f:
            content = f.read()
            if "spring-boot" in content.lower():
                logger.info("Detected stack: springboot-maven")
                return "springboot-maven"

    # ── Spring Boot (Gradle) ──────────────────────
    gradle_path = os.path.join(source_path, "build.gradle")
    gradle_kts_path = os.path.join(source_path, "build.gradle.kts")
    for gp in [gradle_path, gradle_kts_path]:
        if os.path.exists(gp):
            with open(gp, "r") as f:
                content = f.read()
                if "org.springframework.boot" in content:
                    logger.info("Detected stack: springboot-gradle")
                    return "springboot-gradle"

    # ── Python / FastAPI ─────────────────────────────────────────────
    pyproject_path = os.path.join(source_path, "pyproject.toml")
    requirements_path = os.path.join(source_path, "requirements.txt")
    python_manifest = ""
    for manifest_path in [pyproject_path, requirements_path]:
        if os.path.exists(manifest_path):
            with open(manifest_path, "r", encoding="utf-8") as f:
                python_manifest += f.read().lower()

    if "fastapi" in python_manifest:
        logger.info("Detected stack: python-fastapi")
        return "python-fastapi"

    # ── Node.js projects (Next.js vs React) ───────
    pkg_path = os.path.join(source_path, "package.json")
    if os.path.exists(pkg_path):
        with open(pkg_path, "r") as f:
            pkg = json.load(f)

        all_deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

        # Check for Next.js first (more specific)
        next_config_exists = any(
            os.path.exists(os.path.join(source_path, f))
            for f in ["next.config.js", "next.config.ts", "next.config.mjs"]
        )
        if "next" in all_deps or next_config_exists:
            logger.info("Detected stack: nextjs")
            return "nextjs"

        # React (CRA or Vite)
        if "react" in all_deps and ("react-scripts" in all_deps or "vite" in all_deps):
            logger.info("Detected stack: react")
            return "react"

    raise ValueError(
        f"Could not detect a supported tech stack in {source_path}. "
        "Supported: ASP.NET Core, Spring Boot (Maven/Gradle), Python/FastAPI, Next.js, React (Vite/CRA)"
    )
