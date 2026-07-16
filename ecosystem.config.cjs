module.exports = {
  apps: [
    {
      name: 'gateway-web',
      cwd: __dirname,
      script: 'npm',
      args: 'run start -- -H 127.0.0.1 -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '750M',
      kill_timeout: 15000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'gateway-worker',
      cwd: __dirname,
      script: 'npm',
      args: 'run worker',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1G',
      kill_timeout: 30000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
