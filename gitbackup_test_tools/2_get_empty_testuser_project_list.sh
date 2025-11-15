#!/bin/bash
# get_empty_testuser_project_list.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

\rm -rf ./projects
GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${GITBACKUP_SSH_PORT} -i ${DOWNLOADS_DIR}/joe@example.com/.ssh/overleafcep" git clone ssh://joe@example.com@localhost/projects.git
