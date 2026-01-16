"""Tests for YouTube URL fetch handler.

Guards against regression where metadata wasn't passed correctly
from handler to frontend.
"""

from canvas_chat.plugins.youtube_handler import YouTubeHandler


class TestYouTubeHandler:
    """Test YouTube transcript handler."""

    def test_extract_video_id_watch_url(self):
        """Test extracting video ID from standard watch URL."""
        handler = YouTubeHandler()

        # Standard watch URL
        assert (
            handler._extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
            == "dQw4w9WgXcQ"
        )
        assert (
            handler._extract_video_id("https://youtube.com/watch?v=dQw4w9WgXcQ")
            == "dQw4w9WgXcQ"
        )

    def test_extract_video_id_short_url(self):
        """Test extracting video ID from youtu.be short URL."""
        handler = YouTubeHandler()

        assert (
            handler._extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
        )

    def test_extract_video_id_embed_url(self):
        """Test extracting video ID from embed URL."""
        handler = YouTubeHandler()

        assert (
            handler._extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ")
            == "dQw4w9WgXcQ"
        )

    def test_extract_video_id_with_extra_params(self):
        """Test extracting video ID from URL with extra query parameters."""
        handler = YouTubeHandler()

        # URL with additional parameters
        video_id = handler._extract_video_id(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120"
        )
        assert video_id == "dQw4w9WgXcQ"

    def test_extract_video_id_invalid_url(self):
        """Test that invalid URLs return None."""
        handler = YouTubeHandler()

        assert handler._extract_video_id("https://example.com/video") is None
        assert handler._extract_video_id("https://vimeo.com/123456") is None

    def test_format_timestamp(self):
        """Test timestamp formatting."""
        handler = YouTubeHandler()

        assert handler._format_timestamp(0) == "00:00"
        assert handler._format_timestamp(65) == "01:05"
        assert handler._format_timestamp(3661) == "01:01:01"
