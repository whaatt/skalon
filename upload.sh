#!/bin/bash
# File: upload.sh
# Description: Upload content to Skalon.

# See https://stackoverflow.com/questions/4774054 for details.
SCRIPT_DIRECTORY=$(
    cd "$(dirname "$0")" >/dev/null 2>&1
    pwd -P
)

REMOTE_USERNAME="whaatt00"
REMOTE_DOMAIN="skalon.com"
REMOTE_PORT="7822"
REMOTE_PATH="public_html"

rsync -avz --exclude-from="$SCRIPT_DIRECTORY/.uploadignore" \
    -e "ssh -p $REMOTE_PORT" . $REMOTE_USERNAME@$REMOTE_DOMAIN:$REMOTE_PATH \
    --delete
