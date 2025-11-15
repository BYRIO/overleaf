#!/bin/bash

# Load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

# Check if at least one argument is provided
if [ $# -lt 1 ]; then
    echo "Please provide a username as an argument."
    exit 1
fi

# Assign the first argument to username
username="$1"
echo "I am using the username ${username}"

# Clone projects list
\rm -rf ./projects
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${GITBACKUP_SSH_PORT} -i ${DOWNLOADS_DIR}/${username}/.ssh/overleafcep" git clone ssh://${username}@localhost/projects.git

# File path
FILE="projects/projects.txt"

# Check if file exists
if [[ ! -f "$FILE" ]]; then
    echo "Error: File $FILE not found" >&2
    exit 1
fi

# Extract the first UUID using grep and head
first_uuid=$(grep -o '^[a-f0-9]\{24\}' "$FILE" | head -n1)

# Check if UUID was found
if [[ -z "$first_uuid" ]]; then
    echo "Error: No UUID found in $FILE" >&2
    exit 1
fi

# Output the UUID
echo "Clone the first project ${first_uuid}"
\rm -rf ./${first_uuid}
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${GITBACKUP_SSH_PORT} -i ${DOWNLOADS_DIR}/${username}/.ssh/overleafcep" git clone ssh://${username}@localhost/${first_uuid}.git

