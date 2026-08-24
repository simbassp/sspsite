module.exports = {
  apps: [
    {
      name: "ssp",
      cwd: __dirname,
      script: "./node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      node_args: "--max-old-space-size=1536",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1800M",
      exp_backoff_restart_delay: 2000,
      kill_timeout: 8000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
