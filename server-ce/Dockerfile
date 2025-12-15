# ---------------------------------------------
# Overleaf Community Edition (overleaf/overleaf)
# ---------------------------------------------

ARG OVERLEAF_BASE_TAG=sharelatex/sharelatex-base:latest
FROM $OVERLEAF_BASE_TAG

ARG BUILD_COMMIT=unknown
LABEL org.opencontainers.image.revision=${BUILD_COMMIT}

WORKDIR /overleaf

# Install npm v11.4.2 and patch-package globally before running npm install!
RUN npm install -g npm@11.4.2 patch-package dockerode

# Add required source files
# -------------------------
ADD server-ce/genScript.js /overleaf/genScript.js
ADD server-ce/services.js /overleaf/services.js
ADD package.json package-lock.json /overleaf/
ADD libraries/ /overleaf/libraries/
ADD services/ /overleaf/services/
ADD tools/migrations/ /overleaf/tools/migrations/

# Copy gitbackup manager script
# -----------------------------
COPY server-ce/gitbackup/gitbackup-manager.js /usr/local/bin/gitbackup-manager.js
RUN chmod +x /usr/local/bin/gitbackup-manager.js

# Add npm patches
# -----------------------
ADD patches/ /overleaf/patches

# Install npm dependencies and build webpack assets
# ------------------------
RUN --mount=type=cache,target=/root/.cache \
    --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/overleaf/services/web/node_modules/.cache,id=server-ce-webpack-cache \
    --mount=type=tmpfs,target=/tmp true \
&&  node genScript install | bash \
&&  node genScript compile | bash

# Copy runit service startup scripts to its location
# --------------------------------------------------
ADD server-ce/runit /etc/service
RUN chmod +x /etc/service/*/run

# Copy pre-shutdown scripts
COPY server-ce/init_preshutdown_scripts/ /etc/my_init.pre_shutdown.d/
RUN chmod +x /etc/my_init.pre_shutdown.d/*.sh

# Copy runit global settings to its location
# ------------------------------------------
ADD server-ce/config/env.sh /etc/overleaf/env.sh

# Configure nginx
# ---------------
ADD server-ce/nginx/nginx.conf.template /etc/nginx/templates/nginx.conf.template
ADD server-ce/nginx/overleaf.conf /etc/nginx/sites-enabled/overleaf.conf
ADD server-ce/nginx/clsi-nginx.conf /etc/nginx/sites-enabled/clsi-nginx.conf


# Configure log rotation
# ----------------------
ADD server-ce/logrotate/overleaf /etc/logrotate.d/overleaf
RUN chmod 644 /etc/logrotate.d/overleaf

# Configure cron tasks
# ----------------------
ADD server-ce/cron /overleaf/cron
ADD server-ce/config/crontab-history /etc/cron.d/crontab-history
RUN chmod 600 /etc/cron.d/crontab-history
ADD server-ce/config/crontab-deletion /etc/cron.d/crontab-deletion
RUN chmod 600 /etc/cron.d/crontab-deletion

# Copy Phusion Image startup and shutdown scripts to their locations
# ------------------------------------------------------------------
COPY server-ce/init_scripts/ /etc/my_init.d/
COPY server-ce/init_preshutdown_scripts/ /etc/my_init.pre_shutdown.d/

# Copy app settings files
# -----------------------
COPY server-ce/config/settings.js /etc/overleaf/settings.js

# Copy health check scripts
COPY server-ce/health/check-texlive-images.sh /etc/overleaf/health/check-texlive-images.sh
RUN chmod +x /etc/overleaf/health/check-texlive-images.sh

# Copy history-v1 files
# -----------------------
COPY server-ce/config/production.json /overleaf/services/history-v1/config/production.json
COPY server-ce/config/custom-environment-variables.json /overleaf/services/history-v1/config/custom-environment-variables.json

# Copy grunt thin wrapper
# -----------------------
ADD server-ce/bin/grunt /usr/local/bin/grunt
RUN chmod +x /usr/local/bin/grunt

# Copy history helper scripts
# ---------------------------
ADD server-ce/bin/flush-history-queues /overleaf/bin/flush-history-queues
RUN chmod +x /overleaf/bin/flush-history-queues
ADD server-ce/bin/force-history-resyncs /overleaf/bin/force-history-resyncs
RUN chmod +x /overleaf/bin/force-history-resyncs

# Copy Latexmkrc
# -----------------------
COPY server-ce/config/latexmkrc /usr/local/share/latexmk/LatexMk

# File that controls open|closed status of the site
# -------------------------------------------------
ENV SITE_MAINTENANCE_FILE="/etc/overleaf/site_status"
RUN touch $SITE_MAINTENANCE_FILE

# Set Environment Variables
# --------------------------------
ENV OVERLEAF_CONFIG=/etc/overleaf/settings.js
ENV TEXLAB_PATH=/usr/local/bin/texlab
RUN curl -L https://github.com/latex-lsp/texlab/releases/latest/download/texlab-x86_64-linux.tar.gz -o /tmp/texlab.tar.gz \
 && tar -xzf /tmp/texlab.tar.gz -C /usr/local/bin \
 && rm /tmp/texlab.tar.gz \
 && chmod +x /usr/local/bin/texlab

ENV WEB_API_USER="overleaf"
ENV ADMIN_PRIVILEGE_AVAILABLE="true"

ENV OVERLEAF_APP_NAME="Overleaf Community Edition"

ENV OPTIMISE_PDF="true"

# Phusion Image timeouts before sending SIGKILL to processes
# ----------------------------------------------------------
ENV KILL_PROCESS_TIMEOUT=55
ENV KILL_ALL_PROCESSES_TIMEOUT=55
ENV GRACEFUL_SHUTDOWN_DELAY_SECONDS=1

ENV NODE_ENV="production"
ENV LOG_LEVEL="info"


EXPOSE 80

ENTRYPOINT ["/sbin/my_init"]

# TexLive image checks & pull defaults in production
# These variables cause the server to attempt to pull configured TexLive images at startup
ENV AUTO_PULL_TEXLIVE_IMAGE=true
ENV FAIL_ON_MISSING_TEXLIVE_IMAGE=true
ENV FAIL_ON_IMAGE_PULL_FAILURE=true
ENV AUTO_BACKFILL_TEXLIVE_IMAGE=true
ENV AUTO_FALLBACK_TEXLIVE_IMAGE=true
ENV TEX_LIVE_DOCKER_IMAGE="texlive/texlive:latest-full"
ENV ALL_TEX_LIVE_DOCKER_IMAGES="texlive/texlive:latest-full"

# Docker HEALTHCHECK to expose whether required TexLive images are available
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=5 CMD /etc/overleaf/health/check-texlive-images.sh || exit 1
