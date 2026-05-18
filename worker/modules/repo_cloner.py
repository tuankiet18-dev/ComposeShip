import os
import shutil
import logging
from urllib.parse import urlparse, urlunparse, unquote
from git import Repo

from config import WORKSPACE_DIR

logger = logging.getLogger(__name__)


def normalize_github_url(repo_url: str, branch: str, subfolder: str | None) -> tuple[str, str, str | None]:
    """
    Convert GitHub browser URLs to cloneable repository URLs.

    Users often paste URLs such as:
    https://github.com/owner/repo/tree/main/backend

    Git cannot clone that URL directly. This normalizes it to the repo root,
    extracts the branch, and appends any path after the branch to subfolder.
    """
    parsed = urlparse(repo_url.strip())
    if parsed.netloc.lower() not in {"github.com", "www.github.com"}:
        return repo_url, branch, subfolder

    parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]
    if len(parts) < 2:
        return repo_url, branch, subfolder

    owner, repo = parts[0], parts[1]
    repo_root = urlunparse((parsed.scheme or "https", "github.com", f"/{owner}/{repo}", "", "", ""))

    if len(parts) >= 4 and parts[2] in {"tree", "blob"}:
        branch = parts[3] or branch
        url_subfolder = "/".join(parts[4:]) or None
        if url_subfolder:
            subfolder = f"{url_subfolder}/{subfolder}" if subfolder else url_subfolder

    if repo_url != repo_root:
        logger.info(
            "Normalized GitHub URL '%s' to repo '%s' (branch: %s, subfolder: %s)",
            repo_url,
            repo_root,
            branch,
            subfolder,
        )

    return repo_root, branch, subfolder


def clone_repo(repo_url: str, branch: str, subfolder: str | None, deployment_id: str) -> str:
    """
    Clone a Git repository and return the path to the source code.

    Args:
        repo_url: GitHub repository URL
        branch: Branch to clone
        subfolder: Optional subfolder within the repo
        deployment_id: Used to create a unique workspace directory

    Returns:
        Path to the cloned source code (respecting subfolder if specified)
    """
    workspace = os.path.join(WORKSPACE_DIR, str(deployment_id))

    # Clean up any previous workspace
    if os.path.exists(workspace):
        shutil.rmtree(workspace)

    os.makedirs(workspace, exist_ok=True)

    clone_path = os.path.join(workspace, "repo")
    repo_url, branch, subfolder = normalize_github_url(repo_url, branch, subfolder)

    logger.info(f"Cloning {repo_url} (branch: {branch}) into {clone_path}")

    Repo.clone_from(
        repo_url,
        clone_path,
        branch=branch,
        depth=1,  # Shallow clone for speed
    )

    # If subfolder is specified, return path to that subfolder
    if subfolder:
        source_path = os.path.join(clone_path, subfolder)
        if not os.path.exists(source_path):
            raise FileNotFoundError(
                f"Subfolder '{subfolder}' not found in repository"
            )
        return source_path

    return clone_path


def cleanup_workspace(deployment_id: str):
    """Remove the workspace directory for a deployment."""
    workspace = os.path.join(WORKSPACE_DIR, str(deployment_id))
    if os.path.exists(workspace):
        shutil.rmtree(workspace, ignore_errors=True)
        logger.info(f"Cleaned up workspace for deployment {deployment_id}")
