const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { db, getSettings, saveSettings } = require('../db');
const { csrfToken, requireCsrf, requireAdmin } = require('../lib/security');
const { dirs, docUpload, imageUpload, saveImage, removeFile } = require('../lib/uploads');
const h = require('../lib/helpers');
const mailer = require('../lib/mailer');
const { translator, url } = require('../i18n');

const router = express.Router();
const tvi = translator('vi');
const NEWS_CATEGORIES = ['company', 'operation', 'safety', 'community'];
const IR_CATEGORIES = ['disclosure', 'financial', 'annual', 'agm', 'governance'];
const STATUS = [['published', 'Đăng công khai'], ['draft', 'Nháp (ẩn)']];
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

router.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  res.locals.csrf = csrfToken(req);
  res.locals.h = h;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.unread = req.session.userId ? db.prepare('SELECT COUNT(*) n FROM messages WHERE is_read = 0').get().n : 0;
  res.locals.path = req.path;
  next();
});

const flash = (req, type, text) => { req.session.flash = { type, text }; };

// ================= Đăng nhập =================
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.render('admin/login', { error: null, next: req.query.next || '/admin' });
});

router.post('/login', loginLimiter, requireCsrf, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim());
  const ok = user && bcrypt.compareSync(String(req.body.password || ''), user.password_hash);
  const next = /^\/admin(\/|$)/.test(req.body.next || '') ? req.body.next : '/admin';
  if (!ok) {
    res.status(401);
    return res.render('admin/login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng.', next });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.csrf = null; // đổi token sau khi đăng nhập
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  res.redirect(user.role === 'admin' ? next : '/admin/posts');
});

