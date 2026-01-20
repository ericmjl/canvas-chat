"""Tests for Git Repository URL Handler"""

from pathlib import Path

from canvas_chat.plugins.git_repo_handler import GitRepoHandler


class TestGitRepoHandlerUrlNormalization:
    """Test URL normalization and repo name extraction."""

    def setup_method(self):
        """Set up handler instance for each test."""
        self.handler = GitRepoHandler()

    def test_normalize_url_adds_git_suffix(self):
        """URL without .git suffix should get .git added."""
        url = "https://github.com/user/repo"
        result = self.handler._normalize_url(url)
        assert result == "https://github.com/user/repo.git"

    def test_normalize_url_preserves_git_suffix(self):
        """URL with .git suffix should keep it."""
        url = "https://github.com/user/repo.git"
        result = self.handler._normalize_url(url)
        assert result == "https://github.com/user/repo.git"

    def test_normalize_url_handles_trailing_slash(self):
        """URL with trailing slash should not get double slashes."""
        url = "https://github.com/user/repo/"
        result = self.handler._normalize_url(url)
        assert result == "https://github.com/user/repo.git"

    def test_normalize_url_handles_ssh_format(self):
        """SSH URL format should be converted to HTTPS."""
        url = "git@github.com:user/repo"
        result = self.handler._normalize_url(url)
        assert result == "https://github.com/user/repo.git"

    def test_normalize_url_handles_ssh_format_with_git(self):
        """SSH URL format with .git suffix should be converted to HTTPS."""
        url = "git@github.com:user/repo.git"
        result = self.handler._normalize_url(url)
        assert result == "https://github.com/user/repo.git"

    def test_extract_repo_name_simple(self):
        """Simple repo URL should extract correct name."""
        url = "https://github.com/user/repo"
        result = self.handler._extract_repo_name(url)
        assert result == "repo"

    def test_extract_repo_name_with_git_suffix(self):
        """URL with .git suffix should extract correct name."""
        url = "https://github.com/user/repo.git"
        result = self.handler._extract_repo_name(url)
        assert result == "repo"

    def test_extract_repo_name_with_trailing_slash(self):
        """URL with trailing slash should extract correct name."""
        url = "https://github.com/user/repo/"
        result = self.handler._extract_repo_name(url)
        assert result == "repo"

    def test_extract_repo_name_ssh_format(self):
        """SSH URL format should extract correct name."""
        url = "git@github.com:user/repo"
        result = self.handler._extract_repo_name(url)
        assert result == "repo"

    def test_extract_repo_name_ssh_format_with_git(self):
        """SSH URL format with .git suffix should extract correct name."""
        url = "git@github.com:user/repo.git"
        result = self.handler._extract_repo_name(url)
        assert result == "repo"

    def test_extract_repo_name_complex_path(self):
        """Complex path URL should extract correct name."""
        url = "https://github.com/originalankur/maptoposter"
        result = self.handler._extract_repo_name(url)
        assert result == "maptoposter"

    def test_extract_repo_name_from_full_github_url(self):
        """Full GitHub URL should extract correct name."""
        url = "https://github.com/originalankur/maptoposter.git"
        result = self.handler._extract_repo_name(url)
        assert result == "maptoposter"


class TestGitRepoHandlerImageExtensions:
    """Test image extension detection."""

    def setup_method(self):
        """Set up handler instance for each test."""
        self.handler = GitRepoHandler()

    def test_png_is_image(self):
        """PNG files should be detected as images."""
        from canvas_chat.plugins.git_repo_handler import IMAGE_EXTENSIONS

        assert Path("test.png").suffix.lower() in IMAGE_EXTENSIONS

    def test_jpg_is_image(self):
        """JPG files should be detected as images."""
        from canvas_chat.plugins.git_repo_handler import IMAGE_EXTENSIONS

        assert Path("test.jpg").suffix.lower() in IMAGE_EXTENSIONS

    def test_svg_is_image(self):
        """SVG files should be detected as images."""
        from canvas_chat.plugins.git_repo_handler import IMAGE_EXTENSIONS

        assert Path("test.svg").suffix.lower() in IMAGE_EXTENSIONS

    def test_py_is_not_image(self):
        """Python files should not be detected as images."""
        from canvas_chat.plugins.git_repo_handler import IMAGE_EXTENSIONS

        assert Path("test.py").suffix.lower() not in IMAGE_EXTENSIONS

    def test_pdf_is_binary(self):
        """PDF files should be detected as binary."""
        from canvas_chat.plugins.git_repo_handler import BINARY_EXTENSIONS

        assert Path("test.pdf").suffix.lower() in BINARY_EXTENSIONS
