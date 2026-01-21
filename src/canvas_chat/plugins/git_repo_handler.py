"""Git Repository URL Fetch Handler Plugin

Handles git repository URL fetching with file selection support.
"""

import base64
import logging
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import defusedxml.ElementTree as ET

    HAS_DEFUSEDXML = True
except ImportError:
    HAS_DEFUSEDXML = False

from canvas_chat.url_fetch_handler_plugin import UrlFetchHandlerPlugin
from canvas_chat.url_fetch_registry import PRIORITY, UrlFetchRegistry

logger = logging.getLogger(__name__)

# Binary image extensions (will be resized + base64 encoded)
IMAGE_BINARY_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"}

# SVG extensions (will be sanitized + sent as text for native rendering)
IMAGE_SVG_EXTENSIONS = {".svg"}

# Max original file size in bytes (5MB) - files larger than this will show error
MAX_IMAGE_SIZE = 5 * 1024 * 1024

# Max image dimension after resizing
MAX_IMAGE_DIMENSION = 1920


def _resize_image(
    image_bytes: bytes, max_dimension: int = MAX_IMAGE_DIMENSION
) -> bytes | None:
    """Resize image to max_dimension while maintaining aspect ratio.

    Args:
        image_bytes: Raw image bytes
        max_dimension: Maximum width/height (default 1920px)

    Returns:
        Resized image bytes in PNG format, or None if resizing failed
    """
    if not HAS_PIL:
        logger.warning("PIL not available, cannot resize image")
        return None

    try:
        img = Image.open(BytesIO(image_bytes))

        # Convert to RGB if necessary (handles PNG with transparency, etc.)
        if img.mode in ("RGBA", "P"):
            pass  # Keep transparency for PNG
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Resize maintaining aspect ratio
        img.thumbnail((max_dimension, max_dimension), Image.LANCZOS)

        # Save as PNG to BytesIO
        output = BytesIO()
        img.save(output, format="PNG", quality=85, optimize=True)
        return output.getvalue()
    except Exception as e:
        logger.warning(f"Failed to resize image: {e}")
        return None


def _sanitize_svg(svg_content: str) -> str | None:
    """Light sanitize SVG to remove potentially dangerous content.

    Removes:
    - <script> tags
    - on* event handlers
    - javascript: URLs
    - data: URLs

    Args:
        svg_content: Raw SVG content as string

    Returns:
        Sanitized SVG content, or None if sanitization failed
    """
    if not HAS_DEFUSEDXML:
        logger.warning("defusedxml not available, skipping SVG sanitization")
        return svg_content  # Return original, let browser handle it

    try:
        root = ET.fromstring(svg_content)

        # Remove all script elements
        for script in root.iter("script"):
            root.remove(script)

        # Remove event handlers from all elements
        for elem in root.iter():
            attrs_to_remove = [
                attr for attr in elem.attrib if attr.lower().startswith("on")
            ]
            for attr in attrs_to_remove:
                del elem.attrib[attr]

        # Return sanitized SVG as string
        return ET.tostring(root, encoding="unicode")
    except Exception as e:
        logger.warning(f"SVG sanitization failed: {e}")
        return None  # Signal to treat as plain text instead


