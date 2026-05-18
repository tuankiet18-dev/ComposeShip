import os
import sys
import pytest

worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules import stack_detector
from modules import dockerfile_generator
from modules.repo_cloner import normalize_github_url

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

@pytest.mark.parametrize("fixture_name, expected_stack", [
    ("aspnet", "aspnet"),
    ("springboot-maven", "springboot-maven"),
    ("springboot-gradle", "springboot-gradle"),
    ("python-fastapi", "python-fastapi"),
    ("nextjs", "nextjs"),
    ("react", "react"),
])
def test_detect_stack_success(fixture_name, expected_stack):
    source_path = os.path.join(FIXTURES_DIR, fixture_name)
    detected = stack_detector.detect_stack(source_path)
    assert detected == expected_stack

def test_detect_stack_unsupported():
    source_path = os.path.join(FIXTURES_DIR, "unsupported")
    with pytest.raises(ValueError, match="Could not detect a supported tech stack"):
        stack_detector.detect_stack(source_path)

@pytest.mark.parametrize("fixture_name, stack", [
    ("aspnet", "aspnet"),
    ("springboot-maven", "springboot-maven"),
    ("springboot-gradle", "springboot-gradle"),
    ("python-fastapi", "python-fastapi"),
    ("nextjs", "nextjs"),
    ("react", "react"),
])
def test_generate_dockerfile(fixture_name, stack):
    source_path = os.path.join(FIXTURES_DIR, fixture_name)
    dockerfile_path = dockerfile_generator.generate_dockerfile(source_path, stack)
    
    assert os.path.exists(dockerfile_path)
    assert dockerfile_path == os.path.join(source_path, "Dockerfile")
    
    with open(dockerfile_path, "r") as f:
        content = f.read()
        
    # Check that it's not empty and contains some basic docker instructions
    assert "FROM " in content
    assert "EXPOSE " in content


def test_normalize_github_tree_url():
    repo_url, branch, subfolder = normalize_github_url(
        "https://github.com/kvgkvg/SupplyChainWatch/tree/main",
        "main",
        "backend",
    )

    assert repo_url == "https://github.com/kvgkvg/SupplyChainWatch"
    assert branch == "main"
    assert subfolder == "backend"


def test_normalize_github_tree_url_with_path():
    repo_url, branch, subfolder = normalize_github_url(
        "https://github.com/kvgkvg/SupplyChainWatch/tree/main/backend",
        "dev",
        None,
    )

    assert repo_url == "https://github.com/kvgkvg/SupplyChainWatch"
    assert branch == "main"
    assert subfolder == "backend"
