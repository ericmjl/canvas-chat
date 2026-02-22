"""Tests for URL fetch handler registry.

Ensures URL patterns only match intended URLs (e.g. blog URLs are not treated as git).
"""

# Import so git handler registers its URL patterns
from canvas_chat.plugins import git_repo_handler  # noqa: F401
from canvas_chat.url_fetch_registry import UrlFetchRegistry


class TestUrlFetchRegistryGitPatterns:
    """Git handler must not match non-git URLs (e.g. blog posts)."""

    def test_blog_like_url_does_not_match_git_handler(self):
        """Blog/post URLs must not be treated as git repos (no clone)."""
        url = "https://poovarasu.dev/news/python-fastapi-django-weekly-news-summary-31-03-2025-to-06-04-2025/"
        handler = UrlFetchRegistry.find_handler(url)
        assert handler is None, (
            "Blog-like URL must not match git handler; "
            "otherwise /api/fetch-url would clone instead of web fetch"
        )

    def test_github_url_matches_git_handler(self):
        """Known git host URLs should still match for clone."""
        url = "https://github.com/user/repo"
        handler = UrlFetchRegistry.find_handler(url)
        assert handler is not None
        assert handler.get("id") == "git-repo"

    def test_gitlab_url_matches_git_handler(self):
        """GitLab URLs should match git handler."""
        url = "https://gitlab.com/group/project"
        handler = UrlFetchRegistry.find_handler(url)
        assert handler is not None
        assert handler.get("id") == "git-repo"
