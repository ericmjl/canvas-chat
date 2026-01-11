#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Add blog frontmatter to all release notes.

This script adds YAML frontmatter with date and categories to each release note file.
Dates are extracted from git tag timestamps.

For future releases, llamabot will create files in docs/releases/posts/ and they will
need frontmatter added manually or via this script.
"""

import subprocess
from datetime import datetime
from pathlib import Path


def get_git_tag_date(tag: str) -> str:
    """Get the date of a git tag in YYYY-MM-DD format."""
    result = subprocess.run(
        ["git", "log", "-1", "--format=%ai", tag],
        capture_output=True,
        text=True,
        check=True,
    )
    # Parse timestamp like "2026-01-10 15:51:03 +0000"
    timestamp_str = result.stdout.strip()
    dt = datetime.strptime(timestamp_str.split()[0], "%Y-%m-%d")
    return dt.strftime("%Y-%m-%d")


def has_frontmatter(content: str) -> bool:
    """Check if file already has YAML frontmatter."""
    return content.startswith("---\n")


def add_frontmatter(file_path: Path, date: str) -> None:
    """Add blog frontmatter to a release note file."""
    # Read existing content
    content = file_path.read_text()

    # Skip if already has frontmatter
    if has_frontmatter(content):
        print(f"✓ {file_path.name} already has frontmatter, skipping")
        return

    # Create frontmatter
    frontmatter = f"""---
date: {date}
categories:
  - Releases
---

"""

    # Prepend frontmatter to content
    new_content = frontmatter + content

    # Write back to file
    file_path.write_text(new_content)
    print(f"✓ Added frontmatter to {file_path.name} (date: {date})")


def main():
    """Process all release note files."""
    releases_dir = Path("docs/releases/posts")

    # Get all release markdown files
    release_files = sorted(releases_dir.glob("v*.md"))

    print(f"Found {len(release_files)} release files\n")

    for file_path in release_files:
        # Extract version from filename (e.g., "v0.1.47" from "v0.1.47.md")
        version = file_path.stem

        try:
            # Get git tag date
            date = get_git_tag_date(version)

            # Add frontmatter
            add_frontmatter(file_path, date)

        except subprocess.CalledProcessError:
            print(f"⚠ Warning: No git tag found for {version}, skipping")
            continue

    print("\n✅ Frontmatter added to all release files!")


if __name__ == "__main__":
    main()
