#!/bin/bash

# --- Persistent User Setup ---
# Define paths for persistent user files
PERSISTENT_PASSWD="/etc/passwd"
# Path to the tar backup created in the Dockerfile
ETC_BACKUP_TAR="/etc_backup.tgz"

# Check if /etc/passwd (and thus others) is empty or doesn't exist on the mounted volume.
# This assumes that if passwd is empty, the others are too, which is true for a fresh mount.
if [ ! -s "${PERSISTENT_PASSWD}" ]; then
    echo "Persistent user files not found or empty. Initializing from system defaults..."
    tar -xf "${ETC_BACKUP_TAR}" -C /
    echo "Persistent user files initialized."
else
    echo "Persistent user files already exist. Skipping initialization."
fi
# --- End Persistent User Setup ---

# RUNTIME-ONLY TASKS - Things that must happen at container startup

# Docker socket permissions (RUNTIME - socket may be mounted)
if [ -S /var/run/docker.sock ]; then
    echo "Setting Docker socket permissions..."
    chmod 666 /var/run/docker.sock
fi

mkdir -p /etc/overleaf
cat > /etc/overleaf/docker-env << EOF
export OVERLEAF_MONGO_URL="$OVERLEAF_MONGO_URL"
export OVERLEAF_CONTAINER_NAME="$OVERLEAF_CONTAINER_NAME"
EOF


# Start services
/usr/sbin/syslogd -n &
(/usr/bin/date ; /usr/bin/python3 /check_and_create_new_users.py ) 2>&1 | /usr/bin/logger
/usr/sbin/sshd -D &
/usr/sbin/cron -f &

sleep infinity

