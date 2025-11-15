import argh  # type: ignore
import shutil
import os
import subprocess
import glob
import docker  # type: ignore
import pymongo
import bson
from urllib.parse import urlparse

def get_user_id(username: str) -> bson.objectid.ObjectId | None:

    # Get the MongoDB URL from the environment variable
    mongo_url: str = os.environ.get("OVERLEAF_MONGO_URL")

    if not mongo_url:
        print("Error: OVERLEAF_MONGO_URL environment variable not set.")
        # You might want to exit or raise an exception here
        exit(1)

    try:
        # Parse the MongoDB URL
        parsed_url = urlparse(mongo_url)

        # Extract host and port
        container_name: str = parsed_url.hostname
        port: int = parsed_url.port if parsed_url.port else 27017  # Default MongoDB port

        # Extract database name (remove leading slash if present)
        database_name: str = parsed_url.path.strip('/')

        # Validate extracted values
        if not container_name:
            raise ValueError("Could not extract hostname from OVERLEAF_MONGO_URL.")
        if not database_name:
            raise ValueError("Could not extract database name from OVERLEAF_MONGO_URL.")

        # Connect to MongoDB using the extracted information
        client = pymongo.MongoClient(container_name, port)
        db = client[database_name]  # Access database using the extracted name

        user_query_filter = {"email": username}

        # Use find_one() to get a single document that matches the query
        selected_user = db.users.find_one(user_query_filter)

        if selected_user:
            client.close()
            return selected_user["_id"]

    except Exception as e:
        print(f"An error occurred: {e}")
        exit(1)
    finally:
        if 'client' in locals() and client:
            client.close()

    return None


def check_project_access(user_id: bson.objectid.ObjectId, project_id: str,) -> bool:
    """
    Check if a user has access to a specific project.

    Args:
        user_id: The ObjectId of the user
        project_id: The string representation of the project's _id
    Returns:
        bool: True if the user has access to the project, False otherwise
    """

    # Get the MongoDB URL from the environment variable
    mongo_url: str = os.environ.get("OVERLEAF_MONGO_URL")

    if not mongo_url:
        print("Error: OVERLEAF_MONGO_URL environment variable not set.")
        # You might want to exit or raise an exception here
        exit(1)

    try:
        # Parse the MongoDB URL
        parsed_url = urlparse(mongo_url)

        # Extract host and port
        container_name: str = parsed_url.hostname
        port: int = parsed_url.port if parsed_url.port else 27017  # Default MongoDB port

        # Extract database name (remove leading slash if present)
        database_name: str = parsed_url.path.strip('/')

        # Validate extracted values
        if not container_name:
            raise ValueError("Could not extract hostname from OVERLEAF_MONGO_URL.")
        if not database_name:
            raise ValueError("Could not extract database name from OVERLEAF_MONGO_URL.")

        # Connect to MongoDB using the extracted information
        client = pymongo.MongoClient(container_name, port)
        db = client[database_name]  # Access database using the extracted name

        # Convert project_id string to ObjectId
        project_object_id = bson.objectid.ObjectId(project_id)

        # Create query filter to check if the specific project exists
        # and if the user has access to it
        project_query_filter = {
            "_id": project_object_id,  # Specific project ID
            "$or": [
                {"owner_ref": user_id},  # User is the owner
                {"collaberator_refs": user_id},  # User is a collaborator
                {"readOnly_refs": user_id},  # User has read-only access
            ],
        }

        # Check if any matching document exists
        # Using count_documents with limit=1 is efficient for just checking existence
        has_access = db.projects.count_documents(project_query_filter, limit=1) > 0

        return has_access

    except Exception as e:
        print(f"An error occurred: {e}")
        return False
    finally:
        if 'client' in locals() and client:
            client.close()

