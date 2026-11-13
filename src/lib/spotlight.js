// Khối "tin nổi bật" trên trang chủ: mỗi ô là một mục của website, trong ô tự chuyển lần lượt các tin
const h = require('./helpers');

const GALLERY_ALBUMS = ['dam', 'plant', 'office', 'safety', 'anniversary', 'sports', 'travel'];
const IR_FALLBACK_IMAGES = ['/media/office/office-06', '/media/plant/plant-01', '/media/dam/dam-01', '/media/plant/plant-04', '/media/office/office-01'];
const CAREER_IMAGES = ['/media/plant/plant-02', '/media/sports/sports-01', '/media/office/office-06'];

const firstOf = (album) => (h.gallery.find((g) => g.album === album) || {}).src;
const exists = (src) => src && (h.gallery.some((g) => g.src === src) || src.startsWith('/uploads/'));
const pickImage = (list, i) => {
  const ok = list.filter(exists);
  return ok.length ? ok[i % ok.length] : firstOf('plant');
};

/**
 * Trả về các ô theo thứ tự hiển thị: Tin tức, Nhà máy, Cổ đông, Tuyển dụng, Thư viện.
 * Mỗi ô: { key, label, href, items: [{ image, title, meta, href, external }] }
 */
function build({ t, url, loc, posts, docs, jobs, IR_CATEGORIES }) {
  const L = t('locale');
  const date = (d) => h.formatDate(d, L);

  const news = posts.map((p) => ({
    image: p.cover,
    title: loc(p, 'title'),
    meta: date(p.published_at),
    icon: 'calendar',
    href: url('news', p.slug),
  }));

  const plant = [
    { image: '/media/plant/plant-03', title: t('plant.houseTitle') },
    { image: '/media/dam/dam-01', title: t('plant.damTitle') },
    { image: '/media/plant/plant-04', title: t('plant.specsTitle') },
    { image: '/media/safety/safety-04', title: t('plant.safetyTitle') },
  ].filter((x) => exists(x.image)).map((x) => ({
    image: x.image,
    title: x.title,
    meta: t('nav.plant'),
    icon: 'zap',
    href: url('plant'),
  }));

  const ir = docs.length
    ? docs.map((d, i) => ({
      image: pickImage(IR_FALLBACK_IMAGES, i),
      title: loc(d, 'title'),
      meta: `${t('ir.categories.' + d.category)} · ${date(d.published_at)}`,
      icon: 'file',
      href: `/uploads/docs/${d.file}`,
      external: true,
    }))
    : IR_CATEGORIES.map((c, i) => ({
      image: pickImage(IR_FALLBACK_IMAGES, i),
      title: t('ir.categories.' + c),
      meta: t('nav.ir'),
      icon: 'file',
      href: `${url('ir')}?cat=${c}`,
    }));

  const careers = jobs.length
    ? jobs.map((j, i) => ({
      image: pickImage(CAREER_IMAGES, i),
      title: loc(j, 'title'),
      meta: loc(j, 'location') || t('nav.careers'),
      icon: 'briefcase',
      href: url('careers', j.slug),
    }))
    : [{
      image: pickImage(CAREER_IMAGES, 0),
      title: t('careers.lead'),
      meta: t('careers.applyGeneral'),
      icon: 'briefcase',
      href: url('careers'),
    }];

  const gallery = GALLERY_ALBUMS.map((a) => ({ a, src: firstOf(a) })).filter((x) => x.src).map(({ a, src }) => ({
    image: src,
    title: t('gallery.albums.' + a),
    meta: t('gallery.title'),
    icon: 'expand',
    href: url('gallery'),
  }));

  return [
    { key: 'news', label: t('nav.news'), href: url('news'), items: news },
    { key: 'plant', label: t('nav.plant'), href: url('plant'), items: plant },
    { key: 'ir', label: t('nav.ir'), href: url('ir'), items: ir },
    { key: 'careers', label: t('nav.careers'), href: url('careers'), items: careers },
    { key: 'gallery', label: t('gallery.title'), href: url('gallery'), items: gallery },
  ].filter((tile) => tile.items.length);
}

module.exports = { build };
