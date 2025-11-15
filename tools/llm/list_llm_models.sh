#!/bin/bash

# Check if API key is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <API_KEY> [BASE_URL]"
    echo "  API_KEY: Your API key (required)"
    echo "  BASE_URL: Optional base URL (default: https://chat-ai.academiccloud.de/v1)"
    exit 1
fi

API_KEY="$1"
BASE_URL="${2:-https://chat-ai.academiccloud.de/v1}"

echo "Using BASE_URL: ${BASE_URL}"
echo ""

# Fetch and display available models
curl -s "${BASE_URL}/models" \
    -H "Authorization: Bearer ${API_KEY}" \
    | jq -r '.data[].id'