router.post('/logout', requireCsrf, (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

router.use(requireAdmin);

// ================= Phân quyền =================
const ROLES = { admin: 'Quản trị viên', editor: 'Biên tập viên' };
// Biên tập viên chỉ được quản lý tin tức (và đổi mật khẩu của mình)
const EDITOR_PATHS = [/^\/posts(\/|$)/, /^\/upload-image$/, /^\/account$/];

router.use((req, res, next) => {
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(req.session.userId);
  if (!user) { // tài khoản đã bị xoá
    req.session = null;
    return res.redirect('/admin/login');
  }
  req.user = user;
  res.locals.me = user;
  res.locals.ROLES = ROLES;
  if (user.role === 'admin' || EDITOR_PATHS.some((r) => r.test(req.path))) return next();
  if (req.path !== '/') flash(req, 'error', 'Tài khoản Biên tập viên không có quyền truy cập mục này.');
  res.redirect('/admin/posts');
});

// ================= Tổng quan =================
router.get('/', (req, res) => {
  const count = (sql) => db.prepare(sql).get().n;
  res.render('admin/dashboard', {
    stats: {
      posts: count("SELECT COUNT(*) n FROM posts WHERE status='published'"),
      docs: count('SELECT COUNT(*) n FROM documents'),
      jobs: count("SELECT COUNT(*) n FROM jobs WHERE status='published'"),
      messages: count('SELECT COUNT(*) n FROM messages'),
    },
    recent: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 6').all(),
    mailEnabled: mailer.enabled(),
  });
});

// ================= Tài nguyên dạng bảng (bài viết, tuyển dụng, tài liệu) =================
const RESOURCES = {
  posts: {
    table: 'posts', label: 'Tin tức', singular: 'bài viết', order: 'published_at DESC, id DESC',
    upload: imageUpload.single('cover_file'),
    columns: [['title_vi', 'Tiêu đề'], ['category', 'Chuyên mục', (v) => tvi('news.categories.' + v)], ['status', 'Trạng thái'], ['published_at', 'Ngày đăng']],
    publicUrl: (row) => url('vi', 'news', row.slug),
    fields: [
      { name: 'title', label: 'Tiêu đề', type: 'text', i18n: true, required: true },
      { name: 'slug', label: 'Đường dẫn (slug)', type: 'text', help: 'Để trống để tự tạo từ tiêu đề tiếng Việt.' },
      { name: 'category', label: 'Chuyên mục', type: 'select', options: NEWS_CATEGORIES.map((c) => [c, tvi('news.categories.' + c)]) },
      { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS },
      { name: 'published_at', label: 'Ngày đăng', type: 'date', required: true },
      { name: 'cover', label: 'Ảnh đại diện', type: 'image', help: 'JPG/PNG/WebP, tối đa 15 MB. Tự động nén và tạo nhiều kích thước.' },
      { name: 'excerpt', label: 'Tóm tắt', type: 'textarea', i18n: true },
      { name: 'body', label: 'Nội dung', type: 'markdown', i18n: true },
    ],
  },
  jobs: {
    table: 'jobs', label: 'Tuyển dụng', singular: 'vị trí', order: 'created_at DESC',
    upload: multer().none(),
    columns: [['title_vi', 'Vị trí'], ['quantity', 'Số lượng'], ['deadline', 'Hạn nộp'], ['status', 'Trạng thái']],
    publicUrl: (row) => url('vi', 'careers', row.slug),
    fields: [
      { name: 'title', label: 'Tên vị trí', type: 'text', i18n: true, required: true },
      { name: 'slug', label: 'Đường dẫn (slug)', type: 'text', help: 'Để trống để tự tạo.' },
      { name: 'status', label: 'Trạng thái', type: 'select', options: STATUS },
      { name: 'location', label: 'Nơi làm việc', type: 'text', i18n: true },
      { name: 'quantity', label: 'Số lượng', type: 'number' },
      { name: 'deadline', label: 'Hạn nộp hồ sơ', type: 'date', help: 'Để trống nếu tuyển đến khi đủ.' },
      { name: 'summary', label: 'Mô tả ngắn', type: 'textarea', i18n: true },
      { name: 'body', label: 'Chi tiết công việc', type: 'markdown', i18n: true },
    ],
  },
  documents: {
    table: 'documents', label: 'Tài liệu cổ đông', singular: 'tài liệu', order: 'published_at DESC, id DESC',
    upload: docUpload.single('file_upload'),
    columns: [['title_vi', 'Tài liệu'], ['category', 'Danh mục', (v) => tvi('ir.categories.' + v)], ['year', 'Năm'], ['published_at', 'Ngày công bố']],
    publicUrl: (row) => '/uploads/docs/' + row.file,
    fields: [
      { name: 'title', label: 'Tên tài liệu', type: 'text', i18n: true, required: true },
      { name: 'category', label: 'Danh mục', type: 'select', options: IR_CATEGORIES.map((c) => [c, tvi('ir.categories.' + c)]) },
      { name: 'year', label: 'Năm', type: 'number', required: true },
      { name: 'published_at', label: 'Ngày công bố', type: 'date', required: true },
      { name: 'file', label: 'Tệp tài liệu', type: 'file', help: 'PDF, DOC(X), XLS(X), ZIP — tối đa 50 MB.' },
    ],
  },
};

function columnsOf(res) {
  return res.fields.flatMap((f) => (f.i18n ? [`${f.name}_vi`, `${f.name}_en`] : f.type === 'image' || f.type === 'file' ? [] : [f.name]));
}

function uniqueSlug(table, base, id) {
  let slug = base, i = 2;
  while (db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).get(slug, id || 0)) slug = `${base}-${i++}`;
  return slug;
}

for (const [key, R] of Object.entries(RESOURCES)) {
  const base = `/admin/${key}`;

  router.get(`/${key}`, (req, res) => {
    const rows = db.prepare(`SELECT * FROM ${R.table} ORDER BY ${R.order}`).all();
    res.render('admin/list', { R, key, base, rows });
  });

  router.get(`/${key}/new`, (req, res) => {
    const row = { status: 'published', published_at: today(), year: new Date().getFullYear(), quantity: 1, category: R.fields.find((f) => f.name === 'category')?.options[0][0] };
    res.render('admin/form', { R, key, base, row, errors: {}, isNew: true });
  });

  router.get(`/${key}/:id/edit`, (req, res, next) => {
    const row = db.prepare(`SELECT * FROM ${R.table} WHERE id = ?`).get(req.params.id);
    if (!row) return next();
    res.render('admin/form', { R, key, base, row, errors: {}, isNew: false });
  });

  const save = async (req, res, next) => {
    const id = req.params.id ? Number(req.params.id) : null;
    const existing = id ? db.prepare(`SELECT * FROM ${R.table} WHERE id = ?`).get(id) : null;
    if (id && !existing) return next();
    const row = { ...(existing || {}) };
    for (const col of columnsOf(R)) row[col] = String(req.body[col] ?? '').trim();
    const errors = {};
    for (const f of R.fields) {
      const col = f.i18n ? `${f.name}_vi` : f.name;
      if (f.required && !row[col]) errors[col] = 'Bắt buộc nhập.';
    }
    if ('slug' in row) row.slug = uniqueSlug(R.table, h.slugify(row.slug || row.title_vi), id);
    if ('quantity' in row) row.quantity = Math.max(1, Number.parseInt(row.quantity, 10) || 1);
    if ('year' in row) row.year = Number.parseInt(row.year, 10) || new Date().getFullYear();

    // Tệp đính kèm
    if (R.fields.some((f) => f.type === 'image')) {
      if (req.file) row.cover = await saveImage(req.file.buffer, req.file.originalname);
      else if (req.body.cover_remove === '1') row.cover = '';
      else row.cover = existing ? existing.cover : '';
    }
    if (R.fields.some((f) => f.type === 'file')) {
      if (req.file) {
        if (existing) removeFile(dirs.docs, existing.file);
        row.file = req.file.filename;
        row.file_size = req.file.size;
      } else if (!existing) {
        errors.file = 'Vui lòng chọn tệp tài liệu.';
      }
    }

    if (Object.keys(errors).length) {
      if (req.file && req.file.filename) removeFile(dirs.docs, req.file.filename);
      res.status(422);
      return res.render('admin/form', { R, key, base, row, errors, isNew: !id });
    }

    const cols = Object.keys(row).filter((c) => !['id', 'created_at', 'updated_at'].includes(c));
    if (R.table !== 'documents') row.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    try {
      if (id) {
        const set = [...cols, ...(R.table !== 'documents' ? ['updated_at'] : [])];
        db.prepare(`UPDATE ${R.table} SET ${set.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...set.map((c) => row[c]), id);
      } else {
        db.prepare(`INSERT INTO ${R.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...cols.map((c) => row[c]));
      }
    } catch (e) {
      return next(e);
    }
    flash(req, 'success', `Đã lưu ${R.singular}.`);
    res.redirect(base);
  };

  router.post(`/${key}`, R.upload, requireCsrf, (req, res, next) => save(req, res, next).catch(next));
  router.post(`/${key}/:id`, R.upload, requireCsrf, (req, res, next) => save(req, res, next).catch(next));

  router.post(`/${key}/:id/delete`, requireCsrf, (req, res) => {
    const row = db.prepare(`SELECT * FROM ${R.table} WHERE id = ?`).get(req.params.id);
    if (row) {
      db.prepare(`DELETE FROM ${R.table} WHERE id = ?`).run(row.id);
      if (row.file) removeFile(dirs.docs, row.file);
      flash(req, 'success', `Đã xoá ${R.singular}.`);
    }
    res.redirect(base);
  });
}

// Tải ảnh chèn vào nội dung (gọi từ trình soạn thảo)
router.post('/upload-image', imageUpload.single('image'), requireCsrf, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tệp ảnh không hợp lệ.' });
    const base = await saveImage(req.file.buffer, req.file.originalname);
    res.json({ url: `${base}-1280.webp` });
  } catch (e) { next(e); }
});

