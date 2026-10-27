const nodemailer = require('nodemailer');
const config = require('../config');
const { escapeHtml } = require('./helpers');

let transporter = null;
if (config.mail.host && config.mail.user) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass },
  });
}

/** Gửi thông báo tin nhắn/hồ sơ mới cho Công ty. Không làm hỏng request nếu SMTP lỗi. */
async function notifyNewMessage(msg, { jobTitle, attachmentPath } = {}) {
  if (!transporter || !config.mail.to) return false;
  const kind = msg.kind === 'application' ? 'Hồ sơ ứng tuyển' : 'Liên hệ';
  const rows = [
    ['Loại', kind],
    jobTitle ? ['Vị trí', jobTitle] : null,
    ['Họ tên', msg.name],
    ['Email', msg.email],
    ['Điện thoại', msg.phone],
    msg.subject ? ['Chủ đề', msg.subject] : null,
  ].filter(Boolean);
  const html = `
    <h2 style="font-family:sans-serif;color:#0B4F63">${kind} mới từ website</h2>
    <table style="font-family:sans-serif;border-collapse:collapse">
      ${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${k}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`).join('')}
    </table>
    <p style="font-family:sans-serif;white-space:pre-wrap;border-left:3px solid #156E8A;padding-left:12px">${escapeHtml(msg.body)}</p>
    <p style="font-family:sans-serif;color:#777;font-size:12px">Xem và quản lý trong trang quản trị: ${config.siteUrl}/admin/messages</p>`;
  try {
    await transporter.sendMail({
      from: config.mail.from,
      to: config.mail.to,
      replyTo: msg.email,
      subject: `[Website] ${kind}: ${msg.subject || msg.name}`,
      html,
      attachments: attachmentPath ? [{ path: attachmentPath }] : [],
    });
    return true;
  } catch (e) {
    console.error('[mail] Gửi email thất bại:', e.message);
    return false;
  }
}

module.exports = { notifyNewMessage, enabled: () => Boolean(transporter && config.mail.to) };