class GitRepoHandler(UrlFetchHandlerPlugin):
    """Handler for git repository URLs."""

    def _normalize_url(self, url: str) -> str:
        """Normalize git URL (add .git if missing, convert SSH to HTTPS).

        Args:
            url: Git repository URL

        Returns:
            Normalized URL
        """
        normalized_url = url
        if url.startswith("git@"):
            # Convert SSH URL to HTTPS
            # git@github.com:user/repo.git -> https://github.com/user/repo.git
            normalized_url = url.replace("git@", "https://").replace(":", "/", 1)
        if not normalized_url.endswith(".git") and not normalized_url.endswith("/"):
            normalized_url = normalized_url + ".git"
        return normalized_url

    def _extract_repo_name(self, url: str) -> str:
        """Extract repository name from URL.

        Args:
            url: Git repository URL

        Returns:
            Repository name
        """
        normalized_url = self._normalize_url(url)
        # Remove trailing slash
        normalized_url = normalized_url.rstrip("/")
        # Remove .git suffix if present (must be exact match, not rstrip)
        if normalized_url.endswith(".git"):
            normalized_url = normalized_url[:-4]
        return normalized_url.split("/")[-1]

    def _clone_repository(
        self, url: str, repo_path: Path, git_credentials: dict[str, str] | None = None
    ) -> None:
        """Clone a git repository to the specified path.

        Args:
            url: Git repository URL
            repo_path: Path where repository should be cloned
            git_credentials: Optional map of git host to credential (PAT)

        Raises:
            Exception: If cloning fails
        """
        normalized_url = self._normalize_url(url)

        # If credentials provided, embed PAT in HTTPS URL
        if git_credentials:
            # Extract host from URL (e.g., 'github.com' from 'https://github.com/user/repo.git')
            try:
                from urllib.parse import urlparse

                parsed = urlparse(normalized_url)
                host = parsed.netloc.lower()
                # Remove port if present (e.g., 'github.com:443' -> 'github.com')
                if ":" in host:
                    host = host.split(":")[0]

                # Look up credential for this host
                credential = git_credentials.get(host)
                if credential:
                    # Embed credential in URL: https://token@host/path
                    # Replace https:// with https://token@
                    if normalized_url.startswith("https://"):
                        normalized_url = normalized_url.replace(
                            "https://", f"https://{credential}@", 1
                        )
                        logger.info(f"Using credential for {host}")
                    elif normalized_url.startswith("http://"):
                        normalized_url = normalized_url.replace(
                            "http://", f"http://{credential}@", 1
                        )
                        logger.info(f"Using credential for {host}")
            except Exception as e:
                logger.warning(f"Failed to extract host from URL for credentials: {e}")

        logger.info(
            f"Cloning git repository: {normalized_url.split('@')[-1]}"
        )  # Don't log token

        try:
            subprocess.run(
                [
                    "git",
                    "clone",
                    "--depth",
                    "1",
                    "--quiet",
                    normalized_url,
                    str(repo_path),
                ],
                capture_output=True,
                text=True,
                timeout=60,
                check=True,
            )
        except subprocess.TimeoutExpired as e:
            raise Exception("Git clone timed out (repository may be too large)") from e
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.strip() if e.stderr else "Unknown git error"
            if (
                "not found" in error_msg.lower()
                or "does not exist" in error_msg.lower()
            ):
                raise Exception(
                    "Repository not found (may be private or invalid URL)"
                ) from e
            raise Exception(f"Failed to clone repository: {error_msg}") from e
        except FileNotFoundError as e:
            raise Exception("Git is not installed or not available in PATH") from e

    def _build_file_tree(self, repo_path: Path, base_path: Path = None) -> list[dict]:
        """Build file tree structure from repository.

        Args:
            repo_path: Path to repository root
            base_path: Base path for relative paths (defaults to repo_path)

        Returns:
            List of file tree items with structure:
            [
                {"path": "README.md", "type": "file", "size": 1234},
                {"path": "src", "type": "directory", "children": [...]}
            ]
        """
        if base_path is None:
            base_path = repo_path

        items = []
        try:
            for item_path in sorted(repo_path.iterdir()):
                # Skip .git directory
                if item_path.name == ".git":
                    continue

                rel_path = item_path.relative_to(base_path)
                if item_path.is_file():
                    try:
                        size = item_path.stat().st_size
                    except OSError:
                        size = None
                    items.append(
                        {
                            "path": str(rel_path),
                            "type": "file",
                            "size": size,
                        }
                    )
                elif item_path.is_dir():
                    children = self._build_file_tree(item_path, base_path)
                    items.append(
                        {
                            "path": str(rel_path),
                            "type": "directory",
                            "children": children,
                        }
                    )
        except PermissionError as e:
            logger.warning(f"Permission denied accessing {repo_path}: {e}")

        return items

    def _get_smart_default_files(self, file_tree: dict) -> list[str]:
        """Determine which files should be selected by default.

        Args:
            file_tree: File tree structure from list_files()

        Returns:
            List of file paths to select by default
        """
        selected = []

        # README files
        readme_patterns = ["README.md", "README.rst", "README.txt", "README"]
        # Config files
        config_files = [
            ".gitignore",
            "pyproject.toml",
            "package.json",
            "requirements.txt",
            "Cargo.toml",
            "go.mod",
        ]
        # Main entry points
        main_files = ["main.py", "index.js", "index.ts", "app.py"]

        def find_files(items, base_path=""):
            for item in items:
                full_path = f"{base_path}/{item['path']}" if base_path else item["path"]
                if item["type"] == "file":
                    name = item["path"].split("/")[-1]
                    if (
                        name in readme_patterns
                        or name in config_files
                        or name in main_files
                        or full_path.startswith("src/")
                        or full_path.startswith("lib/")
                    ):
                        selected.append(full_path)
                elif item["type"] == "directory" and item.get("children"):
                    find_files(item["children"], full_path)

        find_files(file_tree["files"])
        return selected[:20]  # Limit to prevent too many files

    async def list_files(
        self, url: str, git_credentials: dict[str, str] | None = None
    ) -> dict[str, any] | None:
        """List files in a git repository.

        Args:
            url: Git repository URL

        Returns:
            Dictionary with file tree structure:
            {
                "files": [
                    {"path": "README.md", "type": "file", "size": 1234},
                    {"path": "src", "type": "directory", "children": [...]}
                ]
            }

        Raises:
            Exception: If repository cannot be cloned or accessed
        """
        repo_name = self._extract_repo_name(url)

        # Create temporary directory for cloning
        with tempfile.TemporaryDirectory(prefix="canvas-chat-git-") as temp_dir:
            repo_path = Path(temp_dir) / repo_name

            # Clone repository
            self._clone_repository(url, repo_path, git_credentials=git_credentials)

            # Build file tree
            files = self._build_file_tree(repo_path)

            return {"files": files}

    async def fetch_selected_files(
        self,
        url: str,
        file_paths: list[str],
        git_credentials: dict[str, str] | None = None,
    ) -> dict[str, any]:
        """Fetch content from selected files in a git repository.

        Args:
            url: Git repository URL
            file_paths: List of file paths to fetch (e.g., ["README.md", "src/main.py"])

        Returns:
            Dictionary with:
            - "title": str - Repository name
            - "content": str - Markdown content from selected files
            - "files": dict[str, dict] - Map of file paths to file data:
                - "content": str - Raw file content
                - "lang": str - Language for syntax highlighting
                - "status": str - "success", "not_found", "permission_denied",
                  or "error"

        Raises:
            Exception: If repository cannot be cloned or files cannot be read
        """
        repo_name = self._extract_repo_name(url)
        normalized_url = self._normalize_url(url)

        # Create temporary directory for cloning
        with tempfile.TemporaryDirectory(prefix="canvas-chat-git-") as temp_dir:
            repo_path = Path(temp_dir) / repo_name

            # Clone repository
            self._clone_repository(url, repo_path, git_credentials=git_credentials)

            # Build content from selected files, grouped by directory
            content_parts = []
            content_parts.append(f"# {repo_name}\n\n")
            content_parts.append(
                f"**Repository:** [{normalized_url}]({normalized_url})\n\n"
            )

            # Store file content separately for drawer
            # (map of path -> {content, lang, status})
            files_data = {}

            # Group files by directory
            files_by_dir = {}
            root_files = []

            for file_path_str in file_paths:
                # Normalize path to prevent duplication issues
                # Remove any leading slashes and normalize separators
                normalized_path = file_path_str.lstrip("/").replace("\\", "/")
                # Remove consecutive duplicate path segments
                # (e.g., "src/src/vs" -> "src/vs")
                # This handles cases where paths get duplicated during tree building
                path_parts = []
                for part in normalized_path.split("/"):
                    if part:  # Skip empty parts
                        # Only add if it's not the same as the last part
                        # (prevents consecutive duplicates)
                        if not path_parts or part != path_parts[-1]:
                            path_parts.append(part)
                normalized_path = (
                    "/".join(path_parts) if path_parts else normalized_path
                )

                file_path = repo_path / normalized_path
                if not file_path.exists() or not file_path.is_file():
                    logger.warning(
                        f"File not found: {normalized_path} (original: {file_path_str})"
                    )
                    # Store error state for drawer
                    files_data[file_path_str] = {
                        "content": None,
                        "lang": None,
                        "status": "not_found",
                    }

                    # Still add to appropriate group for error display
                    dir_path = str(Path(normalized_path).parent)
                    if dir_path == "." or dir_path == "":
                        root_files.append((normalized_path, None, "not_found", None))
                    else:
                        if dir_path not in files_by_dir:
                            files_by_dir[dir_path] = []
                        files_by_dir[dir_path].append(
                            (normalized_path, None, "not_found", None)
                        )
                    continue

                try:
                    file_ext = Path(normalized_path).suffix.lower()

                    # Handle binary images (PNG, JPG, GIF, WEBP, BMP, ICO)
                    if file_ext in IMAGE_BINARY_EXTENSIONS:
                        file_bytes = file_path.read_bytes()
                        if len(file_bytes) > MAX_IMAGE_SIZE:
                            files_data[file_path_str] = {
                                "content": None,
                                "lang": None,
                                "status": "error",
                                "error": "File too large (max 5MB)",
                            }
                            dir_path = str(Path(normalized_path).parent)
                            if dir_path == "." or dir_path == "":
                                root_files.append(
                                    (normalized_path, None, "error", None)
                                )
                            else:
                                if dir_path not in files_by_dir:
                                    files_by_dir[dir_path] = []
                                files_by_dir[dir_path].append(
                                    (normalized_path, None, "error", None)
                                )
                        else:
                            # Resize image if needed
                            resized_bytes = _resize_image(file_bytes)
                            if resized_bytes is None:
                                # Fallback: use original bytes if resize failed
                                resized_bytes = file_bytes
                            mime_map = {
                                ".png": "image/png",
                                ".jpg": "image/jpeg",
                                ".jpeg": "image/jpeg",
                                ".gif": "image/gif",
                                ".webp": "image/webp",
                                ".bmp": "image/bmp",
                                ".ico": "image/x-icon",
                            }
                            files_data[file_path_str] = {
                                "content": None,
                                "lang": None,
                                "status": "success",
                                "isBinary": True,
                                "imageData": base64.b64encode(resized_bytes).decode(
                                    "ascii"
                                ),
                                "mimeType": mime_map.get(file_ext, "image/png"),
                            }
                            # Add placeholder to content
                            # (no actual code content for images)
                            dir_path = str(Path(normalized_path).parent)
                            placeholder = f"[Image: {normalized_path}]"
                            if dir_path == "." or dir_path == "":
                                root_files.append(
                                    (normalized_path, placeholder, "success", None)
                                )
                            else:
                                if dir_path not in files_by_dir:
                                    files_by_dir[dir_path] = []
                                files_by_dir[dir_path].append(
                                    (normalized_path, placeholder, "success", None)
                                )

                    # Handle SVGs (sanitize and send as text for native rendering)
                    elif file_ext in IMAGE_SVG_EXTENSIONS:
                        try:
                            svg_content = file_path.read_text(encoding="utf-8")
                            sanitized = _sanitize_svg(svg_content)
                            if sanitized is None:
                                # Sanitization failed, treat as plain XML
                                files_data[file_path_str] = {
                                    "content": svg_content,
                                    "lang": "xml",
                                    "status": "success",
                                }
                                dir_path = str(Path(normalized_path).parent)
                                if dir_path == "." or dir_path == "":
                                    root_files.append(
                                        (normalized_path, svg_content, "success", "xml")
                                    )
                                else:
                                    if dir_path not in files_by_dir:
                                        files_by_dir[dir_path] = []
                                    files_by_dir[dir_path].append(
                                        (normalized_path, svg_content, "success", "xml")
                                    )
                            else:
                                # Successfully sanitized, mark as SVG for native
                                # rendering
                                files_data[file_path_str] = {
                                    "content": sanitized,
                                    "lang": None,
                                    "status": "success",
                                    "isSvg": True,
                                }
                                # Add placeholder to content
                                # (no actual code content for SVGs)
                                dir_path = str(Path(normalized_path).parent)
                                placeholder = f"[SVG: {normalized_path}]"
                                if dir_path == "." or dir_path == "":
                                    root_files.append(
                                        (normalized_path, placeholder, "success", None)
                                    )
                                else:
                                    if dir_path not in files_by_dir:
                                        files_by_dir[dir_path] = []
                                    files_by_dir[dir_path].append(
                                        (normalized_path, placeholder, "success", None)
                                    )
                        except Exception as e:
                            logger.warning(f"Failed to read SVG {file_path}: {e}")
                            files_data[file_path_str] = {
                                "content": None,
                                "lang": None,
                                "status": "error",
                            }
                            dir_path = str(Path(normalized_path).parent)
                            if dir_path == "." or dir_path == "":
                                root_files.append(
                                    (normalized_path, None, "error", None)
                                )
                            else:
                                if dir_path not in files_by_dir:
                                    files_by_dir[dir_path] = []
                                files_by_dir[dir_path].append(
                                    (normalized_path, None, "error", None)
                                )

                    # Handle regular text files
                    else:
                        file_content = file_path.read_text(
                            encoding="utf-8", errors="ignore"
                        )

                        # Determine file extension for syntax highlighting
                        file_ext_clean = Path(normalized_path).suffix.lstrip(".")
                        lang = file_ext_clean if file_ext_clean else ""

                        # Store file data for drawer (use original file_path_str as key)
                        files_data[file_path_str] = {
                            "content": file_content,
                            "lang": lang,
                            "status": "success",
                        }

                        # Group by directory
                        dir_path = str(Path(normalized_path).parent)
                        if dir_path == "." or dir_path == "":
                            root_files.append(
                                (file_path_str, file_content, "success", lang)  # noqa: E501
                            )
                        else:
                            if dir_path not in files_by_dir:
                                files_by_dir[dir_path] = []
                            files_by_dir[dir_path].append(
                                (file_path_str, file_content, "success", lang)  # noqa: E501
                            )

                except PermissionError as e:
                    logger.warning(f"Permission denied reading {file_path}: {e}")
                    # Store error state for drawer
                    files_data[file_path_str] = {
                        "content": None,
                        "lang": None,
                        "status": "permission_denied",
                    }
                    dir_path = str(Path(normalized_path).parent)
                    if dir_path == "." or dir_path == "":
                        root_files.append(
                            (normalized_path, None, "permission_denied", None)
                        )
                    else:
                        if dir_path not in files_by_dir:
                            files_by_dir[dir_path] = []
                        files_by_dir[dir_path].append(
                            (normalized_path, None, "permission_denied", None)
                        )
                except Exception as e:
                    logger.warning(f"Failed to read {file_path}: {e}")
                    # Store error state for drawer
                    files_data[file_path_str] = {
                        "content": None,
                        "lang": None,
                        "status": "error",
                    }
                    dir_path = str(Path(normalized_path).parent)
                    if dir_path == "." or dir_path == "":
                        root_files.append((normalized_path, None, "error", None))
                    else:
                        if dir_path not in files_by_dir:
                            files_by_dir[dir_path] = []
                        files_by_dir[dir_path].append(
                            (normalized_path, None, "error", None)
                        )

            # Render files grouped by directory
            # Root files first
            if root_files:
                content_parts.append("## Root Files\n\n")
                for file_path_str, file_content, status, lang in root_files:
                    if status == "not_found":
                        content_parts.append(
                            f"### {file_path_str}\n\n*File not found*\n\n"
                        )
                    elif status == "permission_denied":
                        content_parts.append(
                            f"### {file_path_str}\n\n*Permission denied*\n\n"
                        )
                    elif status == "error":
                        content_parts.append(
                            f"### {file_path_str}\n\n*Failed to read file*\n\n"
                        )
                    else:  # success
                        if lang:
                            content_parts.append(
                                f"### {file_path_str}\n\n"
                                f"```{lang}\n{file_content}\n```\n\n"
                            )
                        else:
                            content_parts.append(
                                f"### {file_path_str}\n\n```\n{file_content}\n```\n\n"
                            )

            # Then directories (sorted)
            for dir_path in sorted(files_by_dir.keys()):
                files = files_by_dir[dir_path]
                file_count = len([f for f in files if f[2] == "success"])
                content_parts.append(f"## Directory: {dir_path}/\n\n")
                if file_count > 0:
                    content_parts.append(
                        f"*{file_count} file{'s' if file_count != 1 else ''} "
                        f"selected*\n\n"
                    )

                for file_path_str, file_content, status, lang in files:
                    if status == "not_found":
                        content_parts.append(
                            f"### {file_path_str}\n\n*File not found*\n\n"
                        )
                    elif status == "permission_denied":
                        content_parts.append(
                            f"### {file_path_str}\n\n*Permission denied*\n\n"
                        )
                    elif status == "error":
                        content_parts.append(
                            f"### {file_path_str}\n\n*Failed to read file*\n\n"
                        )
                    else:  # success
                        if lang:
                            content_parts.append(
                                f"### {file_path_str}\n\n"
                                f"```{lang}\n{file_content}\n```\n\n"
                            )
                        else:
                            content_parts.append(
                                f"### {file_path_str}\n\n```\n{file_content}\n```\n\n"
                            )

            content = "".join(content_parts)
            result = {
                "title": repo_name,
                "content": content,
                "metadata": {
                    "content_type": "git",
                    "files": files_data,  # Map of file paths to file data for drawer
                },
            }

            # Debug: Log what we're returning
            logger.info(
                f"GitRepoHandler.fetch_selected_files returning: "
                f"has_metadata={bool(result.get('metadata'))}, "
                f"metadata_keys={list(result.get('metadata', {}).keys())}, "
                f"files_count={len(result.get('metadata', {}).get('files', {}))}, "
                f"files_keys={list(result.get('metadata', {}).get('files', {}).keys())[:5]}"  # noqa: E501
            )

            return result

    async def fetch_url(self, url: str) -> dict[str, any]:
        """Fetch URL content using smart defaults (for backward compatibility).

        Args:
            url: Git repository URL

        Returns:
            Dictionary with:
            - "title": str - Repository name
            - "content": str - Markdown content from smart default files

        Raises:
            Exception: If repository cannot be cloned or accessed
        """
        # Get file tree
        file_tree = await self.list_files(url)
        if not file_tree:
            raise Exception("Failed to list repository files")

        # Get smart defaults
        default_files = self._get_smart_default_files(file_tree)

        # If no smart defaults, return directory structure
        if not default_files:
            repo_name = self._extract_repo_name(url)
            normalized_url = self._normalize_url(url)
            content_parts = []
            content_parts.append(f"# {repo_name}\n\n")
            content_parts.append(
                f"**Repository:** [{normalized_url}]({normalized_url})\n\n"
            )
            content_parts.append("## Repository Structure\n\n")
            content_parts.append("```\n")
            for item in file_tree["files"]:
                if item["type"] == "directory":
                    content_parts.append(f"{item['path']}/\n")
                else:
                    content_parts.append(f"{item['path']}\n")
            content_parts.append("```\n\n")
            content = "".join(content_parts)
            return {"title": repo_name, "content": content}

        # Fetch selected files
        return await self.fetch_selected_files(url, default_files)


