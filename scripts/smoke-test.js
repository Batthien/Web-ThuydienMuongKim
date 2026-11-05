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
  ok((await (await req('/vi')).text()).includes('id="ket-qua-sxkd"'), 'Trang chủ có biểu đồ kết quả SXKD');
  ok((await req('/vi/khong-ton-tai')).status === 404, '404 cho trang không tồn tại');
  ok((await req('/en/gioi-thieu')).status === 404, '404 khi dùng slug sai ngôn ngữ');

  const postHtml = await (await req('/vi/tin-tuc/ky-niem-10-nam-thanh-lap-cong-ty')).text();
  ok(postHtml.includes('anniversary-post-01') && postHtml.includes('anniversary-post-06'), 'Bài kỷ niệm 10 năm có ảnh mới');
  ok(!(await (await req('/vi/thu-vien')).text()).includes('anniversary-post'), 'Ảnh riêng của bài không vào Thư viện');

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
  for (const p of ['/admin', '/admin/posts', '/admin/posts/new', '/admin/posts/1/edit', '/admin/jobs', '/admin/jobs/new', '/admin/documents', '/admin/documents/new', '/admin/production', '/admin/production/new', '/admin/production/1/edit', '/admin/messages', '/admin/messages/1', '/admin/messages/2', '/admin/settings', '/admin/account']) {
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

  html = await (await req('/admin/production/new')).text();
  csrf = csrfFrom(html);
  const pf = new FormData();
  for (const [k, v] of Object.entries({ _csrf: csrf, year: '2026', plant_vi: 'Thủy điện Mường Kim', sort: '1', output_plan: '50 000 000', output_actual: '', revenue_plan: '70000,5', revenue_actual: '' })) pf.append(k, v);
  r = await req('/admin/production', { method: 'POST', body: pf });
  const saved = require('../src/db').db.prepare('SELECT * FROM production WHERE year = 2026').get();
  ok(r.status === 302 && saved && saved.output_actual === null && saved.output_plan === 50000000 && saved.revenue_plan === 70000.5, 'Lưu số liệu sản xuất (ô trống = chưa có số liệu)');

  console.log('Tiêu đề mục biểu đồ');
  html = await (await req('/vi')).text();
  ok(!html.includes('prod-source') && !html.includes('Nguồn: Báo cáo'), 'Trang chủ không còn dòng nguồn');
  html = await (await req('/admin/settings')).text();
  ok(html.includes('name="prod_title_vi"') && html.includes('<textarea id="s-prod_lead_en"'), 'Cấu hình có ô tiêu đề và giới thiệu');
  // Gửi lại toàn bộ giá trị hiện có, chỉ đổi tiêu đề & giới thiệu
  const sf = new URLSearchParams();
  for (const m of html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) sf.set(m[1], m[2]);
  sf.set('prod_title_vi', 'Tiêu đề thử <nghiệm>');
  sf.set('prod_lead_vi', 'Giới thiệu thử nghiệm');
  sf.set('prod_title_en', '');
  r = await req('/admin/settings', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: sf });
  html = await (await req('/vi')).text();
  ok(r.status === 302 && html.includes('Tiêu đề thử &lt;nghiệm&gt;') && html.includes('Giới thiệu thử nghiệm'), 'Sửa tiêu đề và giới thiệu trong CMS, trang chủ cập nhật');
  ok((await (await req('/en')).text()).includes('Production &amp; business results'), 'Để trống thì dùng lại nội dung mặc định');
  ok((await (await req('/admin/settings')).text()).includes('value="5200823899"'), 'Các cấu hình khác không bị mất');

  console.log('Căn chỉnh ảnh');
  html = await (await req('/vi')).text();
  ok(html.includes('/js/image-editor.js'), 'Quản trị viên có công cụ căn chỉnh ảnh');
  const token = (html.match(/data-csrf="([^"]+)"/) || [])[1];
  const framing = (body, t = token) => req('/admin/image-framing', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': t }, body: JSON.stringify(body) });
  r = await framing({ slot: 'gallery', image: '/media/plant/plant-03', x: 20, y: 70, zoom: 1.5 });
  ok(r.status === 200, 'Lưu căn chỉnh ảnh');
  let css = await (await req('/image-framing.css')).text();
  ok(css.includes('.mosaic__item img[src^="/media/plant/plant-03-"]') && css.includes('object-position: 20% 70%') && css.includes('scale(1.5)'), 'CSS áp dụng vị trí và độ phóng');
  ok((await framing({ slot: 'gallery', image: '/media/x"}body{display:none', x: 1, y: 1, zoom: 1 })).status === 400, 'Từ chối đường dẫn ảnh không hợp lệ');
  ok((await framing({ slot: 'gallery', image: '/media/plant/plant-03', x: 500, y: 1, zoom: 1 })).status === 400, 'Từ chối vị trí ngoài phạm vi');
  ok((await framing({ slot: 'nope', image: '/media/plant/plant-03', x: 1, y: 1, zoom: 1 })).status === 400, 'Từ chối loại khung không hợp lệ');
  ok((await framing({ slot: 'gallery', image: '/media/plant/plant-03', x: 1, y: 1, zoom: 1 }, 'sai')).status === 403, 'Chặn khi CSRF sai');
  r = await framing({ slot: 'gallery', image: '/media/plant/plant-03', reset: true });
  css = await (await req('/image-framing.css')).text();
  ok(r.status === 200 && !css.includes('plant-03'), 'Đặt lại căn chỉnh ảnh');

  console.log('Tài khoản & phân quyền');
  ok((await (await req('/vi')).text()).includes('/admin'), 'Website có nút Quản trị khi đã đăng nhập');
  ok((await req('/admin/users')).status === 200, '200 /admin/users');
  html = await (await req('/admin/users/new')).text();
  csrf = csrfFrom(html);
  const form = (o) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrf, ...o }) });
  r = await req('/admin/users', form({ username: 'Bad Name', password: 'short', confirm: 'x', role: 'editor' }));
  ok(r.status === 422, 'Báo lỗi khi tạo tài khoản sai (422)');
  r = await req('/admin/users', form({ username: 'bientap', display_name: 'Biên tập', password: 'editor-password-1', confirm: 'editor-password-1', role: 'editor' }));
  ok(r.status === 302, 'Tạo tài khoản Biên tập viên');
  r = await req('/admin/users/1/delete', form({}));
  ok(r.status === 302 && (await (await req('/admin/users')).text()).includes('Không thể xoá tài khoản đang đăng nhập'), 'Không cho xoá chính mình');
  await req('/admin/logout', form({}));
  ok((await (await req('/vi')).text()).includes('/admin/login'), 'Website hiện nút Đăng nhập khi chưa đăng nhập');
  html = await (await req('/admin/login')).text();
  csrf = csrfFrom(html);
  r = await req('/admin/login', form({ username: 'bientap', password: 'editor-password-1', next: '/admin' }));
  ok(r.status === 302 && r.headers.get('location') === '/admin/posts', 'Biên tập viên đăng nhập → Tin tức');
  ok((await req('/admin/posts')).status === 200, 'Biên tập viên vào được Tin tức');
  ok((await req('/admin/posts/new')).status === 200, 'Biên tập viên tạo được bài viết');
  html = await (await req('/vi')).text();
  ok(!html.includes('/js/image-editor.js'), 'Biên tập viên không có công cụ căn chỉnh ảnh');
  r = await req('/admin/image-framing', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ slot: 'gallery', image: '/media/plant/plant-03', x: 1, y: 1, zoom: 1 }) });
  ok(r.status === 302 && !(await (await req('/image-framing.css')).text()).includes('plant-03'), 'Biên tập viên không lưu được căn chỉnh');
  for (const p of ['/admin', '/admin/messages', '/admin/documents', '/admin/settings', '/admin/users', '/admin/messages/2/attachment']) {
    const res = await req(p);
    ok(res.status === 302 && res.headers.get('location') === '/admin/posts', `Biên tập viên bị chặn ${p}`);
  }

  server.close();
  require('../src/db').db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows có thể còn khoá tệp WAL */ }
  console.log(failures ? `\n${failures} kiểm tra THẤT BẠI` : '\nTất cả kiểm tra đều đạt');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
