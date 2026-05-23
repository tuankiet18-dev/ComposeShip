import os
import logging
import re

logger = logging.getLogger(__name__)

# Map of stack name → template file
TEMPLATE_MAP = {
    "aspnet": "aspnet.Dockerfile",
    "springboot-maven": "springboot-maven.Dockerfile",
    "springboot-gradle": "springboot-gradle.Dockerfile",
    "python-fastapi": "python-fastapi.Dockerfile",
    "nextjs": "nextjs.Dockerfile",
    "angular": "angular.Dockerfile",
    "react": "react.Dockerfile",
}

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")


def generate_dockerfile(source_path: str, stack: str) -> str:
    """
    Copy the appropriate Dockerfile template into the source directory.

    Args:
        source_path: Path to the cloned project source
        stack: Detected stack name

    Returns:
        Path to the generated Dockerfile
    """
    template_name = TEMPLATE_MAP.get(stack)
    if not template_name:
        raise ValueError(f"No Dockerfile template for stack: {stack}")

    template_path = os.path.join(TEMPLATES_DIR, template_name)
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")

    # Check if user already has a Dockerfile
    user_dockerfile = os.path.join(source_path, "Dockerfile")
    if os.path.exists(user_dockerfile):
        logger.info("Using existing Dockerfile from repository")
        return user_dockerfile

    # Copy template to source directory
    target_path = os.path.join(source_path, "Dockerfile")
    with open(template_path, "r") as src, open(target_path, "w") as dst:
        dst.write(_render_template(src.read(), source_path, stack))

    logger.info(f"Generated Dockerfile for stack '{stack}' at {target_path}")
    return target_path


def _render_template(template: str, source_path: str, stack: str) -> str:
    if stack != "aspnet":
        return template

    dotnet_version = _detect_dotnet_version(source_path)
    return template.replace("{{DOTNET_VERSION}}", dotnet_version)


def _detect_dotnet_version(source_path: str) -> str:
    for entry in sorted(os.listdir(source_path)):
        if not entry.endswith(".csproj"):
            continue

        csproj_path = os.path.join(source_path, entry)
        try:
            with open(csproj_path, "r", encoding="utf-8") as project_file:
                content = project_file.read()
        except OSError:
            continue

        match = re.search(r"<TargetFramework>\s*net(\d+)(?:\.\d+)?\s*</TargetFramework>", content)
        if match:
            return f"{match.group(1)}.0"

        match = re.search(r"<TargetFrameworks>\s*([^<]+)\s*</TargetFrameworks>", content)
        if match:
            for target_framework in match.group(1).split(";"):
                version_match = re.search(r"net(\d+)(?:\.\d+)?", target_framework.strip())
                if version_match:
                    return f"{version_match.group(1)}.0"

    return "10.0"
