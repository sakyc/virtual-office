// Run from the repository root: pm2 start deploy/ecosystem.config.cjs
// Secrets stay in the server's .env, never here or in Git.
const path = require('node:path');
module.exports = {
  apps: [{
    name: 'karyora',
    cwd: path.resolve(__dirname, '..'),
    script: 'server/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    // Give the app's 5-minute drain deadline time to finish before PM2 SIGKILL.
    kill_timeout: 330000,
    time: true,
    env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3101' },
  }],
};
