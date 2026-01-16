"""YouTube Video Transcript URL Fetch Handler Plugin

Handles YouTube video URL fetching by extracting transcripts.
"""

import logging
from typing import Any
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    YouTubeTranscriptApi,
)

from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin
from canvas_chat.url_fetch_registry import PRIORITY, UrlFetchRegistry

logger = logging.getLogger(__name__)


class YouTubeHandler(UrlFetchHandlerPlugin):
    """Handler for YouTube video URLs."""

    def _extract_video_id(self, url: str) -> str | None:
        """Extract YouTube video ID from URL.

        Supports various YouTube URL formats:
        - https://www.youtube.com/watch?v=VIDEO_ID
        - https://youtu.be/VIDEO_ID
        - https://www.youtube.com/embed/VIDEO_ID
        - https://youtube.com/watch?v=VIDEO_ID

        Args:
            url: YouTube video URL

        Returns:
            Video ID or None if not a valid YouTube URL
        """
        # Parse URL
        parsed = urlparse(url)
        video_id = None

        # Handle youtu.be short URLs
        if parsed.hostname in ("youtu.be", "www.youtu.be"):
            video_id = parsed.path.lstrip("/")
            return video_id

        # Handle youtube.com/watch URLs
        if parsed.hostname in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            if parsed.path == "/watch":
                query_params = parse_qs(parsed.query)
                video_id = query_params.get("v", [None])[0]
                return video_id
            # Handle /embed/VIDEO_ID
            if parsed.path.startswith("/embed/"):
                video_id = parsed.path.split("/embed/")[1].split("?")[0]
                return video_id

        return None

    async def fetch_url(self, url: str) -> dict[str, Any]:
        """Fetch YouTube video transcript.

        Args:
            url: YouTube video URL

        Returns:
            Dictionary with:
            - "title": str - Video title (from URL)
            - "content": str - Markdown formatted transcript

        Raises:
            Exception: If video ID cannot be extracted or transcript cannot be fetched
        """
        video_id = self._extract_video_id(url)
        if not video_id:
            raise ValueError(f"Invalid YouTube URL: {url}")

        logger.info(f"Fetching transcript for YouTube video: {video_id}")

        try:
            # Create API instance (required in v1.2.3+)
            api = YouTubeTranscriptApi()

            # Try to fetch transcript - prefer English, fallback to any language
            transcript_data = None
            language_code = "en"
            is_generated = False

            try:
                # First, try to list available transcripts to get better control
                transcript_list = api.list(video_id)
                # Find English transcript (prefers manual, then auto-generated)
                transcript = transcript_list.find_transcript(["en"])
                fetched_transcript = transcript.fetch()
                # Convert FetchedTranscript to list of dicts
                transcript_data = [
                    {
                        "text": snippet.text,
                        "start": snippet.start,
                        "duration": snippet.duration,
                    }
                    for snippet in fetched_transcript
                ]
                language_code = transcript.language_code
                is_generated = transcript.is_generated
            except NoTranscriptFound:
                # English not available, try any language
                try:
                    # Use fetch() which tries multiple languages
                    fetched_transcript = api.fetch(video_id, languages=["en"])
                    transcript_data = [
                        {
                            "text": snippet.text,
                            "start": snippet.start,
                            "duration": snippet.duration,
                        }
                        for snippet in fetched_transcript
                    ]
                    is_generated = False  # Can't determine from simple fetch
                except NoTranscriptFound:
                    # Try listing to get any available transcript
                    transcript_list = api.list(video_id)
                    available = list(transcript_list)
                    if available:
                        # Prefer manually created transcripts
                        manual = [t for t in available if not t.is_generated]
                        if manual:
                            transcript = manual[0]
                        else:
                            transcript = available[0]
                        fetched_transcript = transcript.fetch()
                        transcript_data = [
                            {
                                "text": snippet.text,
                                "start": snippet.start,
                                "duration": snippet.duration,
                            }
                            for snippet in fetched_transcript
                        ]
                        language_code = transcript.language_code
                        is_generated = transcript.is_generated
                    else:
                        raise NoTranscriptFound(
                            video_id,
                            None,
                            f"No transcripts found for video {video_id}",
                        ) from None

            # Format as markdown
            content_parts = ["# YouTube Video Transcript\n\n"]
            content_parts.append(f"**Video ID:** `{video_id}`\n\n")
            content_parts.append(f"**URL:** {url}\n\n")
            content_parts.append(f"**Language:** {language_code}\n\n")
            if is_generated:
                content_parts.append("*Note: This is an auto-generated transcript*\n\n")
            content_parts.append("---\n\n")

            # Format transcript with timestamps
            # transcript_data is a list of dicts with 'text', 'start', 'duration'
            for entry in transcript_data:
                timestamp = self._format_timestamp(entry["start"])
                text = entry["text"].strip()
                if text:
                    content_parts.append(f"**[{timestamp}]** {text}\n\n")

            content = "".join(content_parts)

            # Use video ID as title (we could fetch actual title via YouTube API,
            # but that requires API key)
            title = f"YouTube Video: {video_id}"

            return {
                "title": title,
                "content": content,
                "metadata": {
                    "content_type": "youtube",
                    "video_id": video_id,
                    "language": language_code,
                    "is_generated": is_generated,
                },
            }

        except TranscriptsDisabled:
            raise Exception(f"Transcripts are disabled for video {video_id}") from None
        except NoTranscriptFound:
            raise Exception(f"No transcript available for video {video_id}") from None
        except Exception as e:
            logger.error(f"Error fetching YouTube transcript: {e}")
            raise Exception(f"Failed to fetch transcript: {str(e)}") from e

    def _format_timestamp(self, seconds: float) -> str:
        """Format seconds as MM:SS or HH:MM:SS timestamp.

        Args:
            seconds: Time in seconds

        Returns:
            Formatted timestamp string
        """
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)

        if hours > 0:
            return f"{hours:02d}:{minutes:02d}:{secs:02d}"
        return f"{minutes:02d}:{secs:02d}"


# Register YouTube handler
UrlFetchRegistry.register(
    id="youtube",
    url_patterns=[
        r"^https?://(www\.)?youtube\.com/watch\?v=[\w-]+",
        r"^https?://(www\.)?youtube\.com/embed/[\w-]+",
        r"^https?://youtu\.be/[\w-]+",
        r"^https?://(www\.)?youtube\.com/watch\?.*v=[\w-]+",
    ],
    handler=YouTubeHandler,
    priority=PRIORITY["BUILTIN"],
)

logger.info("YouTube URL fetch handler plugin loaded")
