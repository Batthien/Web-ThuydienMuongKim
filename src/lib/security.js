const crypto = require('node:crypto');

/** CSRF token đơn giản lưu trong cookie-session (đã ký). */
function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('base64url');
  return req.session.csrf;
}

function csrfValid(req) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const real = req.session && req.session.csrf;
  if (!real || typeof sent !== 'string' || sent.length !== real.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(real));
}

/** Middleware: chặn POST thiếu/sai token. Đặt SAU bộ parse body (kể cả multer). */
function requireCsrf(req, res, next) {
  if (csrfValid(req)) return next();
  const err = new Error('Invalid CSRF token');
  err.status = 403;
  err.code = 'CSRF';
  next(err);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}

module.exports = { csrfToken, csrfValid, requireCsrf, requireAdmin };