# Register git repository handler
UrlFetchRegistry.register(
    id="git-repo",
    url_patterns=[
        r"^https?://(github|gitlab|bitbucket|gitea|codeberg)\.(com|org)/[\w\-\.]+/[\w\-\.]+(?:\.git)?/?$",
        r"^git@[\w\-\.]+:[\w\-\.]+/[\w\-\.]+(?:\.git)?$",
        r"^https?://[\w\-\.]+/([\w\-\.]+/)+[\w\-\.]+(?:\.git)?/?$",
    ],
    handler=GitRepoHandler,
    priority=PRIORITY["BUILTIN"],
)

logger.info("Git repository URL fetch handler plugin loaded")


# =============================================================================
# FastAPI Endpoint Registration
# =============================================================================


def register_endpoints(app):
    """Register FastAPI endpoints for git repository handling.

    This function is called from app.py to register plugin-specific endpoints.
    This keeps the endpoints self-contained within the plugin.

    Args:
        app: FastAPI application instance
    """
    from fastapi import HTTPException
    from pydantic import BaseModel

    # Request/Response models (defined here to keep them with the plugin)
    class ListFilesRequest(BaseModel):
        """Request body for listing files in a git repository."""

        url: str
        git_credentials: dict[str, str] | None = None
        # Optional: Map of git host (e.g., 'github.com') to credential (PAT)

    class FileTreeItem(BaseModel):
        """File tree item structure."""

        path: str
        type: str  # "file" or "directory"
        size: int | None = None
        children: list["FileTreeItem"] | None = None

    class ListFilesResult(BaseModel):
        """Result from listing files."""

        url: str
        files: list[FileTreeItem]

    class FetchFilesRequest(BaseModel):
        """Request body for fetching selected files from a git repository."""

        url: str
        file_paths: list[str]
        git_credentials: dict[str, str] | None = None
        # Optional: Map of git host (e.g., 'github.com') to credential (PAT)

    @app.post("/api/url-fetch/list-files", response_model=ListFilesResult)
    async def list_url_fetch_files(request: ListFilesRequest):
        """List files available for selection from a URL (plugin-based).

        Uses UrlFetchRegistry to find the appropriate handler for the URL.
        Only handlers that support file listing (have list_files method) can be used.
        """
        logger.info(f"List URL fetch files request: url='{request.url}'")

        try:
            handler_config = UrlFetchRegistry.find_handler(request.url)
            if not handler_config:
                raise HTTPException(
                    status_code=400,
                    detail="URL is not supported by any registered handler",
                )

            handler = handler_config["handler"]()
            if not hasattr(handler, "list_files"):
                raise HTTPException(
                    status_code=400, detail="Handler does not support file listing"
                )

            file_tree = await handler.list_files(
                request.url, git_credentials=request.git_credentials
            )
            if file_tree is None:
                raise HTTPException(
                    status_code=400,
                    detail="Handler does not support file listing for this URL",
                )
            return ListFilesResult(url=request.url, files=file_tree["files"])
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"List URL fetch files failed: {e}")
            import traceback

            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e

    @app.post("/api/url-fetch/fetch-files")
    async def fetch_url_fetch_files(request: FetchFilesRequest):
        """Fetch content from selected files from a URL (plugin-based).

        Uses UrlFetchRegistry to find the appropriate handler for the URL.
        """
        # Import here to avoid circular import (app.py imports this module at module level)  # noqa: E501
        # Import inside the endpoint handler, not in register_endpoints
        from canvas_chat.app import FetchUrlResult

        logger.info(
            f"Fetch URL fetch files request: url='{request.url}', "
            f"files={len(request.file_paths)}"
        )

        try:
            handler_config = UrlFetchRegistry.find_handler(request.url)
            if not handler_config:
                raise HTTPException(
                    status_code=400,
                    detail="URL is not supported by any registered handler",
                )

            handler = handler_config["handler"]()
            result = await handler.fetch_selected_files(
                request.url,
                request.file_paths,
                git_credentials=request.git_credentials,
            )

            # Debug: Log what handler returned
            metadata = result.get("metadata", {})
            files = metadata.get("files", {}) if metadata else {}
            logger.info(
                f"Handler fetch_selected_files returned: has_metadata={bool(metadata)}, "  # noqa: E501
                f"metadata_keys={list(metadata.keys()) if metadata else []}, "
                f"files_count={len(files)}"
            )

            # Ensure metadata is a plain dict (not Y.Map or other CRDT type)
            # Deep copy to ensure it's a plain Python dict, not a Y.Map or other type
            import json

            if metadata:
                try:
                    # Test if metadata is JSON-serializable by serializing and deserializing  # noqa: E501
                    metadata_json = json.dumps(metadata)
                    metadata = json.loads(metadata_json)
                    logger.info(
                        f"Metadata converted to plain dict via JSON: keys={list(metadata.keys())}"  # noqa: E501
                    )
                except (TypeError, ValueError) as e:
                    logger.error(f"Metadata is not JSON-serializable: {e}")
                    # Fallback: try to convert manually
                    if not isinstance(metadata, dict):
                        metadata = dict(metadata)
                    else:
                        # Recursively convert nested dicts
                        def convert_to_plain_dict(obj):
                            if isinstance(obj, dict):
                                return {
                                    k: convert_to_plain_dict(v) for k, v in obj.items()
                                }
                            elif isinstance(obj, list):
                                return [convert_to_plain_dict(item) for item in obj]
                            else:
                                return obj

                        metadata = convert_to_plain_dict(metadata)
                        logger.info(
                            f"Metadata converted to plain dict manually: keys={list(metadata.keys())}"  # noqa: E501
                        )

            # Return result with metadata (files data for git repo drawer)
            try:
                # Debug: Log metadata before creating FetchUrlResult
                logger.info(
                    f"Creating FetchUrlResult with metadata: "
                    f"type={type(metadata)}, "
                    f"is_dict={isinstance(metadata, dict)}, "
                    f"has_files={'files' in metadata if isinstance(metadata, dict) else False}, "  # noqa: E501
                    f"files_type={type(metadata.get('files')) if isinstance(metadata, dict) else None}"  # noqa: E501
                )

                fetch_result = FetchUrlResult(
                    url=request.url,
                    title=result["title"],
                    content=result["content"],
                    metadata=metadata,
                )

                # Debug: Check metadata directly on the object (before serialization)
                try:
                    direct_metadata = fetch_result.metadata
                    logger.info(
                        f"FetchUrlResult.metadata (direct access): "
                        f"type={type(direct_metadata)}, "
                        f"is_dict={isinstance(direct_metadata, dict)}, "
                        f"keys={list(direct_metadata.keys()) if isinstance(direct_metadata, dict) else []}, "  # noqa: E501
                        f"has_files={'files' in direct_metadata if isinstance(direct_metadata, dict) else False}"  # noqa: E501
                    )
                except Exception as e:
                    logger.error(
                        f"Failed to access fetch_result.metadata directly: {e}"  # noqa: E501
                    )

                # Verify serialization works
                serialized = fetch_result.model_dump()
                logger.info(
                    f"FetchUrlResult.model_dump() result: "
                    f"has_metadata={bool(serialized.get('metadata'))}, "
                    f"metadata_keys={list(serialized.get('metadata', {}).keys())}, "
                    f"files_count={len(serialized.get('metadata', {}).get('files', {}))}"  # noqa: E501
                )
                return fetch_result
            except Exception as create_error:
                logger.error(f"Failed to create FetchUrlResult: {create_error}")
                import traceback

                logger.error(traceback.format_exc())
                raise
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Fetch URL fetch files failed: {e}")
            import traceback

            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=str(e)) from e
