# Website Công ty cổ phần Thủy điện Mường Kim

Website doanh nghiệp song ngữ (Tiếng Việt / English) kèm trang quản trị nội dung (CMS).

- **Công nghệ:** Node.js ≥ 22.13, Express 5, EJS (render phía máy chủ, tốt cho SEO), SQLite tích hợp sẵn (`node:sqlite`), Sharp (tối ưu ảnh).
- **Trang công khai:** Trang chủ, Giới thiệu, Nhà máy, Quan hệ cổ đông, Tin tức, Tuyển dụng, Thư viện ảnh, Liên hệ — mỗi trang có bản `/vi/...` và `/en/...`.
- **CMS (`/admin`):** viết tin tức (Markdown, chèn ảnh), tải tài liệu cổ đông (PDF…), đăng tin tuyển dụng, xem tin nhắn & tải CV ứng viên, sửa thông tin công ty và thông số nhà máy, đổi mật khẩu.
- **Bảo mật:** Helmet + CSP, chống CSRF, giới hạn tần suất gửi form/đăng nhập, bẫy bot, mật khẩu bcrypt, CV lưu riêng tư (chỉ admin tải).
- **SEO:** thẻ meta/Open Graph, `hreflang`, `sitemap.xml`, `robots.txt`, dữ liệu cấu trúc Organization.

## Chạy trên máy tính

```bash
npm install
cp .env.example .env      # điền ADMIN_PASSWORD, đặt NODE_ENV=development khi chạy thử
npm run dev               # http://localhost:3000
```

Lần chạy đầu tiên tự tạo CSDL `data/site.db`, tài khoản quản trị và các bài viết mẫu.

| Lệnh | Tác dụng |
|---|---|
| `npm start` | Chạy website |
| `npm run dev` | Chạy và tự khởi động lại khi sửa mã |
| `npm run check` | Kiểm tra toàn bộ trang, form, CMS trên CSDL tạm |
| `npm run media` | Tạo lại ảnh WebP từ thư mục ảnh gốc (xem `scripts/media-manifest.json`) |
| `npm run admin:reset -- admin <mật-khẩu-mới>` | Đặt lại mật khẩu quản trị |

## Cấu trúc thư mục

```
server.js              Khởi tạo Express, bảo mật, SEO, xử lý lỗi
src/routes/public.js   Các trang công khai + form liên hệ / ứng tuyển
src/routes/admin.js    Trang quản trị
src/db.js, seed.js     Lược đồ SQLite và dữ liệu khởi tạo
locales/vi.js, en.js   Toàn bộ nội dung chữ song ngữ
views/                 Giao diện EJS
public/                CSS, JS, logo, ảnh đã tối ưu (public/media)
content/gallery.json   Danh sách ảnh thư viện
deploy/                Cấu hình Nginx, script cập nhật trên VPS
data/, uploads/        Dữ liệu thật trên máy chủ — KHÔNG đưa lên Git
```

---

# Hướng dẫn đưa lên GitHub

1. Tạo repository mới (để **Private**) trên GitHub, ví dụ `muongkim-website`. Không tích chọn tạo README.
2. Trong thư mục dự án:

```bash
git remote add origin https://github.com/<tài-khoản>/muongkim-website.git
git push -u origin main
```

Tệp `.env`, `data/`, `uploads/` đã nằm trong `.gitignore` nên mật khẩu và dữ liệu thật không bị đẩy lên.

---

# Hướng dẫn deploy lên Hostinger VPS

> Áp dụng cho VPS Ubuntu 22.04/24.04 của Hostinger. Thay `thuydienmuongkim.vn` bằng tên miền thật.

### 1. Trỏ tên miền
Trong trang quản lý tên miền, tạo 2 bản ghi **A**: `@` và `www` → địa chỉ IP của VPS (xem trong hPanel › VPS).

### 2. Cài phần mềm trên VPS (đăng nhập SSH bằng tài khoản root)

```bash
apt update && apt upgrade -y
apt install -y nginx git sqlite3 ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

### 3. Tải mã nguồn

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/<tài-khoản>/muongkim-website.git muongkim-web
cd muongkim-web
npm ci --omit=dev
```

Repo Private: tạo *Deploy key* (`ssh-keygen -t ed25519`, thêm khoá công khai vào GitHub › Settings › Deploy keys) rồi clone bằng địa chỉ `git@github.com:...`.

### 4. Cấu hình môi trường

```bash
cp .env.example .env
nano .env
```

Bắt buộc điền: `SITE_URL=https://thuydienmuongkim.vn`, `SESSION_SECRET` (chuỗi ngẫu nhiên — tạo bằng lệnh ghi trong file), `ADMIN_PASSWORD`, và thông tin SMTP để nhận email.

### 5. Chạy bằng PM2

```bash
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup        # chạy lệnh mà PM2 in ra để tự khởi động cùng VPS
```

### 6. Nginx + HTTPS

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/muongkim
ln -s /etc/nginx/sites-available/muongkim /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d thuydienmuongkim.vn -d www.thuydienmuongkim.vn
```

Mở `https://thuydienmuongkim.vn/admin` để đăng nhập, sau đó **đổi mật khẩu** tại mục *Tài khoản* và xoá `ADMIN_PASSWORD` khỏi `.env`.

### 7. Cập nhật website về sau

- **Thủ công:** `cd /var/www/muongkim-web && bash deploy/deploy.sh` (tự sao lưu CSDL, kéo mã mới, kiểm tra, khởi động lại).
- **Tự động khi push lên `main`:** vào GitHub › Settings › Secrets and variables › Actions, thêm `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (khoá riêng có quyền SSH vào VPS), tuỳ chọn `VPS_PORT`. Workflow `.github/workflows/deploy.yml` sẽ chạy kiểm tra rồi deploy.

### 8. Sao lưu dữ liệu
Dữ liệu cần giữ nằm ở `data/` (CSDL) và `uploads/` (tài liệu, ảnh, CV). Nên bật *Snapshot/Backup* của Hostinger VPS, hoặc định kỳ tải về:

```bash
tar czf muongkim-backup-$(date +%F).tgz data uploads
```
