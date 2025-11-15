import pymongo
import argh
import os
import stat
from urllib.parse import urlparse

def read_keys(username: str, output_path: str = "/downloads") -> bool:
    """
    Read SSH public and private keys for a user from MongoDB and save to filesystem.

    Args:
        username: Username for SSH key files
        output_path: Base path to save user SSH keys
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

        print(f"Looking up user: {username}")

        users = db.users

        # Check if user exists and retrieve keys
        user_data = users.find_one({"email": username})
        if user_data is None:
            print("User not found")
            client.close()
            exit(1)

        # Check if SSH keys exist in the user document
        if "sshPublicKey" not in user_data or "sshPrivateKey" not in user_data:
            print("SSH keys not found for this user")
            client.close()
            exit(1)

        public_key = user_data["sshPublicKey"]
        private_key = user_data["sshPrivateKey"]

        if len(public_key) == 0:
            print("Public SSH keys is empty for this user")
            client.close()
            exit(1)

        if len(private_key) == 0:
            print("Private SSH keys is empty for this user")
            client.close()
            exit(1)

        # Save keys to filesystem if path and username are provided
        if output_path and username:
            try:
                # Create .ssh directory if it doesn't exist
                ssh_dir = os.path.join(output_path, username, ".ssh")
                os.makedirs(ssh_dir, exist_ok=True)

                # Define key file paths
                public_key_path = os.path.join(ssh_dir, "overleafcep.pub")
                private_key_path = os.path.join(ssh_dir, "overleafcep")
                authorized_keys_path = os.path.join(ssh_dir, "authorized_keys")

                # Write authorized keys
                with open(authorized_keys_path, 'w') as file:
                    file.write(public_key)
                os.chmod(authorized_keys_path, 0o644)  # rw-r--r--

                # Write public key
                with open(public_key_path, 'w') as file:
                    file.write(public_key)
                os.chmod(public_key_path, 0o644)  # rw-r--r--

                # Write private key with restricted permissions
                with open(private_key_path, 'w') as file:
                    file.write(private_key)
                os.chmod(private_key_path, 0o600)  # rw-------

                print(f"SSH keys saved to {ssh_dir}")
                print(f"Public key: {public_key_path}")
                print(f"Private key: {private_key_path}")
                print(f"Authorized key: {authorized_keys_path}")

            except Exception as e:
                print(f"Error saving SSH keys: {e}")
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
    argh.dispatch_command(read_keys)
