module.exports = {
  apps: [
    {
      name: 'whatsapp-gateway-web',
      cwd: __dirname,
      script: 'npm',
      args: 'run start',
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
      name: 'whatsapp-gateway-worker',
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
