module.exports = {
  apps: [{
    name: 'hotelNew',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 5001,
        DATABASE_HOST: 'localhost',
        DATABASE_USER: 'root',
      DATABASE_PASS: '2024.3core21',
      DATABASE_NAME: 'hotel',
      DATABASE_PORT: 3306
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5001,
      DATABASE_HOST: 'localhost',
      DATABASE_USER: 'root',
      DATABASE_PASS: '2024.3core21',
      DATABASE_NAME: 'hotel',
      DATABASE_PORT: 3306
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    kill_timeout: 5000,
    listen_timeout: 8000,
    shutdown_with_message: true
  }],

  deploy: {
    production: {
      user: 'root',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/hotelNEW.git',
      path: '/root/hotelNEW',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
}; 