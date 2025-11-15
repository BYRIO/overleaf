import os
import pwd
import subprocess
import pymongo
from urllib.parse import urlparse

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
    users = db.users

    cursor = users.find()

    for user in cursor:
        username:str = user['email']
        create_new_user: bool = False
        try:
            pwd.getpwnam(username)
            create_new_user = False
        except KeyError:
            create_new_user = True

        if create_new_user:
            subprocess.run([f"sh /make_new_user.sh {username}"], shell=True)

except Exception as e:
    print(f"An error occurred: {e}")
finally:
    if 'client' in locals() and client:
        client.close()
