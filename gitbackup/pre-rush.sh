#!/bin/bash
# Source Docker environment variables
if [ -f /etc/overleaf/docker-env ]; then
    source /etc/overleaf/docker-env
fi


# List of repos to be ignored
IGNORE_REPOS=(
    "projects"
)

# Function to check if a string contains any repos to be ignored
check_repos_to_be_ignored() {
    local input="$1"
    for word in "${IGNORE_REPOS[@]}"; do
        if [[ "$input" == *"$word"* ]]; then
            return 1  # found repo to be ignored
        fi
    done
    return 0  # No repos to be ignored found
}

# Function to validate the command format and extract the repository ID
validate_and_extract() {
    local command="$1"
    
    # Check if command starts with "git-upload-pack '/" and ends with ".git'"
    if [[ ! "$command" =~ ^git-upload-pack\ \'/.+\.git\'$ ]]
    then
        echo "Invalid command format" >&2
        exit 1
    fi
    
    # Extract the string between "git-upload-pack '/" and ".git'"
    # Using parameter expansion to remove prefix and suffix
    local temp="${command#git-upload-pack \'/}"  # Remove prefix
    local repo_id="${temp%%.git\'}"             # Remove suffix
    
    # Validate that we actually extracted something
    if [ -z "$repo_id" ]; then
        echo "Failed to extract repository ID" >&2
        exit 1
    fi
    
    # Return the extracted repository ID
    echo "$repo_id"
}

# Main execution
if [ -z "$SSH_ORIGINAL_COMMAND" ]; then
    echo "SSH_ORIGINAL_COMMAND is empty" >&2
    exit 1
fi

# Validate and extract the repository ID
REPO_ID=$(validate_and_extract "$SSH_ORIGINAL_COMMAND")


if [ -n "$REPO_ID" ]
then

    if check_repos_to_be_ignored "$REPO_ID"
    then
        # Run your post-login scripts
        python3 /get_project.py ${USER} ${REPO_ID} > /dev/null 2>&1
    fi

    # Check if REPO_ID is equal to "projects"
    if [ "$REPO_ID" == "projects" ]
    then
        # Run your post-login scripts if condition is met
        python3 /get_project_list.py ${USER} > /dev/null 2>&1

    fi
fi

# Finally, execute rush with chroot inside
/usr/sbin/rush

