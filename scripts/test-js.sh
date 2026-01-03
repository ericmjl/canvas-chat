#!/bin/bash
# Run all JavaScript tests
# This script is called by both package.json and pyproject.toml to avoid duplication

set -e

node tests/test_utils.js && node tests/test_search.js && node tests/test_ui.js
