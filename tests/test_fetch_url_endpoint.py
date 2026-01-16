"""Tests for /api/fetch-url endpoint metadata handling.

Guards against regression where metadata wasn't passed from handlers to response.
"""

from canvas_chat.app import FetchUrlResult


class TestFetchUrlResult:
    """Test FetchUrlResult model.

    CRITICAL: These tests guard against regression where metadata wasn't passed
    from URL fetch handlers to the frontend.
    """

    def test_fetch_url_result_has_metadata_field(self):
        """CRITICAL: FetchUrlResult must have metadata field, not video_id.

        This guards against reverting to the old video_id field.
        """
        result = FetchUrlResult(
            url="https://example.com",
            title="Test",
            content="Content",
            metadata={"content_type": "youtube", "video_id": "abc123"},
        )

        assert hasattr(result, "metadata"), "FetchUrlResult must have metadata field"
        assert result.metadata == {"content_type": "youtube", "video_id": "abc123"}

    def test_fetch_url_result_metadata_defaults_to_empty_dict(self):
        """Test that metadata defaults to empty dict if not provided."""
        result = FetchUrlResult(
            url="https://example.com",
            title="Test",
            content="Content",
        )

        assert result.metadata == {}

    def test_fetch_url_result_preserves_nested_metadata(self):
        """Test that nested metadata fields are preserved."""
        metadata = {
            "content_type": "youtube",
            "video_id": "dQw4w9WgXcQ",
            "language": "en",
            "is_generated": False,
        }

        result = FetchUrlResult(
            url="https://youtube.com/watch?v=dQw4w9WgXcQ",
            title="YouTube Video",
            content="Transcript...",
            metadata=metadata,
        )

        # All nested fields must be preserved
        assert result.metadata["content_type"] == "youtube"
        assert result.metadata["video_id"] == "dQw4w9WgXcQ"
        assert result.metadata["language"] == "en"
        assert result.metadata["is_generated"] is False

    def test_fetch_url_result_no_video_id_field(self):
        """CRITICAL: FetchUrlResult must NOT have a top-level video_id field.

        The old bug was using video_id=result.get("video_id") instead of
        metadata=result.get("metadata", {}). This test ensures we don't
        accidentally add a video_id field back.
        """
        result = FetchUrlResult(
            url="https://example.com",
            title="Test",
            content="Content",
            metadata={"video_id": "inside_metadata"},
        )

        # video_id should only be accessible via metadata, not as top-level field
        assert not hasattr(result, "video_id") or result.video_id is None
        assert result.metadata.get("video_id") == "inside_metadata"

    def test_fetch_url_result_youtube_metadata_structure(self):
        """Test the expected YouTube metadata structure.

        YouTube handler returns metadata with these fields:
        - content_type: 'youtube'
        - video_id: the YouTube video ID
        - language: transcript language code
        - is_generated: whether transcript is auto-generated
        """
        metadata = {
            "content_type": "youtube",
            "video_id": "Q10H5RA3eCA",
            "language": "en",
            "is_generated": True,
        }

        result = FetchUrlResult(
            url="https://www.youtube.com/watch?v=Q10H5RA3eCA",
            title="YouTube Video: Q10H5RA3eCA",
            content="# Transcript...",
            metadata=metadata,
        )

        # Frontend expects these exact fields
        assert result.metadata["content_type"] == "youtube"
        assert result.metadata["video_id"] == "Q10H5RA3eCA"
        assert result.metadata["language"] == "en"
        assert result.metadata["is_generated"] is True

    def test_fetch_url_result_git_metadata_structure(self):
        """Test the expected Git repository metadata structure."""
        metadata = {
            "content_type": "git",
            "files": {
                "README.md": {"content": "# Hello", "path": "README.md"},
                "src/main.py": {"content": "print('hi')", "path": "src/main.py"},
            },
        }

        result = FetchUrlResult(
            url="https://github.com/user/repo",
            title="repo",
            content="# Repository files...",
            metadata=metadata,
        )

        assert result.metadata["content_type"] == "git"
        assert "files" in result.metadata
        assert "README.md" in result.metadata["files"]

    def test_fetch_url_result_pdf_metadata_structure(self):
        """Test the expected PDF metadata structure."""
        metadata = {
            "content_type": "pdf",
            "page_count": 10,
            "source": "url",
        }

        result = FetchUrlResult(
            url="https://example.com/document.pdf",
            title="document.pdf",
            content="PDF content...",
            metadata=metadata,
        )

        assert result.metadata["content_type"] == "pdf"
        assert result.metadata["page_count"] == 10
        assert result.metadata["source"] == "url"