def get_container() -> None | docker.models.containers.Container:

    # Get the container name from the environment variable
    container_name: str = os.environ.get("OVERLEAF_CONTAINER_NAME")

    if not container_name:
        print("Error: OVERLEAF_CONTAINER_NAME environment variable not set.")
        # You might want to exit or raise an exception here
        return None

    container_name = "/" + container_name

    client = docker.from_env()

    # Find our overleaf container (name is defined in config.json)
    running_containers = client.containers.list()
    locate_containers = []
    for running_container in running_containers:
        if running_container.attrs["Name"] == container_name:
            locate_containers.append(running_container)

    if len(locate_containers) != 1:
        return None

    return locate_containers[0]


def clean_directory_except_git(directory_path):
    """
    Remove all files and subdirectories in the given directory except for the .git directory

    Args:
        directory_path: Path to the directory to clean
    """
    # Make sure the directory exists
    if not os.path.exists(directory_path):
        return

    # List all entries in the directory
    for entry in os.listdir(directory_path):
        entry_path = os.path.join(directory_path, entry)

        # Skip .git directory
        if entry == ".git" and os.path.isdir(entry_path):
            continue

        # Remove file or directory
        if os.path.isfile(entry_path) or os.path.islink(entry_path):
            os.unlink(entry_path)
        elif os.path.isdir(entry_path):
            shutil.rmtree(entry_path)


def main(
    username: str,
    project_id: str,
    overleaf_path: str = "/var/lib/overleaf/",
    host_path: str = "/downloads/",
) -> None:

    if len(project_id) == 0:
        exit(1)

    if username is None:
        exit(1)

    if len(username) == 0:
        exit(1)

    # Find user
    user_id: bson.objectid.ObjectId | None = get_user_id(username=username)

    if user_id is None:
        exit(1)

    if (
        check_project_access(
            user_id=user_id,
            project_id=project_id,
        )
        is False
    ):
        exit(1)

    docker_container: None | docker.models.containers.Container = get_container()

    if docker_container is None:
        exit(1)

    filename: str = f"{user_id}_{project_id}.zip"
    fullpath_container: str = os.path.join(overleaf_path, filename)
    fullpath_host: str = os.path.join(
        host_path,
        username,
        f"{project_id}.git",
        filename,
    )
    onlypath_host: str = os.path.join(
        host_path,
        username,
        f"{project_id}.git",
    )

    # Create the archive of the project
    result: docker.models.containers.ExecResult = docker_container.exec_run(
        (
            "/bin/bash -c '"
            "cd /overleaf/services/web && "
            "node modules/server-ce-scripts/scripts/export-user-projects.mjs "
            f"--project-id {project_id} "
            f"--output {fullpath_container} "
            "'"
        )
    )
    if result.exit_code != 0:
        exit(1)
    # At this point the file with the project is waiting for us.

    # It gives us a tar file... I am not a fan but have to live with it.
    bits, _ = docker_container.get_archive(fullpath_container)

    os.makedirs(f"{onlypath_host}", mode=0o700, exist_ok=True)

    # Delete everything except the .git dir
    clean_directory_except_git(onlypath_host)

    # Write the file to the host
    with open(f"{fullpath_host}.tar", "wb") as f:
        for chunk in bits:
            f.write(chunk)
    subprocess.run([f"tar -xf {fullpath_host}.tar "], shell=True, cwd=onlypath_host)
    os.unlink(f"{fullpath_host}.tar")
    subprocess.run(
        [f"/usr/bin/unzip -qq -o {fullpath_host} "], shell=True, cwd=onlypath_host
    )
    os.unlink(f"{fullpath_host}")

    subprocess.run(
        [f"chmod -R 0755 {onlypath_host} "],
        shell=True,
    )

    if not os.path.isdir(f"{onlypath_host}/.git"):
        subprocess.run(["/usr/bin/git init -q "], shell=True, cwd=onlypath_host)

    subprocess.run(["/usr/bin/git add --all "], shell=True, cwd=onlypath_host)

    subprocess.run(
        ["/usr/bin/git commit -q -m 'by Overleaf CEP' "], shell=True, cwd=onlypath_host
    )

    return


if __name__ == "__main__":
    argh.dispatch_command(main)
