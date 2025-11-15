import pymongo
import argh
import os
from urllib.parse import urlparse

def main(username: str, path: str = "/downloads/", ) -> None:
    """
    Store SSH public and private keys for a user in MongoDB.

    Args:
        username: Username for SSH key files
        path: Base path containing user SSH directories
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

        print(f"User email: {username}")

        users = db.users

        # Check if user exists
        search_result = users.find_one({"email": username})
        if search_result is None:
            print("User not found")
            client.close()
            exit(1)

        # Get SSH keys from files
        if path and username:
            try:
                public_keys_name = os.path.join(path, username, ".ssh", "overleafcep.pub")
                private_keys_name = os.path.join(path, username, ".ssh", "overleafcep")

                # Verify directories and files exist
                assert os.path.isdir(os.path.join(path, username, ".ssh"))
                assert os.path.isfile(public_keys_name)
                assert os.path.isfile(private_keys_name)

                # Read key files
                with open(public_keys_name, 'r') as file:
                    public_key = file.read()
                with open(private_keys_name, 'r') as file:
                    private_key = file.read()

                # Update user with SSH keys
                users.update_one(
                    {"email": username},
                    {"$set": {"sshPublicKey": public_key, "sshPrivateKey": private_key}}
                )
                print("SSH keys stored successfully")

            except AssertionError:
                print("Error: SSH directory or key files not found")
                client.close()
                exit(1)
            except Exception as e:
                print(f"Error reading SSH keys: {e}")
                client.close()
                exit(1)
        else:
            print("Path and username are required to store SSH keys")
            client.close()
            exit(1)

    except Exception as e:
        print(f"An error occurred: {e}")
        exit(1)
    finally:
        if 'client' in locals() and client:
            client.close()

    exit(0)

if __name__ == "__main__":
    argh.dispatch_command(main)

