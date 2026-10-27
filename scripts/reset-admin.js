// Đặt lại mật khẩu quản trị:  npm run admin:reset -- <tên-đăng-nhập> <mật-khẩu-mới>
const bcrypt = require('bcryptjs');
const { db } = require('../src/db');

const [username, password] = process.argv.slice(2);
if (!username || !password || password.length < 10) {
  console.error('Cách dùng: npm run admin:reset -- <tên-đăng-nhập> <mật-khẩu-mới (>= 10 ký tự)>');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
const r = db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username);
if (!r.changes) db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
console.log(`Đã ${r.changes ? 'đặt lại mật khẩu' : 'tạo tài khoản'} cho "${username}".`);
