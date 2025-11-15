#!/bin/bash
set -e

echo "Setting up gitbackup environment..."

# Only proceed if gitbackup is enabled
if [ "${GITBACKUP_ENABLED}" != "true" ]; then
    echo "Gitbackup is disabled, skipping setup"
    exit 0
fi

# Create gitbackup data directories if they don't exist
GITBACKUP_DATA_DIR="${GITBACKUP_DATA_DIR:-/var/lib/overleaf/gitbackup}"
mkdir -p "${GITBACKUP_DATA_DIR}/downloads"
mkdir -p "${GITBACKUP_DATA_DIR}/log"
mkdir -p "${GITBACKUP_DATA_DIR}/etc"

chown -R www-data:www-data "${GITBACKUP_DATA_DIR}"
chmod -R 755 "${GITBACKUP_DATA_DIR}"

echo "Gitbackup directories created:"
echo "  ${GITBACKUP_DATA_DIR}/downloads"
echo "  ${GITBACKUP_DATA_DIR}/log"
echo "  ${GITBACKUP_DATA_DIR}/etc"

# Create log directory for gitbackup manager
mkdir -p /var/log/overleaf
touch /var/log/overleaf/gitbackup-manager.log
chown www-data:www-data /var/log/overleaf/gitbackup-manager.log

# Check if docker socket is available
if [ ! -S /var/run/docker.sock ]; then
    echo "WARNING: Docker socket not found at /var/run/docker.sock"
    echo "Gitbackup will not be able to start without Docker socket access"
    echo "Please mount /var/run/docker.sock into the container"
fi

echo "Gitbackup setup complete"
