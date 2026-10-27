// Cấu hình PM2 trên VPS:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'muongkim-web',
      script: 'server.js',
      cwd: __dirname,
      instances: 1, // SQLite: chạy 1 tiến trình
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true,
    },
  ],
};