// ================= Tin nhắn & hồ sơ =================
router.get('/messages', (req, res) => {
  const kind = ['contact', 'application'].includes(req.query.kind) ? req.query.kind : '';
  const rows = db.prepare(`SELECT m.*, j.title_vi AS job_title FROM messages m LEFT JOIN jobs j ON j.id = m.job_id
    WHERE (? = '' OR m.kind = ?) ORDER BY m.created_at DESC`).all(kind, kind);
  res.render('admin/messages', { rows, kind });
});

router.get('/messages/:id', (req, res, next) => {
  const m = db.prepare(`SELECT m.*, j.title_vi AS job_title FROM messages m LEFT JOIN jobs j ON j.id = m.job_id WHERE m.id = ?`).get(req.params.id);
  if (!m) return next();
  if (!m.is_read) db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(m.id);
  res.render('admin/message', { m });
});

router.get('/messages/:id/attachment', (req, res, next) => {
  const m = db.prepare('SELECT attachment, name FROM messages WHERE id = ?').get(req.params.id);
  if (!m || !m.attachment) return next();
  const file = path.join(dirs.cv, path.basename(m.attachment));
  if (!fs.existsSync(file)) return next();
  res.download(file, `CV-${h.slugify(m.name)}${path.extname(file)}`);
});

