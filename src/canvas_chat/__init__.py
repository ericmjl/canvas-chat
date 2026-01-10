"""Canvas Chat - A visual, non-linear chat interface."""

try:
    from importlib.metadata import version

    __version__ = version("canvas-chat")
except Exception:
    # Fallback when package metadata is not available (e.g., Modal deployment)
    # Read directly from pyproject.toml
    import tomllib
    from pathlib import Path

    # Try multiple possible locations for pyproject.toml
    current_file = Path(__file__)
    possible_paths = [
        Path("/app/pyproject.toml"),  # Modal deployment
        current_file.parent.parent.parent / "pyproject.toml",  # Local development
        current_file.parent.parent / "pyproject.toml",  # Alternative local path
    ]

    __version__ = "0.0.0"
    for pyproject_path in possible_paths:
        if pyproject_path.exists():
            try:
                with open(pyproject_path, "rb") as f:
                    data = tomllib.load(f)
                    __version__ = data["project"]["version"]
                    break
            except Exception:
                continue
