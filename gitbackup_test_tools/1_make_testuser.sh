#!/bin/bash
# make_testuser.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/config.sh"

docker exec ${OVERLEAF_CONTAINER_NAME} /bin/bash -ce "cd /overleaf/services/web && node modules/server-ce-scripts/scripts/create-user --email=joe@example.com"
