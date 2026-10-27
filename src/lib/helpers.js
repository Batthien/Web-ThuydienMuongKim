const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
const gallery = require('../../content/gallery.json');

const galleryWidths = new Map(gallery.map((g) => [g.src, g]));

marked.setOptions({ gfm: true, breaks: false });

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Markdown (do quản trị viên nhập) -> HTML an toàn, ảnh tự lazy-load */
function renderMarkdown(md) {
  const html = marked.parse(String(md || ''));
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3', 'figure', 'figcaption']),
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      th: ['align'], td: ['align'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy', decoding: 'async' } }),
      a: (tag, attribs) => {
        const external = /^https?:\/\//.test(attribs.href || '');
        return { tagName: 'a', attribs: external ? { ...attribs, target: '_blank', rel: 'noopener noreferrer' } : attribs };
      },
    },
  });
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'bai-viet';
}

function formatNumber(value, locale, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat(locale, digits == null ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

function formatDate(value, locale, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!value) return '';
  const d = new Date(String(value).length <= 10 ? value + 'T00:00:00' : value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Ảnh responsive. base = '/media/plant/plant-01' (không đuôi) — các bản -640/-1280/-1920.webp.
 * Ảnh ngoài hệ thống (đường dẫn có đuôi) được dùng nguyên bản.
 */
function img(base, alt, { sizes = '100vw', cls = '', eager = false, width, height } = {}) {
  if (!base) return '';
  const attrs = [];
  if (/\.(webp|jpe?g|png|gif|svg|avif)$/i.test(base)) {
    attrs.push(`src="${escapeHtml(base)}"`);
  } else {
    const g = galleryWidths.get(base);
    const widths = g ? g.widths : [640, 1280];
    const ratio = g ? g.ratio : 16 / 9;
    const largest = widths[widths.length - 1];
    attrs.push(`src="${base}-${widths.includes(1280) ? 1280 : largest}.webp"`);
    attrs.push(`srcset="${widths.map((w) => `${base}-${w}.webp ${w}w`).join(', ')}"`);
    attrs.push(`sizes="${sizes}"`);
    attrs.push(`width="${width || 1280}" height="${height || Math.round((width || 1280) / ratio)}"`);
  }
  attrs.push(`alt="${escapeHtml(alt)}"`);
  if (cls) attrs.push(`class="${cls}"`);
  attrs.push(eager ? 'fetchpriority="high"' : 'loading="lazy"');
  attrs.push('decoding="async"');
  return `<img ${attrs.join(' ')}>`;
}

function imgUrl(base, w = 1280) {
  if (!base) return '';
  if (/\.(webp|jpe?g|png)$/i.test(base)) return base;
  const g = galleryWidths.get(base);
  const widths = g ? g.widths : [640, 1280];
  const pick = widths.includes(w) ? w : widths[widths.length - 1];
  return `${base}-${pick}.webp`;
}

function truncate(s, n = 160) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

module.exports = { escapeHtml, renderMarkdown, slugify, formatNumber, formatDate, formatBytes, img, imgUrl, truncate, gallery };
