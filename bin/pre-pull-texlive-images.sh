#!/usr/bin/env bash
set -euo pipefail

# Pull TexLive images specified in ALL_TEX_LIVE_DOCKER_IMAGES or TEX_LIVE_DOCKER_IMAGE
# Usage: ALL_TEX_LIVE_DOCKER_IMAGES="texlive/texlive:latest,texlive/texlive:2023" ./bin/pre-pull-texlive-images.sh

ALL_IMAGES_VAR=${ALL_TEX_LIVE_DOCKER_IMAGES:-}
DEFAULT_IMAGE=${TEX_LIVE_DOCKER_IMAGE:-}

if [[ -z "$ALL_IMAGES_VAR" && -z "$DEFAULT_IMAGE" ]]; then
  echo "No images found in ALL_TEX_LIVE_DOCKER_IMAGES or TEX_LIVE_DOCKER_IMAGE. Nothing to pull."
  exit 0
fi

# Compose list: if ALL_IMAGES_VAR empty, use DEFAULT_IMAGE; dedupe
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

# If default is provided but not in list, ensure it's included
if [[ -n "$DEFAULT_IMAGE" ]]; then
  included=false
  for i in "${IMAGES[@]}"; do
    if [[ "$i" == "$DEFAULT_IMAGE" ]]; then
      included=true
      break
    fi
  done
  if [[ "$included" == false ]]; then
    IMAGES+=("$DEFAULT_IMAGE")
  fi
fi

# Remove duplicates while preserving order
declare -A seen
unique_images=()
for i in "${IMAGES[@]}"; do
  if [[ -z "${seen[$i]:-}" ]]; then
    unique_images+=("$i")
    seen[$i]=1
  fi
done

# Pull images
for img in "${unique_images[@]}"; do
  echo "Pulling $img..."
  if ! docker pull "$img"; then
    echo "Warning: failed to pull $img" >&2
  fi
done

echo "Done pulling TexLive images."
