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

const IMG_RE = /\/(?:media|uploads\/images)\/[^"'\s,)]+?(?:-(?:640|1280|1920))\.webp|\/img\/[\w.-]+\.(?:png|webp|jpg)|\/favicon\.png/g;

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  // Danh sách trang
  const routes = [];
  for (const lang of ['vi', 'en']) {
    for (const key of Object.keys(ROUTES)) routes.push(url(lang, key));
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
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/ (?:srcset|sizes)="[^"]*"/g, '') // mỗi ảnh chỉ còn 1 nguồn để nhúng trực tiếp
      .replace(IMG_RE, (m) => tokenFor(m))
      .replace(/href="\/admin[^"]*"/g, 'href="#" data-preview-disabled')
      .replace(/href="(\/(?:vi|en)(?:\/[^"#?]*)?)(?:\?[^"#]*)?(#[^"]*)?"/g, (m, p) => `href="#${p}"`)
      .replace(/action="[^"]*"/g, 'action="#" data-preview-form');
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
const runSite = () => {
${siteJs}
};
function render() {
  let route = decodeURIComponent(location.hash.slice(1)) || '/vi';
  if (!PAGES[route]) route = route.startsWith('/en') ? '/en' : '/vi';
  const p = PAGES[route];
  const root = document.getElementById('preview-root');
  root.innerHTML = p.body.replace(/mkimg(\\d+)/g, (m, i) => IMGS[i]); // ảnh nhúng trực tiếp (data URI), chạy được cả khi mở file từ ổ đĩa
  document.title = p.title.replace(/&amp;/g, '&');
  document.body.className = p.bodyClass;
  document.documentElement.lang = route.slice(1, 3);
  root.querySelectorAll('[data-preview-disabled]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); alert('Bản xem thử: trang quản trị chỉ dùng được trên website thật.');
  }));
  root.querySelectorAll('form[data-preview-form]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault(); e.stopImmediatePropagation(); alert('Bản xem thử: biểu mẫu chưa gửi được. Trên website thật, tin nhắn sẽ được gửi tới Công ty.');
  }, true));
  runSite();
  // Về đầu trang mới (sau khi nội dung đã dựng xong)
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
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
