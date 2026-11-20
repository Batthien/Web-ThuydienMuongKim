// Phân quyền xem mục Cổ đông (trang Quan hệ cổ đông + tệp tài liệu), theo từng công ty
const { db } = require('../db');

const ROLES = {
  admin: 'Quản trị viên',
  editor: 'Biên tập viên',
  leader: 'Lãnh đạo',
  shareholder: 'Cổ đông',
};
// Chỉ các vai trò này được vào mục Cổ đông
const IR_ROLES = ['admin', 'leader', 'shareholder'];
// Vai trò chỉ để xem (không vào được trang quản trị nội dung)
const VIEWER_ROLES = ['leader', 'shareholder'];

// 4 công ty có mục cổ đông riêng (mã dùng trong CSDL và đường dẫn ?company=)
const COMPANIES = [
  { code: 'mk', vi: 'Công ty cổ phần Thủy điện Mường Kim', en: 'Muong Kim Hydropower JSC', short_vi: 'Mường Kim', short_en: 'Muong Kim' },
  { code: 'tu', vi: 'Công ty cổ phần Thủy điện Than Uyên', en: 'Than Uyen Hydropower JSC', short_vi: 'Than Uyên', short_en: 'Than Uyen' },
  { code: 'pl', vi: 'Công ty cổ phần Thủy điện Phiêng Lúc', en: 'Phieng Luc Hydropower JSC', short_vi: 'Phiêng Lúc', short_en: 'Phieng Luc' },
  { code: 'nk', vi: 'Công ty cổ phần Thủy điện Nậm Kim', en: 'Nam Kim Hydropower JSC', short_vi: 'Nậm Kim', short_en: 'Nam Kim' },
];
const COMPANY_CODES = COMPANIES.map((c) => c.code);
const companyOf = (code) => COMPANIES.find((c) => c.code === code) || null;

const userStmt = db.prepare('SELECT id, role FROM users WHERE id = ?');
const linkStmt = db.prepare('SELECT company FROM user_companies WHERE user_id = ?');

/** Người đang đăng nhập: { id, role } hoặc null */
function userOf(req) {
  if (!req.session || !req.session.userId) return null;
  return userStmt.get(req.session.userId) || null;
}
const roleOf = (req) => (userOf(req) || {}).role || null;
const canViewIR = (role) => IR_ROLES.includes(role);

/** Các công ty người dùng được xem: Quản trị viên & Lãnh đạo xem cả 4; Cổ đông chỉ công ty mình tham gia */
function companiesFor(user) {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'leader') return [...COMPANY_CODES];
  if (user.role === 'shareholder') {
    const mine = new Set(linkStmt.all(user.id).map((r) => r.company));
    return COMPANY_CODES.filter((c) => mine.has(c));
  }
  return [];
}

/** Khoá so khớp tên: bỏ dấu, bỏ khoảng trắng, chữ thường ("Nguyễn Văn An" -> "nguyenvanan") */
function nameKey(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Đường dẫn trang Cổ đông hợp lệ để quay lại sau khi đăng nhập */
const isIrPath = (p) => /^\/(?:vi\/co-dong|en\/investors)(?:[/?]|$)/.test(String(p || ''));

module.exports = { ROLES, IR_ROLES, VIEWER_ROLES, COMPANIES, COMPANY_CODES, companyOf, userOf, roleOf, canViewIR, companiesFor, nameKey, isIrPath };
