// Các mục chính của Thư viện ảnh và album ảnh thuộc mỗi mục (thứ tự = thứ tự hiển thị)
const GALLERY_CATS = [
  ['plant', ['dam', 'plant', 'plant-mk2', 'plant-pl', 'plant-hb2']],
  ['office', ['office']],
  ['union', ['anniversary', 'sports', 'travel']],
  ['5s', ['5s']],
  ['safety', []],
  ['fire', ['safety']],
];

const catOf = (album) => (GALLERY_CATS.find(([, albums]) => albums.includes(album)) || [])[0] || null;

module.exports = { GALLERY_CATS, catOf };
