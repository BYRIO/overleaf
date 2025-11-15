const Docker = require('dockerode');
const docker = new Docker();

const GITBACKUP_IMAGE = process.env.GITBACKUP_IMAGE || 'sharelatex/sharelatex-gitbackup:latest';
const GITBACKUP_CONTAINER_NAME = process.env.GITBACKUP_CONTAINER_NAME || 'gitbackup';
const CHECK_INTERVAL = parseInt(process.env.GITBACKUP_CHECK_INTERVAL || '30000', 10);

console.log(`Gitbackup Manager starting...`);
console.log(`Image: ${GITBACKUP_IMAGE}`);
console.log(`Container Name: ${GITBACKUP_CONTAINER_NAME}`);

async function pullGitbackupImage() {
  try {
    // Only pull if configured to do so (useful for production)
    if (process.env.GITBACKUP_PULL_IMAGE === 'true') {
      console.log(`Pulling ${GITBACKUP_IMAGE}...`);
      await new Promise((resolve, reject) => {
        docker.pull(GITBACKUP_IMAGE, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            resolve(output);
          });
        });
      });
      console.log(`Successfully pulled ${GITBACKUP_IMAGE}`);
    } else {
      console.log('Skipping image pull (GITBACKUP_PULL_IMAGE not set to true)');
      // Verify image exists locally
      const image = docker.getImage(GITBACKUP_IMAGE);
      await image.inspect();
      console.log(`Using local image: ${GITBACKUP_IMAGE}`);
    }
  } catch (err) {
    console.error(`Failed to pull image: ${err.message}`);
    throw err;
  }
}
async function ensureGitbackupRunning() {
  try {
    const container = docker.getContainer(GITBACKUP_CONTAINER_NAME);
    
    try {
      const info = await container.inspect();
      
      // Check if configuration has changed
      const currentPort = info.HostConfig.PortBindings?.['22/tcp']?.[0]?.HostPort;
      const desiredPort = process.env.GITBACKUP_SSH_PORT || '2222';
      
      // Check if volume mounts have changed
      const desiredDataPath = process.env.GITBACKUP_HOST_DATA_DIR || process.env.GITBACKUP_DATA_DIR || '/var/lib/overleaf/gitbackup';
      const currentDownloadsMount = info.Mounts?.find(m => m.Destination === '/downloads');
      const currentDataPath = currentDownloadsMount?.Source?.replace('/downloads', '');
      
      let needsRecreate = false;
      let recreateReason = '';
      
      if (currentPort !== desiredPort) {
        needsRecreate = true;
        recreateReason = `Port changed from ${currentPort} to ${desiredPort}`;
      }
      
      if (currentDataPath && !currentDownloadsMount.Source.startsWith(desiredDataPath)) {
        needsRecreate = true;
        recreateReason = `Data path changed from ${currentDataPath} to ${desiredDataPath}`;
      }
      
      if (needsRecreate) {
        console.log(`${recreateReason}, recreating container...`);
        await container.remove({ force: true });
        await createGitbackupContainer();
        return;
      }
      
      if (!info.State.Running) {
        console.log('Gitbackup container exists but is not running. Starting...');
        await container.start();
        console.log('Gitbackup container started successfully');
      } else {
        console.log('Gitbackup container is running');
      }
    } catch (err) {
      if (err.statusCode === 404) {
        console.log('Gitbackup container does not exist. Creating...');
        await createGitbackupContainer();
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('Error managing gitbackup container:', err.message);
  }
}

// Add this new function near the top, after the other functions
async function stopGitbackupContainer() {
  try {
    const container = docker.getContainer(GITBACKUP_CONTAINER_NAME);
    const info = await container.inspect();
    
    if (info.State.Running) {
      console.log(`Stopping gitbackup container: ${GITBACKUP_CONTAINER_NAME}`);
      await container.stop({ t: 10 }); // 10 second timeout
      console.log('Gitbackup container stopped');
    }
    
    // Optionally remove the container
    console.log(`Removing gitbackup container: ${GITBACKUP_CONTAINER_NAME}`);
    await container.remove();
    console.log('Gitbackup container removed');
  } catch (err) {
    if (err.statusCode === 404) {
      console.log('Gitbackup container not found');
    } else {
      console.error('Error stopping gitbackup container:', err.message);
    }
  }
}

async function createGitbackupContainer() {
  try {
    // Ensure image is available
    await pullGitbackupImage();
    
    // Get network mode - Use the Overleaf container's network!
    let networkMode = process.env.DOCKER_NETWORK || 'bridge';
    console.log(`Initial network mode: ${networkMode}`);
    
    // Try to get the actual network from the Overleaf container
    try {
      const overleafContainerName = process.env.HOSTNAME || 'sharelatex';
      console.log(`Attempting to detect network from container: ${overleafContainerName}`);
      
      const overleafContainer = docker.getContainer(overleafContainerName);
      const overleafInfo = await overleafContainer.inspect();
      
      // Get all networks
      const networks = Object.keys(overleafInfo.NetworkSettings.Networks);
      console.log(`Available networks on ${overleafContainerName}: ${JSON.stringify(networks)}`);
      
      if (networks.length > 0) {
        // Prefer non-bridge networks (docker-compose networks)
        const preferredNetwork = networks.find(n => n !== 'bridge') || networks[0];
        networkMode = preferredNetwork;
        console.log(`Selected network: ${networkMode}`);
      } else {
        console.log(`No networks found on ${overleafContainerName}, using default: ${networkMode}`);
      }
    } catch (err) {
      console.log(`Could not detect Overleaf network: ${err.message}`);
      console.log(`Falling back to: ${networkMode}`);
    }
    
    // Prepare environment variables
    const overleafContainerName = process.env.HOSTNAME || 'sharelatex';
    const mongoUrl = process.env.MONGO_URL || process.env.OVERLEAF_MONGO_URL || 'mongodb://mongo/sharelatex';
    
    const env = [
      `OVERLEAF_MONGO_URL=${mongoUrl}`,
      `OVERLEAF_CONTAINER_NAME=${overleafContainerName}`,
      `PUID=${process.env.GITBACKUP_PUID || '1000'}`,
      `PGID=${process.env.GITBACKUP_PGID || '1000'}`,
      `TZ=${process.env.TZ || 'Etc/UTC'}`
    ];
    
    // Prepare volume bindings
    const gitbackupHostPath = process.env.GITBACKUP_HOST_DATA_DIR || process.env.GITBACKUP_DATA_DIR || '/var/lib/overleaf/gitbackup';
    const gitbackupLogPath = process.env.GITBACKUP_HOST_LOG_DIR || `${gitbackupHostPath}/log`;
    const gitbackupEtcPath = process.env.GITBACKUP_HOST_ETC_DIR || `${gitbackupHostPath}/etc`;
    
    const binds = [
      `${gitbackupHostPath}/downloads:/downloads`,
      `${gitbackupLogPath}:/var/log`,
      `${gitbackupEtcPath}:/etc`,
      '/var/run/docker.sock:/var/run/docker.sock'
    ];
    
    // Prepare port bindings
    const sshPort = process.env.GITBACKUP_SSH_PORT || '2222';
    const portBindings = {
      '22/tcp': [{ HostPort: sshPort }]
    };
    
    console.log(`Creating gitbackup container with:`);
    console.log(`  Network: ${networkMode}`);
    console.log(`  Host data path: ${gitbackupHostPath}`);
    console.log(`  Data path: ${gitbackupHostPath}/downloads`);
    console.log(`  Log path: ${gitbackupLogPath}`);
    console.log(`  Etc path: ${gitbackupEtcPath}`);
    console.log(`  SSH port: ${sshPort}`);
    console.log(`  Overleaf container: ${overleafContainerName}`);
    console.log(`  MongoDB URL: ${mongoUrl}`);
    console.log(`  Binds: ${JSON.stringify(binds)}`);    

    const container = await docker.createContainer({
      Image: GITBACKUP_IMAGE,
      name: GITBACKUP_CONTAINER_NAME,
      Hostname: 'gitbackup',
      Env: env,
      ExposedPorts: {
        '22/tcp': {}
      },
      HostConfig: {
        NetworkMode: networkMode,
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: binds,
        PortBindings: portBindings
      },
      Healthcheck: {
        Test: ["CMD-SHELL", "ncat -zv localhost 22 > /dev/null 2>&1 && exit 0 || exit 1"],
        Interval: 30000000000, // 30 seconds in nanoseconds
        Timeout: 10000000000,   // 10 seconds
        Retries: 5,
        StartPeriod: 60000000000 // 60 seconds
      }
    });
    
    await container.start();
    console.log('Gitbackup container created and started successfully');
  } catch (err) {
    console.error('Failed to create gitbackup container:', err.message);
    throw err;
  }
}

// Initial check and periodic monitoring
let checkInterval;

// Update the shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (checkInterval) clearInterval(checkInterval);
  await stopGitbackupContainer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (checkInterval) clearInterval(checkInterval);
  await stopGitbackupContainer();
  process.exit(0);
});

(async () => {
  try {
    // Initial startup
    console.log('Performing initial gitbackup setup...');
    await ensureGitbackupRunning();
    
    // Set up periodic checks
    checkInterval = setInterval(async () => {
      await ensureGitbackupRunning();
    }, CHECK_INTERVAL);
    
    console.log(`Gitbackup manager running. Checking every ${CHECK_INTERVAL / 1000} seconds.`);
  } catch (err) {
    console.error('Fatal error during gitbackup manager startup:', err);
    process.exit(1);
  }
})();

