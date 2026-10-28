const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieSession = require('cookie-session');
const config = require('./src/config');
const { db, getSettings } = require('./src/db');
const { url, translator, ROUTES } = require('./src/i18n');
const h = require('./src/lib/helpers');
const { csrfToken } = require('./src/lib/security');
const { createRouter } = require('./src/routes/public');
const adminRouter = require('./src/routes/admin');
const pkg = require('./package.json');

const app = express();
const ASSET_VERSION = `${pkg.version}-${Date.now().toString(36)}`;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // chạy sau Nginx
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"], // chỉ cho biến CSS nhỏ dạng style="--i:1"
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      frameSrc: ['https://www.google.com', 'https://maps.google.com'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());

// ---- Tệp tĩnh ----
const long = { maxAge: '30d', immutable: true };
app.use('/media', express.static(path.join(__dirname, 'public/media'), long));
app.use('/uploads/images', express.static(path.join(config.uploadDir, 'images'), long));
app.use('/uploads/docs', express.static(path.join(config.uploadDir, 'docs'), { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '7d' : 0 }));

app.use(express.urlencoded({ extended: false, limit: '300kb' }));
app.use(cookieSession({
  name: 'mk.sid',
  keys: [config.sessionSecret],
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  maxAge: 8 * 60 * 60 * 1000,
}));

app.use((req, res, next) => {
  res.locals.siteUrl = config.siteUrl;
  res.locals.currentPath = req.path.replace(/\/$/, '') || '/';
  res.locals.assetVersion = ASSET_VERSION;
  res.locals.isLoggedIn = Boolean(req.session && req.session.userId);
  res.locals.icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  next();
});

// ---- SEO ----
app.get('/', (req, res) => {
  const prefersEn = /^en\b/i.test(req.get('accept-language') || '');
  res.redirect(302, prefersEn ? '/en' : '/vi');
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const entries = [];
  const add = (vi, en, lastmod) => entries.push({ vi, en, lastmod });
  for (const key of Object.keys(ROUTES)) add(url('vi', key), url('en', key));
  for (const p of db.prepare("SELECT slug, updated_at FROM posts WHERE status='published'").all()) {
    add(url('vi', 'news', p.slug), url('en', 'news', p.slug), p.updated_at.slice(0, 10));
  }
  for (const j of db.prepare("SELECT slug, updated_at FROM jobs WHERE status='published'").all()) {
    add(url('vi', 'careers', j.slug), url('en', 'careers', j.slug), j.updated_at.slice(0, 10));
  }
  const s = config.siteUrl;
  const xml = entries.flatMap((e) => ['vi', 'en'].map((l) => `  <url>
    <loc>${s}${e[l]}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}
    <xhtml:link rel="alternate" hreflang="vi" href="${s}${e.vi}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${s}${e.en}"/>
  </url>`)).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${xml}
</urlset>`);
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- Trang ----
app.use('/vi', createRouter('vi'));
app.use('/en', createRouter('en'));
app.use('/admin', adminRouter);

// ---- Lỗi ----
function renderError(req, res, status, message) {
  const lang = req.path.startsWith('/en') ? 'en' : 'vi';
  const other = lang === 'vi' ? 'en' : 'vi';
  const t = translator(lang);
  const s = getSettings();
  res.status(status).render('error', {
    status, message,
    lang, other, t, h,
    loc: (row, f) => (row && (row[`${f}_${lang}`] || row[`${f}_vi`])) || '',
    url: (key, sub) => url(lang, key, sub),
    altUrl: url(other, 'home'),
    settings: s,
    companyName: lang === 'en' ? s.company_name_en : s.company_name_vi,
    csrf: csrfToken(req),
    page: { key: 'error', title: status === 404 ? t('errors.notFoundTitle') : t('errors.serverTitle'), description: t('meta.description'), image: '/img/og-image.jpg' },
  });
}

app.use((req, res) => renderError(req, res, 404));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (res.headersSent) return;
  const lang = req.path.startsWith('/en') ? 'en' : 'vi';
  const t = translator(lang);
  if (err.code === 'CSRF') return renderError(req, res, 403, t('form.errors.csrf'));
  if (err.code === 'RATE') return renderError(req, res, 429, t('form.errors.rate'));
  console.error(err);
  renderError(req, res, err.status || 500);
});

if (require.main === module) {
  app.listen(config.port, config.host, () => {
    console.log(`Website đang chạy tại http://${config.host}:${config.port}  (${config.isProd ? 'production' : 'development'})`);
  });
}

module.exports = app;
