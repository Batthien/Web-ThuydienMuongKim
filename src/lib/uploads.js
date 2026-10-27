const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');
const config = require('../config');
const { slugify } = require('./helpers');

const dirs = {
  cv: path.join(config.uploadDir, 'cv'), // riêng tư — chỉ admin tải
  docs: path.join(config.uploadDir, 'docs'), // công khai — tài liệu cổ đông
  images: path.join(config.uploadDir, 'images'), // công khai — ảnh bài viết
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

function safeName(original) {
  const ext = path.extname(original).toLowerCase();
  const base = slugify(path.basename(original, ext)).slice(0, 50);
  return `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${base}${ext}`;
}

const CV_TYPES = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

const cvUpload = multer({
  storage: multer.diskStorage({ destination: dirs.cv, filename: (req, f, cb) => cb(null, safeName(f.originalname)) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
  fileFilter: (req, f, cb) => {
    const ext = path.extname(f.originalname).toLowerCase();
    const ok = CV_TYPES[ext] && CV_TYPES[ext].includes(f.mimetype);
    if (!ok) req.fileRejected = true;
    cb(null, Boolean(ok));
  },
});

const docUpload = multer({
  storage: multer.diskStorage({ destination: dirs.docs, filename: (req, f, cb) => cb(null, safeName(f.originalname)) }),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, /\.(pdf|docx?|xlsx?|zip)$/i.test(f.originalname)),
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)),
});

/** Lưu ảnh tải lên thành 2 bản WebP (640 & 1280). Trả về đường dẫn gốc (không đuôi). */
async function saveImage(buffer, originalName) {
  const base = safeName(originalName).replace(/\.[^.]+$/, '');
  const img = sharp(buffer).rotate();
  for (const w of [640, 1280]) {
    await img.clone().resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 78 }).toFile(path.join(dirs.images, `${base}-${w}.webp`));
  }
  return `/uploads/images/${base}`;
}

function removeFile(dir, name) {
  if (!name) return;
  const p = path.join(dir, path.basename(name));
  fs.rm(p, { force: true }, () => {});
}

module.exports = { dirs, cvUpload, docUpload, imageUpload, saveImage, removeFile };
