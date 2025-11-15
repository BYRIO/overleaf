#!/bin/bash
set -e

echo "Pre-shutdown: Stopping gitbackup services..."

# STEP 1: Stop the gitbackup-manager service first
echo "Stopping gitbackup-manager service..."
sv stop gitbackup-manager 2>/dev/null || true

# STEP 2: Wait a moment for the service to stop
sleep 2

# STEP 3: Force kill the node process if still running
MANAGER_PID=$(pgrep -f "node.*gitbackup-manager" || true)
if [ -n "$MANAGER_PID" ]; then
  echo "Force stopping gitbackup-manager process (PID: $MANAGER_PID)"
  kill -9 "$MANAGER_PID" 2>/dev/null || true
  sleep 1
fi

# STEP 4: Now stop and remove the gitbackup container
if [ -S /var/run/docker.sock ]; then
  GITBACKUP_CONTAINER="${GITBACKUP_CONTAINER_NAME:-gitbackup}"
  
  echo "Stopping gitbackup container via Docker API..."
  curl -s --unix-socket /var/run/docker.sock \
    -X POST "http://localhost/containers/${GITBACKUP_CONTAINER}/stop?t=10" 2>/dev/null || true
  
  sleep 1
  
  echo "Removing gitbackup container via Docker API..."
  curl -s --unix-socket /var/run/docker.sock \
    -X DELETE "http://localhost/containers/${GITBACKUP_CONTAINER}?force=true" 2>/dev/null || true
  
  echo "Gitbackup container stopped and removed"
fi

echo "Gitbackup cleanup complete"
exit 0
