// Kiểm tra nhanh toàn bộ trang + form + đăng nhập trên CSDL tạm:  npm run check
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-smoke-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DATA_DIR: path.join(tmp, 'data'), UPLOAD_DIR: path.join(tmp, 'uploads'),
  ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'smoke-test-password', SMTP_HOST: '',
});
const app = require('../server');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const req = async (p, opts = {}) => {
    const res = await fetch(base + p, { redirect: 'manual', ...opts, headers: { cookie, ...(opts.headers || {}) } });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return res;
  };
  const csrfFrom = (html) => (html.match(/name="_csrf" value="([^"]+)"/) || [])[1];

  console.log('Trang công khai');
  const pages = ['/vi', '/en', '/vi/gioi-thieu', '/en/about', '/vi/nha-may', '/en/power-plant', '/vi/co-dong', '/en/investors',
    '/vi/tin-tuc', '/en/news', '/vi/tuyen-dung', '/en/careers', '/vi/thu-vien', '/en/gallery', '/vi/lien-he', '/en/contact',
    '/vi/tin-tuc/ky-niem-10-nam-thanh-lap-cong-ty', '/en/news/ky-niem-10-nam-thanh-lap-cong-ty', '/sitemap.xml', '/robots.txt'];
  for (const p of pages) {
    const r = await req(p);
    const body = await r.text();
    ok(r.status === 200 && !/undefined|NaN|\[object Object\]/.test(body.replace(/<script[\s\S]*?<\/script>/g, '')), `${r.status} ${p}`);
  }
  ok((await req('/')).status === 302, 'Trang gốc chuyển hướng theo ngôn ngữ');
  ok((await req('/vi/khong-ton-tai')).status === 404, '404 cho trang không tồn tại');
  ok((await req('/en/gioi-thieu')).status === 404, '404 khi dùng slug sai ngôn ngữ');

  console.log('Form liên hệ');
  let html = await (await req('/vi/lien-he')).text();
  let csrf = csrfFrom(html);
  let r = await req('/vi/lien-he', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrf, name: 'A', email: 'x' }) });
  ok(r.status === 422, 'Báo lỗi khi dữ liệu sai (422)');
  r = await req('/vi/lien-he', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: 'sai', name: 'Nguyễn Văn A', email: 'a@b.vn', message: 'Xin chào công ty', consent: 'on' }) });
  ok(r.status === 403, 'Chặn khi CSRF sai (403)');
  r = await req('/vi/lien-he', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrf, name: 'Nguyễn Văn A', email: 'a@b.vn', phone: '0912 345 678', topic: 'partnership', message: 'Xin chào, tôi muốn hợp tác.', consent: 'on' }) });
  ok(r.status === 303, 'Gửi liên hệ hợp lệ (303)');

  console.log('Form ứng tuyển');
  html = await (await req('/en/careers')).text();
  csrf = csrfFrom(html);
  const fd = new FormData();
  fd.append('_csrf', csrf); fd.append('name', 'Tran B'); fd.append('email', 'b@c.com'); fd.append('consent', 'on');
  fd.append('cv', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'cv.pdf');
  r = await req('/en/careers', { method: 'POST', body: fd });
  ok(r.status === 303, 'Nộp hồ sơ kèm CV (303)');

  console.log('Quản trị');
  ok((await req('/admin')).status === 302, 'Chưa đăng nhập bị chuyển về /admin/login');
  html = await (await req('/admin/login')).text();
  csrf = csrfFrom(html);
  r = await req('/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrf, username: 'admin', password: 'smoke-test-password', next: '/admin' }) });
  ok(r.status === 302 && r.headers.get('location') === '/admin', 'Đăng nhập thành công');
  for (const p of ['/admin', '/admin/posts', '/admin/posts/new', '/admin/posts/1/edit', '/admin/jobs', '/admin/jobs/new', '/admin/documents', '/admin/documents/new', '/admin/messages', '/admin/messages/1', '/admin/messages/2', '/admin/settings', '/admin/account']) {
    const res = await req(p);
    ok(res.status === 200, `${res.status} ${p}`);
  }
  html = await (await req('/admin/documents/new')).text();
  csrf = csrfFrom(html);
  const doc = new FormData();
  doc.append('_csrf', csrf); doc.append('title_vi', 'Báo cáo tài chính 2025'); doc.append('category', 'financial'); doc.append('year', '2025'); doc.append('published_at', '2026-03-30');
  doc.append('file_upload', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'bctc-2025.pdf');
  r = await req('/admin/documents', { method: 'POST', body: doc });
  ok(r.status === 302, 'Tải tài liệu cổ đông');
  html = await (await req('/vi/co-dong?cat=financial')).text();
  ok(html.includes('Báo cáo tài chính 2025'), 'Tài liệu hiển thị ở trang Cổ đông');
  r = await req('/admin/messages/2/attachment');
  ok(r.status === 200, 'Tải CV ứng viên');
  ok((await req('/uploads/cv/' + 'x.pdf')).status === 404, 'Thư mục CV không công khai');

  server.close();
  require('../src/db').db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows có thể còn khoá tệp WAL */ }
  console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra đều đạt');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
