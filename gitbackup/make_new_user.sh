#!/bin/bash
if [ -z "$1" ]; then
  echo "Error: Argument 1 is missing." >&2 # Send error to stderr
  exit 1 # Exit with a non-zero status code to indicate failure
fi

USERNAME=$1

# Create user
/usr/sbin/useradd ${USERNAME} -g overleafcep -k /etc/skel -m -d /downloads/${USERNAME}
chown -R ${USERNAME}:overleafcep /downloads/${USERNAME}
chmod -R 0755 /downloads/${USERNAME}

chown -R ${USERNAME}:overleafcep /downloads/${USERNAME}
chmod 0755 /downloads/${USERNAME}
cat /etc/passwd | grep ${USERNAME} > /downloads/${USERNAME}/etc/passwd

# Make devs for the jail
mkdir -p /downloads/${USERNAME}/dev
mknod -m 666 /downloads/${USERNAME}/dev/null c 1 3
mknod -m 666 /downloads/${USERNAME}/dev/zero c 1 5
mknod -m 666 /downloads/${USERNAME}/dev/random c 1 8
mknod -m 666 /downloads/${USERNAME}/dev/urandom c 1 9
mknod -m 666 /downloads/${USERNAME}/dev/tty c 5 0

# Make new ssh key
mkdir -p /downloads/${USERNAME}/.ssh
chmod 700 /downloads/${USERNAME}/.ssh

cd / 
python3 get_key_overleaf.py ${USERNAME}
# Check exit code of get_key_overleaf.py
if [ $? -eq 1 ]; then
    # Only execute these commands if get_key_overleaf.py returned 1
    ssh-keygen -t ed25519 -f /downloads/${USERNAME}/.ssh/overleafcep -N ""
    python3 set_key_overleaf.py ${USERNAME}
fi

cat /downloads/${USERNAME}/.ssh/overleafcep.pub > /downloads/${USERNAME}/.ssh/authorized_keys
chmod 600 /downloads/${USERNAME}/.ssh/overleafcep
chmod 700 /downloads/${USERNAME}/.ssh
chmod 600 /downloads/${USERNAME}/.ssh/authorized_keys
chown -R ${USERNAME}:overleafcep /downloads/${USERNAME}/.ssh

chmod 777 /downloads/${USERNAME} 
sudo -u ${USERNAME} /usr/bin/git config --global user.email ${USERNAME} 
sudo -u ${USERNAME} /usr/bin/git config --global user.name ${USERNAME} 

mkdir -p /downloads/${USERNAME}/projects.git
echo "" > /downloads/${USERNAME}/projects.git/projects.txt
chown -R ${USERNAME}:overleafcep /downloads/${USERNAME}/projects.git

cd /downloads/${USERNAME}/projects.git && sudo -u ${USERNAME} /usr/bin/git init -q
cd /downloads/${USERNAME}/projects.git && sudo -u ${USERNAME} /usr/bin/git add --all
cd /downloads/${USERNAME}/projects.git && sudo -u ${USERNAME} /usr/bin/git commit -m 'by overleafcep'
chown -R ${USERNAME}:overleafcep /downloads/${USERNAME}/projects.git 
chmod -R 0755 /downloads/${USERNAME}/projects.git 


chmod 755 /downloads/${USERNAME} 

