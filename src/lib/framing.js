const { db } = require('../db');

// Vị trí khung hiển thị ảnh: cùng một ảnh có thể căn khác nhau ở mỗi loại khung
const SLOTS = {
  hero: ['.hero-slides'],
  card: ['.news-card__media'],
  gallery: ['.gallery-grid__item', '.mosaic__item', '.mini-grid figure'],
  article: ['.article__cover', '.prose'],
  feature: ['.collage__main', '.collage__sub', '.rounded-media'],
  band: ['.cta-band__media', '.process__bg'],
};

const IMAGE_RE = /^\/(?:media|uploads\/images)\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;
const MAX_ZOOM = 4;

const q = {
  all: db.prepare('SELECT slot, image, x, y, zoom FROM image_framing ORDER BY slot, image'),
  save: db.prepare(`INSERT INTO image_framing (slot, image, x, y, zoom) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slot, image) DO UPDATE SET x = excluded.x, y = excluded.y, zoom = excluded.zoom, updated_at = datetime('now')`),
  remove: db.prepare('DELETE FROM image_framing WHERE slot = ? AND image = ?'),
};

/** Kiểm tra dữ liệu gửi lên; các giá trị này được đưa vào CSS nên phải chặt chẽ */
function parse(body) {
  const slot = String(body.slot || '');
  const image = String(body.image || '');
  if (!Object.hasOwn(SLOTS, slot) || !IMAGE_RE.test(image)) return null;
  if (body.reset === true) return { slot, image, reset: true };
  const x = Number(body.x), y = Number(body.y), zoom = Number(body.zoom);
  if (![x, y, zoom].every(Number.isFinite) || x < 0 || x > 100 || y < 0 || y > 100 || zoom < 1 || zoom > MAX_ZOOM) return null;
  return { slot, image, x, y, zoom };
}

function save({ slot, image, x, y, zoom }) {
  q.save.run(slot, image, Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round(zoom * 1000) / 1000);
}

function reset({ slot, image }) {
  q.remove.run(slot, image);
}

/**
 * Sinh CSS từ các căn chỉnh đã lưu. Dùng !important để thắng các quy tắc mặc định và hiệu ứng hover.
 * selectorFor nhận đường dẫn ảnh, trả về bộ chọn thuộc tính của thẻ img.
 */
function buildCss(selectorFor = (image) => `img[src^="${image}-"]`) {
  return q.all.all().map((r) => {
    const selector = SLOTS[r.slot].map((s) => `${s} ${selectorFor(r.image)}`).join(', ');
    const zoom = r.zoom > 1 ? ` transform: scale(${r.zoom}) !important; transform-origin: ${r.x}% ${r.y}% !important;` : '';
    return `${selector} { object-position: ${r.x}% ${r.y}% !important;${zoom} }`;
  }).join('\n');
}

module.exports = { SLOTS, MAX_ZOOM, parse, save, reset, buildCss };
