#!/bin/bash
set -e
DIR=/var/lib/overleaf

# If the bind mount check was not skipped, ensure the host bind mount is present
if [[ "${OVERLEAF_SKIP_BIND_MOUNT_CHECK}" != "true" ]]; then
	if command -v mountpoint >/dev/null 2>&1; then
		if ! mountpoint -q "$DIR"; then
			echo "FATAL: mount point $DIR not present; aborting (protecting against accidental ephemeral container data)" >&2
			exit 104
		fi
	else
		if ! awk '{print $5}' /proc/self/mountinfo | grep -Fxq "$DIR"; then
			echo "FATAL: mount info shows $DIR is not mounted; aborting" >&2
			exit 104
		fi
	fi
fi

mkdir -p /var/lib/overleaf/data
chown www-data:www-data /var/lib/overleaf/data

mkdir -p /var/lib/overleaf/data/compiles
chown www-data:www-data /var/lib/overleaf/data/compiles

mkdir -p /var/lib/overleaf/data/output
chown www-data:www-data /var/lib/overleaf/data/output

mkdir -p /var/lib/overleaf/data/cache
chown www-data:www-data /var/lib/overleaf/data/cache

mkdir -p /var/lib/overleaf/data/template_files
chown www-data:www-data /var/lib/overleaf/data/template_files

mkdir -p /var/lib/overleaf/data/history
chown www-data:www-data /var/lib/overleaf/data/history

mkdir -p /var/lib/overleaf/tmp/projectHistories
chown www-data:www-data /var/lib/overleaf/tmp/projectHistories

mkdir -p /var/lib/overleaf/tmp/dumpFolder
chown www-data:www-data /var/lib/overleaf/tmp/dumpFolder

mkdir -p /var/lib/overleaf/tmp
chown www-data:www-data /var/lib/overleaf/tmp

mkdir -p /var/lib/overleaf/tmp/uploads
chown www-data:www-data /var/lib/overleaf/tmp/uploads

mkdir -p /var/lib/overleaf/tmp/dumpFolder
chown www-data:www-data /var/lib/overleaf/tmp/dumpFolder
