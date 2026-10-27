const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && !env.SESSION_SECRET) {
  console.error('[config] Thiếu SESSION_SECRET trong .env — bắt buộc khi chạy production.');
  process.exit(1);
}

module.exports = {
  ROOT,
  isProd,
  port: Number(env.PORT) || 3000,
  host: env.HOST || '127.0.0.1',
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  dataDir: path.resolve(ROOT, env.DATA_DIR || 'data'),
  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'uploads'),
  admin: {
    username: env.ADMIN_USERNAME || 'admin',
    password: env.ADMIN_PASSWORD || '',
  },
  mail: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 465,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : true,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || '',
    to: env.MAIL_TO || '',
  },
};
