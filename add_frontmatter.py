#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Add blog frontmatter to all release notes.

This script adds YAML frontmatter with date (including time) and categories to each
release note file. Dates and times are extracted from git tag timestamps to ensure
correct ordering when multiple releases occur on the same day.

For future releases, llamabot will create files in docs/releases/posts/ and they will
need frontmatter added manually or via this script.
"""

import subprocess
from datetime import datetime
from pathlib import Path


def get_git_tag_date(tag: str) -> str:
    """Get the date and time of a git tag in YYYY-MM-DD HH:MM:SS format."""
    result = subprocess.run(
        ["git", "log", "-1", "--format=%ai", tag],
        capture_output=True,
        text=True,
        check=True,
    )
    # Parse timestamp like "2026-01-10 15:51:03 +0000"
    timestamp_str = result.stdout.strip()
    # Extract date and time components (ignore timezone for simplicity)
    date_time_str = " ".join(timestamp_str.split()[:2])
    dt = datetime.strptime(date_time_str, "%Y-%m-%d %H:%M:%S")
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def has_frontmatter(content: str) -> bool:
    """Check if file already has YAML frontmatter."""
    return content.startswith("---\n")


def add_frontmatter(file_path: Path, date: str) -> None:
    """Add or update blog frontmatter in a release note file."""
    # Read existing content
    content = file_path.read_text()

    # If has frontmatter, remove it to get the body content
    if has_frontmatter(content):
        # Find the end of frontmatter (second "---")
        lines = content.split("\n")
        end_idx = None
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                end_idx = i
                break

        if end_idx is not None:
            # Extract content after frontmatter (skip closing --- and blank line)
            body_content = "\n".join(lines[end_idx + 1 :]).lstrip("\n")
        else:
            # Malformed frontmatter, use original content
            body_content = content
    else:
        body_content = content

    # Create new frontmatter
    frontmatter = f"""---
date: {date}
categories:
  - Releases
---

"""

    # Combine frontmatter and body
    new_content = frontmatter + body_content

    # Write back to file
    file_path.write_text(new_content)
    print(f"✓ Updated {file_path.name} with timestamp (date: {date})")


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