router.post('/messages/:id/delete', requireCsrf, (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id);
  if (m) {
    db.prepare('DELETE FROM messages WHERE id = ?').run(m.id);
    removeFile(dirs.cv, m.attachment);
    flash(req, 'success', 'Đã xoá tin nhắn.');
  }
  res.redirect('/admin/messages');
});

// ================= Cấu hình =================
const SETTING_GROUPS = [
  ['Thông tin doanh nghiệp', [
    ['company_name_vi', 'Tên công ty (Tiếng Việt)'], ['company_name_en', 'Tên công ty (English)'], ['short_name', 'Tên ngắn'],
    ['tax_code', 'Mã số thuế'], ['director', 'Giám đốc / Người đại diện'],
    ['address_vi', 'Địa chỉ (Tiếng Việt)'], ['address_en', 'Địa chỉ (English)'],
    ['phone', 'Điện thoại'], ['email', 'Email'], ['map_query', 'Từ khoá bản đồ Google Maps'], ['facebook_url', 'Facebook (URL)'],
  ]],
  ['Thông số nhà máy', [
    ['capacity_mw', 'Tổng công suất (MW) — dùng dấu chấm thập phân, vd 13.5'], ['units', 'Số tổ máy'],
    ['turbine_vi', 'Loại tua-bin (Tiếng Việt)'], ['turbine_en', 'Loại tua-bin (English)'],
    ['annual_output_kwh', 'Sản lượng bình quân năm (kWh) — chỉ nhập số, vd 46649100'],
    ['year_founded', 'Năm thành lập'], ['year_operation', 'Năm vận hành phát điện'],
    ['river_vi', 'Nguồn nước (Tiếng Việt)'], ['river_en', 'Nguồn nước (English)'],
    ['dam_vi', 'Kết cấu đập (Tiếng Việt)'], ['dam_en', 'Kết cấu đập (English)'],
    ['buyer_vi', 'Đơn vị mua điện (Tiếng Việt)'], ['buyer_en', 'Đơn vị mua điện (English)'],
  ]],
];

router.get('/settings', (req, res) => res.render('admin/settings', { groups: SETTING_GROUPS, s: getSettings() }));

router.post('/settings', requireCsrf, (req, res) => {
  const values = {};
  for (const [, fields] of SETTING_GROUPS) for (const [k] of fields) values[k] = String(req.body[k] ?? '').trim();
  values.capacity_mw = values.capacity_mw.replace(',', '.');
  values.annual_output_kwh = values.annual_output_kwh.replace(/[^\d]/g, '');
  saveSettings(values);
  flash(req, 'success', 'Đã lưu cấu hình.');
  res.redirect('/admin/settings');
});

