#!/usr/bin/env bash
set -euo pipefail
PACKAGE="${AGENTSAM_PACKAGE:-@inneranimalmedia/agentsam-sdk}"
echo "Uninstalling $PACKAGE ..."
npm uninstall --global "$PACKAGE" || true
echo "Note: ~/.agentsam credentials are left in place. Remove manually if desired."
