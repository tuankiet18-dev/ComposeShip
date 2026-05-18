import os
import logging

logger = logging.getLogger(__name__)

# Map of stack name → template file
TEMPLATE_MAP = {
    "aspnet": "aspnet.Dockerfile",
    "springboot-maven": "springboot-maven.Dockerfile",
    "springboot-gradle": "springboot-gradle.Dockerfile",
    "python-fastapi": "python-fastapi.Dockerfile",
    "nextjs": "nextjs.Dockerfile",
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
        dst.write(src.read())

    logger.info(f"Generated Dockerfile for stack '{stack}' at {target_path}")
    return target_path
