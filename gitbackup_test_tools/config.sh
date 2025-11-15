#!/bin/bash
# Gitbackup configuration
# This file is sourced by test scripts to find paths dynamically

DOCKER_BASE="/data_1/docker/compose_cep/overleafserver/"

# Compose file location
COMPOSE_FILE="${DOCKER_BASE}compose.yaml"

# Downloads directory (where SSH keys are stored)
DOWNLOADS_DIR="${DOCKER_BASE}data_gitbackup/downloads"

# SSH port for gitbackup
GITBACKUP_SSH_PORT="22"

# Overleaf container name (can be read from compose file)
if [ -f "${COMPOSE_FILE}" ]; then
    OVERLEAF_CONTAINER_NAME=$(grep "container_name:" "${COMPOSE_FILE}" | head -1 | sed 's/.*container_name:[[:space:]]*//g' | xargs)
else
    OVERLEAF_CONTAINER_NAME="overleafserver"
fi

# Export variables so they're available to scripts that source this
export COMPOSE_FILE
export DOWNLOADS_DIR
export GITBACKUP_SSH_PORT
export OVERLEAF_CONTAINER_NAME
