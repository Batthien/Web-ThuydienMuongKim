#!/usr/bin/env bash
# Cập nhật website trên VPS từ GitHub:  bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Sao lưu CSDL"
mkdir -p backups
if [ -f data/site.db ]; then
  sqlite3 data/site.db ".backup 'backups/site-$(date +%Y%m%d-%H%M%S).db'" 2>/dev/null || cp data/site.db "backups/site-$(date +%Y%m%d-%H%M%S).db"
  ls -1t backups/site-*.db | tail -n +15 | xargs -r rm --
fi

echo "→ Lấy mã nguồn mới"
git pull --ff-only

echo "→ Cài thư viện"
npm ci --omit=dev

echo "→ Kiểm tra nhanh"
npm run check

echo "→ Khởi động lại"
mkdir -p logs
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo "✓ Hoàn tất"