// ================= Tài khoản người dùng (chỉ Quản trị viên) =================
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const adminCount = () => db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n;

router.get('/users', (req, res) => {
  const rows = db.prepare('SELECT id, username, display_name, role, last_login_at, created_at FROM users ORDER BY role, username').all();
  res.render('admin/users', { rows });
});

router.get('/users/new', (req, res) => {
  res.render('admin/user-form', { u: { role: 'editor' }, errors: {}, isNew: true });
});

router.get('/users/:id/edit', (req, res, next) => {
  const u = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(req.params.id);
  if (!u) return next();
  res.render('admin/user-form', { u, errors: {}, isNew: false });
});

function saveUser(req, res, next) {
  const id = req.params.id ? Number(req.params.id) : null;
  const existing = id ? db.prepare('SELECT * FROM users WHERE id = ?').get(id) : null;
  if (id && !existing) return next();
  const isSelf = existing && existing.id === req.user.id;
  const u = {
    id,
    username: existing ? existing.username : String(req.body.username || '').trim().toLowerCase(),
    display_name: String(req.body.display_name || '').trim().slice(0, 80),
    role: isSelf ? existing.role : (ROLES[req.body.role] ? req.body.role : 'editor'),
  };
  const password = String(req.body.password || '');
  const errors = {};
  if (!existing) {
    if (!USERNAME_RE.test(u.username)) errors.username = 'Tên đăng nhập 3–32 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới, gạch ngang.';
    else if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(u.username)) errors.username = 'Tên đăng nhập đã tồn tại.';
  }
  if (!existing || password) {
    if (password.length < 10) errors.password = 'Mật khẩu cần ít nhất 10 ký tự.';
    else if (password !== String(req.body.confirm || '')) errors.confirm = 'Xác nhận mật khẩu không khớp.';
  }
  if (existing && existing.role === 'admin' && u.role !== 'admin' && adminCount() <= 1) {
    errors.role = 'Cần giữ ít nhất một Quản trị viên.';
  }
  if (Object.keys(errors).length) {
    res.status(422);
    return res.render('admin/user-form', { u, errors, isNew: !existing });
  }
  if (existing) {
    db.prepare('UPDATE users SET display_name = ?, role = ? WHERE id = ?').run(u.display_name, u.role, id);
    if (password) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), id);
  } else {
    db.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
      .run(u.username, bcrypt.hashSync(password, 12), u.role, u.display_name);
  }
  flash(req, 'success', existing ? `Đã cập nhật tài khoản ${u.username}.` : `Đã tạo tài khoản ${u.username}.`);
  res.redirect('/admin/users');
}

router.post('/users', requireCsrf, saveUser);
router.post('/users/:id', requireCsrf, saveUser);

router.post('/users/:id/delete', requireCsrf, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.redirect('/admin/users');
  if (u.id === req.user.id) flash(req, 'error', 'Không thể xoá tài khoản đang đăng nhập.');
  else if (u.role === 'admin' && adminCount() <= 1) flash(req, 'error', 'Cần giữ ít nhất một Quản trị viên.');
  else {
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    flash(req, 'success', `Đã xoá tài khoản ${u.username}.`);
  }
  res.redirect('/admin/users');
});

// ================= Tài khoản =================
router.get('/account', (req, res) => res.render('admin/account', { error: null }));

router.post('/account', requireCsrf, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const { current = '', password = '', confirm = '' } = req.body;
  let error = null;
  if (!user || !bcrypt.compareSync(current, user.password_hash)) error = 'Mật khẩu hiện tại không đúng.';
  else if (password.length < 10) error = 'Mật khẩu mới cần ít nhất 10 ký tự.';
  else if (password !== confirm) error = 'Xác nhận mật khẩu không khớp.';
  if (error) return res.status(422).render('admin/account', { error });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), user.id);
  flash(req, 'success', 'Đã đổi mật khẩu.');
  res.redirect('/admin/account');
});

module.exports = router;
