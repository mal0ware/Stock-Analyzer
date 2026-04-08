#!/bin/bash
# DEPRECATED — use package-linux.sh instead.
# This script is kept for backwards compatibility and delegates to the new script.
echo "NOTE: package.sh is deprecated. Using package-linux.sh instead."
echo ""
exec "$(dirname "$0")/package-linux.sh" "$@"
