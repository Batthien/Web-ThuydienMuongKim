// Phân quyền xem mục Cổ đông (trang Quan hệ cổ đông + tệp tài liệu)
const { db } = require('../db');

const ROLES = {
  admin: 'Quản trị viên',
  editor: 'Biên tập viên',
  leader: 'Lãnh đạo',
  shareholder: 'Cổ đông',
};
// Chỉ các vai trò này được xem mục Cổ đông
const IR_ROLES = ['admin', 'leader', 'shareholder'];
// Vai trò chỉ để xem (không vào được trang quản trị nội dung)
const VIEWER_ROLES = ['leader', 'shareholder'];

const roleStmt = db.prepare('SELECT role FROM users WHERE id = ?');

/** Vai trò của người đang đăng nhập (null nếu chưa đăng nhập / tài khoản đã bị xoá) */
function roleOf(req) {
  if (!req.session || !req.session.userId) return null;
  const u = roleStmt.get(req.session.userId);
  return u ? u.role : null;
}

const canViewIR = (role) => IR_ROLES.includes(role);

/** Đường dẫn trang Cổ đông hợp lệ để quay lại sau khi đăng nhập */
const isIrPath = (p) => /^\/(?:vi\/co-dong|en\/investors)(?:[/?]|$)/.test(String(p || ''));

module.exports = { ROLES, IR_ROLES, VIEWER_ROLES, roleOf, canViewIR, isIrPath };
