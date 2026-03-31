module.exports = {
  apps: [
    {
      name: 'linkedin-agent',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts --schedule --source=feed --approval=email',
      cwd: '/home/ec2-user/linkedin-agent',  // update to your server path
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: 'logs/agent-out.log',
      error_file: 'logs/agent-error.log',
      merge_logs: true,
    },
  ],
};
