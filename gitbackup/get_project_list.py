import argh  # type: ignore
import pymongo
import bson
import os
import subprocess
from urllib.parse import urlparse

def get_user_id(
    username: str, ) -> bson.objectid.ObjectId | None:

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
        return None
    finally:
        if 'client' in locals() and client:
            client.close()

    return None

def get_project_list(user_id: bson.objectid.ObjectId) -> list[dict] | None:

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

        project_query_filter = {
            "$or": [
                {"owner_ref": user_id},  # User is the owner
                {"collaberator_refs": user_id},  # User is a collaborator
                {"readOnly_refs": user_id},  # User has read-only access
            ]
        }

        # Fetch all projects for a given userId
        projects_cursor = db.projects.find(
            project_query_filter,
            {
                "name": 1,
                "lastUpdated": 1,
                "publicAccessLevel": 1,
                "archived": 1,
                "trashed": 1,
                "_id": 1,
            },
        )

        # Filter and map projects based on conditions
        filtered_projects = [
            {
                "_id": str(project["_id"]),
                "name": project["name"],
            }
            for project in projects_cursor
            if not (project.get("archived") or project.get("trashed"))
        ]

        return filtered_projects

    except Exception as e:
        print(f"An error occurred: {e}")
        return None
    finally:
        if 'client' in locals() and client:
            client.close()

    return None


def main(username: str,):

    if username is None:
        exit(1)

    if len(username) == 0:
        exit(1)

    user_id: bson.objectid.ObjectId | None = get_user_id(username=username)

    if user_id is None:
        exit(1)

    projectlist = get_project_list(user_id=user_id)

    os.makedirs(f"/downloads/{username}/projects.git", mode=0o700, exist_ok=True)

    with open(
        os.path.join("/downloads/", f"{username}", "projects.git", "projects.txt"),
        "w",
    ) as file:
        if projectlist is not None:
            for entry in projectlist:
                file.write(f'{entry["_id"]} ; "{entry["name"]}"\n')

    if not os.path.isdir("/downloads/{username}/projects.git/.git"):

        subprocess.run(
            [f"cd /downloads/{username}/projects.git && /usr/bin/git init -q "],
            shell=True,
        )

    subprocess.run(
        [f"cd /downloads/{username}/projects.git && /usr/bin/git add --all "],
        shell=True,
    )
    subprocess.run(
        [
            f"cd /downloads/{username}/projects.git && /usr/bin/git commit -q -m 'by Overleaf CEP' "
        ],
        shell=True,
    )

    subprocess.run(
        [f"chmod -R 0700 /downloads/{username}/projects.git "],
        shell=True,
    )

    exit(0)


if __name__ == "__main__":
    argh.dispatch_command(main)
