const express = require('express');
const path = require('node:path');
const rateLimit = require('express-rate-limit');
const { db, getSettings } = require('../db');
const { ROUTES, url, translator } = require('../i18n');
const h = require('../lib/helpers');
const { csrfToken, requireCsrf } = require('../lib/security');
const { cvUpload, dirs, removeFile } = require('../lib/uploads');
const mailer = require('../lib/mailer');
const spotlight = require('../lib/spotlight');
const { GALLERY_CATS, catOf } = require('../lib/gallery-cats');

const NEWS_PER_PAGE = 9;
const NEWS_CATEGORIES = ['company', 'operation', 'safety', 'community'];
const IR_CATEGORIES = ['disclosure', 'financial', 'annual', 'agm', 'governance'];

const q = {
  latestPosts: db.prepare(`SELECT * FROM posts WHERE status='published' AND published_at <= date('now','+7 hours')
    ORDER BY published_at DESC, id DESC LIMIT ?`),
  countPosts: db.prepare(`SELECT COUNT(*) n FROM posts WHERE status='published' AND published_at <= date('now','+7 hours')
    AND (? = '' OR category = ?)`),
  pagePosts: db.prepare(`SELECT * FROM posts WHERE status='published' AND published_at <= date('now','+7 hours')
    AND (? = '' OR category = ?) ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`),
  postBySlug: db.prepare(`SELECT * FROM posts WHERE slug = ? AND status='published'`),
  related: db.prepare(`SELECT * FROM posts WHERE status='published' AND id != ? AND published_at <= date('now','+7 hours')
    ORDER BY (category = ?) DESC, published_at DESC LIMIT 3`),
  docs: db.prepare(`SELECT * FROM documents WHERE (? = '' OR category = ?) AND (? = 0 OR year = ?)
    ORDER BY published_at DESC, id DESC`),
  docYears: db.prepare(`SELECT DISTINCT year FROM documents ORDER BY year DESC`),
  latestDocs: db.prepare(`SELECT * FROM documents ORDER BY published_at DESC, id DESC LIMIT ?`),
  jobs: db.prepare(`SELECT * FROM jobs WHERE status='published' ORDER BY created_at DESC`),
  jobBySlug: db.prepare(`SELECT * FROM jobs WHERE slug = ? AND status='published'`),
  insertMessage: db.prepare(`INSERT INTO messages (kind, job_id, name, email, phone, subject, body, attachment, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
};

/** Lấy trường theo ngôn ngữ, rơi về tiếng Việt nếu bản tiếng Anh trống */
const loc = (row, field, lang) => (row && (row[`${field}_${lang}`] || row[`${field}_vi`])) || '';

const formLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => {
    const err = new Error('Too many requests');
    err.status = 429;
    err.code = 'RATE';
    next(err);
  },
});

function createRouter(lang) {
  const router = express.Router();
  const other = lang === 'vi' ? 'en' : 'vi';
  const t = translator(lang);
  const segToKey = Object.fromEntries(Object.entries(ROUTES).map(([k, v]) => [v[lang], k]));

  router.use((req, res, next) => {
    const s = getSettings();
    Object.assign(res.locals, {
      lang, other, t, h, loc: (row, f) => loc(row, f, lang),
      url: (key, sub) => url(lang, key, sub),
      altUrl: url(other, 'home'),
      settings: s,
      companyName: lang === 'en' ? s.company_name_en : s.company_name_vi,
      csrf: csrfToken(req),
      page: { key: 'home', title: '', description: t('meta.description'), image: '/img/og-image.jpg' },
    });
    next();
  });

  // Đặt trang hiện tại + liên kết ngôn ngữ còn lại
  const setPage = (res, key, extra = {}, altSub) => {
    res.locals.page = { ...res.locals.page, key, ...extra };
    res.locals.altUrl = url(other, key, altSub);
  };

  router.get('/', (req, res) => {
    setPage(res, 'home', { title: t('home.title') });
    // Tên tài liệu cổ đông chỉ hiện cho người có quyền xem
    const docs = res.locals.canViewIR ? q.latestDocs.all(4) : [];
    const tiles = spotlight.build({ t, url: res.locals.url, loc: res.locals.loc, posts: q.latestPosts.all(5), docs, jobs: q.jobs.all().slice(0, 4), IR_CATEGORIES });
    res.render('home', { docs, IR_CATEGORIES, spotlight: tiles });
  });

  const pages = {
    about(req, res) {
      setPage(res, 'about', { title: t('about.title'), description: t('about.lead') });
      // Ảnh nhà máy & đập của cả cụm, kèm chú thích
      const plantName = (album) => ({ 'plant-mk2': t('plant.mk2.title'), 'plant-pl': t('plant.pl.title'), 'plant-hb2': t('plant.hb2.title') }[album] || t('plant.title'));
      const caps = { 'plant-mk2': t('plant.mk2.captions'), 'plant-pl': t('plant.pl.captions'), 'plant-hb2': t('plant.hb2.captions') };
      const photo = (src) => {
        const g = h.gallery.find((x) => x.src === src);
        if (!g) return null;
        const i = Number(src.slice(-2)) - 1;
        const caption = caps[g.album] ? caps[g.album][i] : g.album === 'dam' ? `${plantName(g.album)} — ${t('plant.damTitle')}` : plantName(g.album);
        return { src, plant: plantName(g.album), caption: caption || plantName(g.album) };
      };
      const list = (arr) => arr.map(photo).filter(Boolean);
      res.render('about', {
        plantsStrip: list(['/media/plant/plant-03', '/media/plant-mk2/plant-mk2-01', '/media/plant-pl/plant-pl-01', '/media/plant-hb2/plant-hb2-01']),
        timelineBg: '/media/dam/dam-02',
        gallery: list(['/media/plant-pl/plant-pl-04', '/media/plant-mk2/plant-mk2-03', '/media/plant/plant-04', '/media/plant-mk2/plant-mk2-05',
          '/media/plant-pl/plant-pl-07', '/media/plant-hb2/plant-hb2-05', '/media/plant/plant-02', '/media/plant-pl/plant-pl-06', '/media/plant-mk2/plant-mk2-08']),
      });
    },
    plant(req, res) {
      setPage(res, 'plant', { title: t('plant.overviewTitle'), description: t('plant.overviewLead'), image: h.imgUrl('/media/plant/plant-04', 1280) });
      res.render('plant');
    },
    ir(req, res) {
      setPage(res, 'ir', { title: t('ir.title'), description: t('ir.lead') });
      if (!res.locals.canViewIR) {
        res.set('Cache-Control', 'private, no-store');
        return res.status(res.locals.isLoggedIn ? 403 : 200).render('ir-locked', { loginUrl: '/admin/login?next=' + encodeURIComponent(req.originalUrl) });
      }
      res.set('Cache-Control', 'private, no-store');
      const cat = IR_CATEGORIES.includes(req.query.cat) ? req.query.cat : '';
      const year = Number.parseInt(req.query.year, 10) || 0;
      res.render('ir', { docs: q.docs.all(cat, cat, year, year), years: q.docYears.all().map((r) => r.year), cat, year, IR_CATEGORIES });
    },
    news(req, res) {
      const cat = NEWS_CATEGORIES.includes(req.query.cat) ? req.query.cat : '';
      const total = q.countPosts.get(cat, cat).n;
      const pages = Math.max(1, Math.ceil(total / NEWS_PER_PAGE));
      const current = Math.min(pages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
      setPage(res, 'news', { title: t('news.title') + (current > 1 ? ` – ${t('common.page', { n: current })}` : ''), description: t('news.lead') });
      const posts = q.pagePosts.all(cat, cat, NEWS_PER_PAGE, (current - 1) * NEWS_PER_PAGE);
      res.render('news', { posts, cat, current, pages, NEWS_CATEGORIES });
    },
    careers(req, res, extra = {}) {
      setPage(res, 'careers', { title: t('careers.title'), description: t('careers.lead') });
      res.render('careers', { jobs: q.jobs.all(), job: null, values: {}, errors: null, sent: req.query.sent === '1', ...extra });
    },
    gallery(req, res) {
      setPage(res, 'gallery', { title: t('gallery.title'), description: t('gallery.lead') });
      const photos = h.gallery.map((g) => ({ ...g, cat: catOf(g.album) })).filter((g) => g.cat);
      const counts = Object.fromEntries(GALLERY_CATS.map(([c]) => [c, photos.filter((p) => p.cat === c).length]));
      res.render('gallery', { photos, cats: GALLERY_CATS.map(([c]) => c), counts });
    },
    contact(req, res, extra = {}) {
      setPage(res, 'contact', { title: t('contact.title'), description: t('contact.lead') });
      res.render('contact', { values: {}, errors: null, sent: req.query.sent === '1', ...extra });
    },
  };

  router.get('/:seg', (req, res, next) => {
    const key = segToKey[req.params.seg];
    if (!key || !pages[key]) return next();
    pages[key](req, res);
  });

  router.get('/:seg/:slug', (req, res, next) => {
    const key = segToKey[req.params.seg];
    if (key === 'news') {
      const post = q.postBySlug.get(req.params.slug);
      if (!post) return next();
      setPage(res, 'news', {
        title: loc(post, 'title', lang),
        description: h.truncate(loc(post, 'excerpt', lang), 160),
        image: h.imgUrl(post.cover, 1280),
        type: 'article',
        published: post.published_at,
      }, post.slug);
      return res.render('post', { post, related: q.related.all(post.id, post.category) });
    }
    if (key === 'plant') {
      const plant = t('plant.plants').find((p) => p.id === req.params.slug);
      if (!plant) return next();
      const lead = plant.id === 'muong-kim' ? t('plant.lead') : plant.detail ? t('plant.' + plant.detail).lead : t('plant.plantsPending');
      const albums = plant.id === 'muong-kim' ? ['dam', 'plant', 'office'] : plant.album ? [plant.album] : [];
      const photos = h.gallery.filter((g) => albums.includes(g.album));
      setPage(res, 'plant', { title: plant.name, description: h.truncate(lead, 160), ...(photos[0] && { image: h.imgUrl(photos[0].src, 1280) }) }, plant.id);
      return res.render('plant-detail', { plant, photos });
    }
    if (key === 'careers') {
      const job = q.jobBySlug.get(req.params.slug);
      if (!job) return next();
      setPage(res, 'careers', { title: loc(job, 'title', lang), description: h.truncate(loc(job, 'summary', lang), 160) }, job.slug);
      return res.render('job', { job, values: {}, errors: null, sent: req.query.sent === '1' });
    }
    next();
  });

  // ---------- Form xử lý ----------
  function validate(body, { needMessage }) {
    const v = {
      name: String(body.name || '').trim().slice(0, 120),
      email: String(body.email || '').trim().slice(0, 160),
      phone: String(body.phone || '').trim().slice(0, 30),
      topic: String(body.topic || '').trim().slice(0, 40),
      message: String(body.message || '').trim().slice(0, 5000),
      consent: body.consent === 'on' || body.consent === '1',
    };
    const errors = {};
    if (v.name.length < 2) errors.name = t('form.errors.name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errors.email = t('form.errors.email');
    if (v.phone && !/^[+0-9 ().-]{8,20}$/.test(v.phone)) errors.phone = t('form.errors.phone');
    if (needMessage && v.message.length < 10) errors.message = t('form.errors.message');
    if (!v.consent) errors.consent = t('form.errors.consent');
    return { v, errors };
  }

  function saveMessage(req, data, extra) {
    q.insertMessage.run(data.kind, data.job_id || null, data.name, data.email, data.phone, data.subject, data.body, data.attachment || '', req.ip || '');
    mailer.notifyNewMessage(data, extra).catch(() => {});
  }

  router.post('/:seg', formLimiter, (req, res, next) => {
    const key = segToKey[req.params.seg];
    if (key === 'contact') {
      requireCsrf(req, res, (err) => {
        if (err) return next(err);
        if (req.body.website) return res.redirect(303, url(lang, 'contact') + '?sent=1'); // bẫy bot
        const { v, errors } = validate(req.body, { needMessage: true });
        if (Object.keys(errors).length) {
          res.status(422);
          return pages.contact(req, res, { values: v, errors });
        }
        const topic = t(`contact.topics.${v.topic}`);
        saveMessage(req, { kind: 'contact', name: v.name, email: v.email, phone: v.phone, subject: topic.startsWith('contact.') ? '' : topic, body: v.message });
        res.redirect(303, url(lang, 'contact') + '?sent=1#form');
      });
      return;
    }
    if (key === 'careers') return handleApplication(req, res, next, null);
    next();
  });

  router.post('/:seg/:slug', formLimiter, (req, res, next) => {
    if (segToKey[req.params.seg] !== 'careers') return next();
    const job = q.jobBySlug.get(req.params.slug);
    if (!job) return next();
    handleApplication(req, res, next, job);
  });

  function handleApplication(req, res, next, job) {
    cvUpload.single('cv')(req, res, (uploadErr) => {
      const cleanup = () => req.file && removeFile(dirs.cv, req.file.filename);
      requireCsrf(req, res, (csrfErr) => {
        if (csrfErr) { cleanup(); return next(csrfErr); }
        if (req.body.website) { cleanup(); return res.redirect(303, url(lang, 'careers') + '?sent=1'); }
        const { v, errors } = validate(req.body, { needMessage: false });
        if (uploadErr || req.fileRejected || !req.file) errors.cv = t('form.errors.cv');
        const back = job ? url(lang, 'careers', job.slug) : url(lang, 'careers');
        if (Object.keys(errors).length) {
          cleanup();
          res.status(422);
          if (job) {
            setPage(res, 'careers', { title: loc(job, 'title', lang) }, job.slug);
            return res.render('job', { job, values: v, errors, sent: false });
          }
          return pages.careers(req, res, { values: v, errors });
        }
        const jobTitle = job ? job.title_vi : t('careers.generalPosition');
        saveMessage(req, {
          kind: 'application', job_id: job ? job.id : null, name: v.name, email: v.email, phone: v.phone,
          subject: jobTitle, body: v.message, attachment: req.file.filename,
        }, { jobTitle, attachmentPath: path.join(dirs.cv, req.file.filename) });
        res.redirect(303, back + '?sent=1#apply');
      });
    });
  }

  return router;
}

module.exports = { createRouter, IR_CATEGORIES, NEWS_CATEGORIES };
