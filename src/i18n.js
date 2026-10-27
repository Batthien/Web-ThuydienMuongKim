const dict = {
  vi: require('../locales/vi'),
  en: require('../locales/en'),
};

const LANGS = ['vi', 'en'];
const DEFAULT_LANG = 'vi';

// Đường dẫn bản địa hoá cho từng trang
const ROUTES = {
  home: { vi: '', en: '' },
  about: { vi: 'gioi-thieu', en: 'about' },
  plant: { vi: 'nha-may', en: 'power-plant' },
  ir: { vi: 'co-dong', en: 'investors' },
  news: { vi: 'tin-tuc', en: 'news' },
  careers: { vi: 'tuyen-dung', en: 'careers' },
  gallery: { vi: 'thu-vien', en: 'gallery' },
  contact: { vi: 'lien-he', en: 'contact' },
};

function url(lang, key, sub) {
  const seg = ROUTES[key][lang];
  let u = `/${lang}${seg ? '/' + seg : ''}`;
  if (sub) u += '/' + sub;
  return u;
}

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function translator(lang) {
  const d = dict[lang];
  return (key, vars) => {
    let s = get(d, key);
    if (s === undefined) s = get(dict[DEFAULT_LANG], key);
    if (s === undefined) return key;
    if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
    return s;
  };
}

module.exports = { LANGS, DEFAULT_LANG, ROUTES, url, translator, dict };
