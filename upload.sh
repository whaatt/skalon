# File: upload.sh
# Description: Upload content to Skalon.

# See https://stackoverflow.com/questions/4774054 for details.
SCRIPT_DIRECTORY=$(
    cd "$(dirname "$0")" >/dev/null 2>&1
    pwd -P
)

USERNAME="whaatt00"
DOMAIN="skalon.com"
PORT="7822"
PATH="public_html"

rsync -avz --exclude-from="$SCRIPT_DIRECTORY/.uploadignore" -e "ssh -p $PORT" . $USERNAME@$DOMAIN:$PATH
