#!/usr/bin/env bash
set -euo pipefail

# Health check helper: verifies configured TexLive images are present locally.
# - Reads ALL_TEX_LIVE_DOCKER_IMAGES and/or TEX_LIVE_DOCKER_IMAGE env vars (comma-separated list)
# - Returns 0 if all images are present or AUTO_PULL is false and images aren't required
# - Returns non-zero if any are missing. If AUTO_PULL_TEXLIVE_IMAGE=true and docker is not
#   available then this returns non-zero.

ALL_IMAGES_VAR=${ALL_TEX_LIVE_DOCKER_IMAGES:-}
DEFAULT_IMAGE=${TEX_LIVE_DOCKER_IMAGE:-}
AUTO_PULL=${AUTO_PULL_TEXLIVE_IMAGE:-}
FAIL_ON_MISSING=${FAIL_ON_MISSING_TEXLIVE_IMAGE:-false}

IMAGES=()
if [[ -n "$ALL_IMAGES_VAR" ]]; then
  IFS=',' read -ra ARR <<< "$ALL_IMAGES_VAR"
  for v in "${ARR[@]}"; do
    trimmed=$(echo "$v" | xargs)
    if [[ -n "$trimmed" ]]; then
      IMAGES+=("$trimmed")
    fi
  done
elif [[ -n "$DEFAULT_IMAGE" ]]; then
  IMAGES+=("$DEFAULT_IMAGE")
fi

# If nothing declared, consider health check OK (no images managed)
if [[ ${#IMAGES[@]} -eq 0 ]]; then
  exit 0
fi

# Helper: check if docker CLI is available and can reach the daemon
docker_available=false
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    docker_available=true
  fi
fi

if [[ "$AUTO_PULL" == "true" && "$docker_available" != "true" ]]; then
  echo "ERROR: AUTO_PULL_TEXLIVE_IMAGE=true but docker CLI/socket not available. Container health: Unhealthy" >&2
  if [[ "$FAIL_ON_MISSING" == "true" ]]; then
    exit 1
  else
    exit 1
  fi
fi

# Check images
missing=()
for img in "${IMAGES[@]}"; do
  if [[ -z "${img}" ]]; then
    continue
  fi
  if [[ "$docker_available" == "true" ]]; then
    if ! docker image inspect "$img" >/dev/null 2>&1; then
      missing+=("$img")
    fi
  else
    # If docker not available and auto pull is false, then treat as healthy only if images are not required
    if [[ "$AUTO_PULL" == "true" ]]; then
      missing+=("$img")
    fi
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  for m in "${missing[@]}"; do
    echo "Missing image: $m" >&2
  done
  echo "Container health unhealthy: missing TexLive images" >&2
  exit 1
fi

# All good
exit 0
