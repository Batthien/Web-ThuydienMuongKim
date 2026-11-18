/**
 * Chuyển ảnh gốc của công ty (JPG dung lượng lớn) thành WebP nhiều kích thước cho website.
 * Chạy 1 lần trên máy có ảnh gốc:  npm run media  (MEDIA_SRC mặc định là thư mục cha của dự án)
 * Kết quả (public/media + data/gallery.json) được commit vào Git, VPS không cần ảnh gốc.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.resolve(process.env.MEDIA_SRC || path.join(ROOT, '..'));
const OUT = path.join(ROOT, 'public', 'media');
const WIDTHS = [640, 1280, 1920];
const manifest = require('./media-manifest.json');

async function processImage(src, album, index) {
  const base = `${album}-${String(index + 1).padStart(2, '0')}`;
  const dir = path.join(OUT, album);
  fs.mkdirSync(dir, { recursive: true });
  const input = sharp(path.join(SRC, src), { limitInputPixels: false }).rotate();
  const meta = await input.metadata();
  // Ảnh dọc/ngang sau khi xoay theo EXIF
  const swap = meta.orientation && meta.orientation >= 5;
  const w0 = swap ? meta.height : meta.width;
  const h0 = swap ? meta.width : meta.height;
  const widths = [];
  for (const w of WIDTHS) {
    if (w > w0 && widths.length) break;
    const target = Math.min(w, w0);
    await input.clone().resize({ width: target, withoutEnlargement: true })
      .webp({ quality: 74, effort: 5 })
      .toFile(path.join(dir, `${base}-${w}.webp`));
    widths.push(w);
  }
  return { album, src: `/media/${album}/${base}`, widths, ratio: +(w0 / h0).toFixed(4) };
}

async function processLogo() {
  const dir = path.join(ROOT, 'public', 'img');
  fs.mkdirSync(dir, { recursive: true });
  const trimmed = await sharp(path.join(SRC, 'Logo Muong Kim.jpg')).trim({ threshold: 20 }).toBuffer();
  const { data, info } = await sharp(trimmed).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // Nền trắng -> trong suốt (alpha theo độ sáng, mép mượt)
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    rgba[j] = data[i]; rgba[j + 1] = data[i + 1]; rgba[j + 2] = data[i + 2];
    rgba[j + 3] = Math.max(0, Math.min(255, Math.round(((250 - min) / 28) * 255)));
  }
  const logo = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });
  await logo.clone().resize({ width: 520 }).png({ compressionLevel: 9 }).toFile(path.join(dir, 'logo.png'));
  await logo.clone().resize({ width: 520 }).webp({ quality: 90 }).toFile(path.join(dir, 'logo.webp'));
  // Biểu tượng cánh quạt (phần bên trái logo) làm favicon
  const mark = logo.clone().extract({ left: 0, top: 0, width: Math.round(info.height * 0.8), height: Math.round(info.height * 0.8) });
  const markBuf = await mark.png().toBuffer();
  await sharp(markBuf).trim().resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(path.join(dir, 'mark.png'));
  await sharp(path.join(dir, 'mark.png')).resize(180, 180, { fit: 'contain', background: '#ffffff' })
    .flatten({ background: '#ffffff' }).png().toFile(path.join(dir, 'apple-touch-icon.png'));
  await sharp(path.join(dir, 'mark.png')).resize(48, 48).png().toFile(path.join(ROOT, 'public', 'favicon.png'));
}

async function processOg() {
  const dir = path.join(ROOT, 'public', 'img');
  await sharp(path.join(SRC, manifest.plant[3]))
    .resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(dir, 'og-image.jpg'));
}

/**
 * Tách logo thành 2 lớp để bánh xe công tác (cánh quạt bên trái) xoay được:
 * logo-base.webp (logo đã xoá cánh quạt) và logo-wheel.png (cánh quạt, tâm ảnh = tâm xoay).
 * Vị trí cánh quạt (% theo logo) ghi vào content/logo-wheel.json.
 */
