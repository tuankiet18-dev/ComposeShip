import os
import sys

import pytest

worker_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, worker_dir)

from modules.build_runner import slugify
from modules.repo_cloner import validate_relative_subfolder, validate_repo_url


@pytest.mark.parametrize(
    "repo_url",
    [
        "https://github.com/example/app",
        "https://github.com/example/app.git",
    ],
)
def test_validate_repo_url_accepts_public_github_https(repo_url):
    assert validate_repo_url(repo_url) == repo_url


@pytest.mark.parametrize(
    "repo_url",
    [
        "git@github.com:example/app.git",
        "http://github.com/example/app",
        "https://token@github.com/example/app",
        "https://gitlab.com/example/app",
        "https://github.com/example",
        "https://github.com/example/app?token=abc",
    ],
)
def test_validate_repo_url_rejects_unsafe_urls(repo_url):
    with pytest.raises(ValueError):
        validate_repo_url(repo_url)


@pytest.mark.parametrize("subfolder", ["apps/web", "src"])
def test_validate_relative_subfolder_accepts_safe_paths(subfolder):
    assert validate_relative_subfolder(subfolder) == subfolder


@pytest.mark.parametrize("subfolder", ["../secret", "/etc", "apps/../../secret"])
def test_validate_relative_subfolder_rejects_escape_paths(subfolder):
    with pytest.raises(ValueError):
        validate_relative_subfolder(subfolder)


def test_slugify_removes_container_name_metacharacters():
    assert slugify("My Project_../API!") == "my-project-api"
