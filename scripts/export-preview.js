/**
 * Xuất toàn bộ website (VI + EN) thành MỘT file HTML tự chứa để gửi người khác xem & góp ý.
 *   npm run export            -> ../MuongKim-Website-XemThu.html
 *   npm run export -- <đường-dẫn-file.html>
 * Ảnh được nén nhỏ và nhúng sẵn; chuyển trang bằng #/vi/..., form không gửi được (bản xem thử).
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '..', 'MuongKim-Website-XemThu.html'));
process.env.SMTP_HOST = '';

const app = require('../server');
const { db } = require('../src/db');
const { ROUTES, url } = require('../src/i18n');
const framing = require('../src/lib/framing');

const IMG_RE = /\/(?:media|uploads\/images)\/[^"'\s,)]+?(?:-(?:640|1280|1920))\.webp|\/img\/[\w.-]+\.(?:png|webp|jpg)|\/favicon\.png/g;

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  // Danh sách trang
  const routes = [];
  for (const lang of ['vi', 'en']) {
    for (const key of Object.keys(ROUTES)) routes.push(url(lang, key));
    for (const p of require('../locales/vi').plant.plants) routes.push(url(lang, 'plant', p.id));
    for (const p of db.prepare("SELECT slug FROM posts WHERE status='published' AND published_at <= date('now','+7 hours')").all()) routes.push(url(lang, 'news', p.slug));
    for (const j of db.prepare("SELECT slug FROM jobs WHERE status='published'").all()) routes.push(url(lang, 'careers', j.slug));
  }

  const pages = {};
  const images = new Map(); // khoá ảnh (bỏ hậu tố kích thước) -> mã
  const tokenFor = (u) => {
    const key = u.replace(/-(640|1280|1920)\.webp$/, '');
    if (!images.has(key)) images.set(key, { id: images.size, variants: new Set() });
    images.get(key).variants.add(u);
    return `mkimg${images.get(key).id}`;
  };

  let sprite = '';
  for (const r of routes) {
    const html = await (await fetch(base + r)).text();
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const bodyClass = (html.match(/<body class="([^"]*)"/) || [])[1] || '';
    let body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1, html.lastIndexOf('</body>'));
    if (!sprite) sprite = (body.match(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="svg-sprite"[\s\S]*?<\/svg>/) || [''])[0];
    body = body
      .replace(/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="svg-sprite"[\s\S]*?<\/svg>/, '')
      .replace(/<script(?![^>]*application\/json)[^>]*>[\s\S]*?<\/script>/g, '') // giữ lại thẻ dữ liệu JSON của biểu đồ
      .replace(/ (?:data-)?(?:srcset|sizes)="[^"]*"/g, '') // mỗi ảnh chỉ còn 1 nguồn để nhúng trực tiếp
      // Đánh dấu ảnh để áp dụng căn chỉnh đã lưu (đường dẫn ảnh sẽ được thay bằng dữ liệu nhúng)
      .replace(/<img ([^>]*?)(data-src|(?<![\w-])src)="([^"]+?)(-(?:640|1280|1920)\.webp)"/g, '<img $1data-k="$3" $2="$3$4"')
      .replace(IMG_RE, (m) => tokenFor(m))
      .replace(/href="\/admin[^"]*"/g, 'href="#" data-preview-disabled')
      .replace(/href="(\/(?:vi|en)(?:\/[^"#?]*)?)(?:\?[^"#]*)?(#[^"]*)?"/g, (m, p, a) => `href="#${p}${a || ''}"`)
      .replace(/(<a\b[^>]*?\s)href="#([A-Za-z][\w-]*)"/g, (m, pre, a) => `${pre}href="#${r}#${a}"`) // liên kết <a> tới mục trong cùng trang (không đụng biểu tượng <use>)
      .replace(/action="[^"]*"/g, 'action="#" data-preview-form')
      // Video không nhúng được vào 1 file: trỏ tới tệp gốc trong thư mục dự án (xem được khi mở bản xem thử trên máy này)
      .replace(/src="\/uploads\/videos\/([^"]+)"/g, (m, f) => `src="${path.relative(path.dirname(OUT), path.join(ROOT, 'uploads', 'videos', f)).split(path.sep).join('/')}"`);
    pages[r] = { title, bodyClass, body };
    process.stdout.write('.');
  }
  server.close();

  // Nén & nhúng ảnh — JPEG/PNG để mọi trình duyệt (kể cả bản cũ) đều đọc được
  const imgData = [];
  for (const [key, info] of images) {
    const variants = [...info.variants].sort();
    const best = variants.find((v) => v.includes('-1280')) || variants[variants.length - 1];
    const file = best.startsWith('/uploads/') ? path.join(ROOT, best) : path.join(ROOT, 'public', best);
    let buf;
    let mime = 'image/jpeg';
    if (best.startsWith('/img/') || best === '/favicon.png') {
      // Logo & biểu tượng: giữ nền trong suốt
      buf = await sharp(file).png({ compressionLevel: 9 }).toBuffer();
      mime = 'image/png';
    } else {
      buf = await sharp(file).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 64, mozjpeg: true }).toBuffer();
    }
    imgData[info.id] = `data:${mime};base64,${buf.toString('base64')}`;
    process.stdout.write('+');
  }

  const css = fs.readFileSync(path.join(ROOT, 'public/css/site.css'), 'utf8');
  const siteJs = fs.readFileSync(path.join(ROOT, 'public/js/site.js'), 'utf8');

  const out = `<!doctype html>
<html lang="vi" class="js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bản xem thử – Website Thủy điện Mường Kim</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap">
<style>${css}
${framing.buildCss((image) => `img[data-k="${image}"]`)}
.preview-badge { position: fixed; left: 12px; bottom: 12px; z-index: 300; background: #e4572e; color: #fff; font: 600 13px/1.3 var(--font); padding: 8px 14px; border-radius: 999px; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
</style>
</head>
<body>
${sprite}
<div id="preview-root"></div>
<div class="preview-badge">Bản xem thử – để góp ý</div>
<script>
const PAGES = ${JSON.stringify(pages).replace(/</g, '\\u003c')};
const IMGS = ${JSON.stringify(imgData)};
// Mỗi lần chuyển trang, mã của website chạy lại trên cùng một tài liệu: ghi nhận hẹn giờ / sự kiện / bộ quan sát
// của trang trước để dọn đi, tránh chồng chất làm chậm dần.
const tracked = { timers: [], intervals: [], listeners: [], observers: [] };
const nativeST = window.setTimeout, nativeSI = window.setInterval, nativeAEL = EventTarget.prototype.addEventListener;
const NativeIO = window.IntersectionObserver;
function sandbox(fn) {
  window.setTimeout = (...a) => { const id = nativeST.apply(window, a); tracked.timers.push(id); return id; };
  window.setInterval = (...a) => { const id = nativeSI.apply(window, a); tracked.intervals.push(id); return id; };
  EventTarget.prototype.addEventListener = function (type, cb, opts) {
    if (this === window || this === document || (window.MediaQueryList && this instanceof MediaQueryList)) tracked.listeners.push([this, type, cb, opts]);
    return nativeAEL.call(this, type, cb, opts);
  };
  if (NativeIO) window.IntersectionObserver = function (cb, o) { const io = new NativeIO(cb, o); tracked.observers.push(io); return io; };
  try { fn(); } finally {
    EventTarget.prototype.addEventListener = nativeAEL;
    if (NativeIO) window.IntersectionObserver = NativeIO;
    // setTimeout giữ bản ghi nhận vì trình chiếu tự hẹn giờ lại liên tục
  }
}
function cleanup() {
  tracked.timers.forEach((id) => clearTimeout(id));
  tracked.intervals.forEach((id) => clearInterval(id));
  tracked.listeners.forEach(([t, type, cb, opts]) => t.removeEventListener(type, cb, opts));
  tracked.observers.forEach((io) => io.disconnect());
  tracked.timers = []; tracked.intervals = []; tracked.listeners = []; tracked.observers = [];
}
window.__mkImg = (u) => u.replace(/mkimg(\\d+)/, (m, i) => IMGS[i]);
const runSite = () => {
${siteJs}
};
function render() {
  const full = decodeURIComponent(location.hash.slice(1)) || '/vi';
  let [route, anchor] = full.split('#');
  if (!PAGES[route]) route = route.startsWith('/en') ? '/en' : '/vi';
  const p = PAGES[route];
  const root = document.getElementById('preview-root');
  cleanup(); // dọn mã của trang trước
  root.innerHTML = p.body.replace(/(data-src=")?mkimg(\\d+)/g, (m, pre, i) => (pre ? m : IMGS[i])); // ảnh nhúng trực tiếp; ảnh hoãn giữ mã tới khi cần
  document.title = p.title.replace(/&amp;/g, '&');
  document.body.className = p.bodyClass;
  document.documentElement.lang = route.slice(1, 3);
  root.querySelectorAll('[data-preview-disabled]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); alert('Bản xem thử: trang quản trị chỉ dùng được trên website thật.');
  }));
  root.querySelectorAll('form[data-preview-form]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault(); e.stopImmediatePropagation(); alert('Bản xem thử: biểu mẫu chưa gửi được. Trên website thật, tin nhắn sẽ được gửi tới Công ty.');
  }, true));
  sandbox(runSite);
  // Về đầu trang mới (sau khi nội dung đã dựng xong)
  requestAnimationFrame(() => {
    const el = anchor && document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: 'instant' }); else window.scrollTo({ top: 0, behavior: 'instant' });
  });
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.addEventListener('hashchange', render);
render();
</script>
</body>
</html>`;

  fs.writeFileSync(OUT, out);
  console.log(`\nĐã xuất ${Object.keys(pages).length} trang, ${images.size} ảnh -> ${OUT} (${(out.length / 1024 / 1024).toFixed(1)} MB)`);
  db.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