async function processLogoWheel() {
  const dir = path.join(ROOT, 'public', 'img');
  const { data, info } = await sharp(path.join(dir, 'logo.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const alpha = (x, y) => data[(y * W + x) * 4 + 3];
  const rowFilled = (y) => { for (let x = 0; x < W; x++) if (alpha(x, y) > 40) return true; return false; };
  // Dòng chữ "MUONG KIM HYDRO POWER" ở đáy; cánh quạt nằm phía trên, bên trái chữ MK
  let y = H - 1;
  while (y > 0 && !rowFilled(y)) y--;
  while (y > 0 && rowFilled(y)) y--;
  while (y > 0 && !rowFilled(y)) y--;
  const top = y; // hàng cuối của phần phía trên dòng chữ
  const colFilled = (x) => { for (let yy = 0; yy <= top; yy++) if (alpha(x, yy) > 40) return true; return false; };
  let x0 = 0;
  while (!colFilled(x0)) x0++;
  let x1 = x0;
  while (colFilled(x1)) x1++; // x1 = cột trống đầu tiên giữa cánh quạt và chữ M

  // Tâm xoay = trọng tâm phần cánh quạt; bán kính = điểm xa nhất để không bị cắt khi xoay
  let sx = 0, sy = 0, n = 0;
  for (let yy = 0; yy <= top; yy++) for (let x = x0; x < x1; x++) {
    const a = alpha(x, yy);
    if (a > 40) { sx += x * a; sy += yy * a; n += a; }
  }
  const cx = sx / n, cy = sy / n;
  let r = 0;
  for (let yy = 0; yy <= top; yy++) for (let x = x0; x < x1; x++) {
    if (alpha(x, yy) > 40) r = Math.max(r, Math.hypot(x - cx, yy - cy));
  }
  r = Math.ceil(r) + 1;

  // Lớp cánh quạt: ảnh vuông 2r, tâm ảnh trùng tâm xoay
  const side = r * 2;
  const wheel = Buffer.alloc(side * side * 4);
  const base = Buffer.from(data);
  for (let yy = 0; yy <= top; yy++) for (let x = x0; x < x1; x++) {
    const i = (yy * W + x) * 4;
    const tx = Math.round(x - cx + r), ty = Math.round(yy - cy + r);
    if (tx >= 0 && ty >= 0 && tx < side && ty < side) data.copy(wheel, (ty * side + tx) * 4, i, i + 4);
    base[i + 3] = 0; // xoá cánh quạt khỏi lớp nền
  }
  await sharp(base, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 92 }).toFile(path.join(dir, 'logo-base.webp'));
  await sharp(wheel, { raw: { width: side, height: side, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(dir, 'logo-wheel.png'));
  const pct = (v, total) => +((v / total) * 100).toFixed(3);
  const pos = { left: pct(cx - r, W), top: pct(cy - r, H), width: pct(side, W) };
  fs.writeFileSync(path.join(ROOT, 'content', 'logo-wheel.json'), JSON.stringify(pos, null, 2));
  return pos;
}

// Chỉ tạo lại các lớp logo:  node scripts/import-media.js --logo
if (process.argv.includes('--logo')) {
  processLogoWheel().then((p) => console.log('Logo:', p)).catch((e) => { console.error(e); process.exit(1); });
  return;
}

// Chỉ xử lý (lại) một album, không đụng tới ảnh khác:  node scripts/import-media.js --album plant-mk2
const albumArg = process.argv.indexOf('--album');
if (albumArg !== -1) {
  const album = process.argv[albumArg + 1];
  if (!manifest[album]) { console.error('Không có album trong manifest:', album); process.exit(1); }
  (async () => {
    fs.rmSync(path.join(OUT, album), { recursive: true, force: true });
    const items = [];
    for (let i = 0; i < manifest[album].length; i++) { items.push(await processImage(manifest[album][i], album, i)); process.stdout.write('.'); }
    const file = path.join(ROOT, 'content', 'gallery.json');
    const gallery = JSON.parse(fs.readFileSync(file, 'utf8')).filter((g) => g.album !== album).concat(items);
    fs.writeFileSync(file, JSON.stringify(gallery, null, 2));
    console.log(`\nĐã xử lý ${items.length} ảnh album ${album}`);
  })().catch((e) => { console.error(e); process.exit(1); });
  return;
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  const gallery = [];
  for (const [album, files] of Object.entries(manifest)) {
    for (let i = 0; i < files.length; i++) {
      gallery.push(await processImage(files[i], album, i));
      process.stdout.write('.');
    }
  }
  await processLogo();
  await processLogoWheel();
  await processOg();
  fs.mkdirSync(path.join(ROOT, 'content'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'content', 'gallery.json'), JSON.stringify(gallery, null, 2));
  console.log(`\nĐã xử lý ${gallery.length} ảnh -> public/media`);
})().catch((e) => { console.error(e); process.exit(1); });
