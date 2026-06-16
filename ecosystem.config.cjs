/**
 * PM2 Ecosystem Configuration for Interview Bot
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 start ecosystem.config.cjs --env staging
 *   pm2 save && pm2 startup  # auto-start on boot
 *
 * Monitoring:
 *   pm2 monit
 *   pm2 logs dialog-survey
 */

module.exports = {
  apps: [
    {
      name: 'dialog-survey',
      script: 'dist/src/server.js',
      instances: 1,
      exec_mode: 'fork',

      // ── Restart policy ─────────────────────────────────────────────
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      min_uptime: '5s',
      max_memory_restart: '500M',

      // ── Environment injection ──────────────────────────────────────
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3002,
      },

      // ── Logging ────────────────────────────────────────────────────
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      log_type: 'json',

      // ── PM2 features ───────────────────────────────────────────────
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
