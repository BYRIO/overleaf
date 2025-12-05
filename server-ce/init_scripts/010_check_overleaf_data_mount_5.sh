#!/bin/bash
set -e

# This preflight check ensures that /var/lib/overleaf is actually a bind mount
# to the host. Starting without a host volume at /var/lib/overleaf is almost
# always a misconfiguration (data won't persist and sandboxed compiles will
# fail due to missing host directories). Make the mount mandatory so operators
# are less likely to accidentally start an ephemeral container.

DIR=/var/lib/overleaf

# Allow tests or special setups to skip this check explicitly with an env var.
if [[ "${OVERLEAF_SKIP_BIND_MOUNT_CHECK}" == "true" ]]; then
  exit 0
fi

print_help() {
  cat <<'EOF'
------------------------------------------------------------------------
  ERROR: Host data directory is not mounted into the container.

  To persist projects and enable Sandbox Compiles you must mount a host
  directory into the container as /var/lib/overleaf. For example (docker
  compose):

      services:
        sharelatex:
          volumes:
            - ./data:/var/lib/overleaf

  Or set an alternative host dir and bind-mount it into the container.
  If you run Server Pro, ensure the same host directory is mounted into the
  `clsi` service (or mount specific compiles/output directories).

  Refusing to start to avoid accidental data loss and misconfigured sandboxed compiles.
------------------------------------------------------------------------
EOF
}

# Best-effort mount point detection
if command -v mountpoint >/dev/null 2>&1; then
  if ! mountpoint -q "$DIR"; then
    echo "FATAL: $DIR not mounted as a host bind mount." >&2
    print_help
    sleep 10
    # Exit code 101 indicates missing host bind mount
    exit 101
  fi
else
  # Fall back to /proc/self/mountinfo check when mountpoint command absent
  if ! awk '{print $5}' /proc/self/mountinfo | grep -Fxq "$DIR"; then
    echo "FATAL: $DIR not mounted as a host bind mount (no mountpoint command)." >&2
    print_help
    sleep 10
    # Exit code 101 indicates missing host bind mount
    exit 101
  fi
fi

# Check that it is a directory
if [[ ! -d "$DIR" ]]; then
  echo "FATAL: $DIR exists but is not a directory." >&2
  sleep 2
  # Exit code 102 indicates present but not a directory
  exit 102
fi

# Check that it is writable by the container user
if [[ ! -w "$DIR" ]]; then
  echo "FATAL: $DIR is not writable by the container user. Check permissions and ownership (www-data)." >&2
  sleep 2
  # Exit code 103 indicates not writable
  exit 103
fi

exit 0
