(() => {
  // Menu thanh bên (di động)
  const menuBtn = document.querySelector('[data-admin-menu]');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const open = document.body.classList.toggle('side-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (document.body.classList.contains('side-open') && !e.target.closest('.admin-side, [data-admin-menu]')) {
        document.body.classList.remove('side-open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Xác nhận trước khi xoá
  document.querySelectorAll('form[data-confirm]').forEach((f) => {
    f.addEventListener('submit', (e) => { if (!window.confirm(f.dataset.confirm)) e.preventDefault(); });
  });

  // Thanh công cụ Markdown
  const insert = (ta, before, after = '') => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    ta.value = value.slice(0, s) + before + sel + after + value.slice(e);
    ta.focus();
    ta.setSelectionRange(s + before.length, s + before.length + sel.length);
  };

  const csrf = document.querySelector('input[name="_csrf"]')?.value;

  document.querySelectorAll('.md-toolbar').forEach((bar) => {
    const ta = bar.parentElement.querySelector('textarea.md');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-md-link')) {
        const href = window.prompt('Địa chỉ liên kết (https://…)');
        if (href) insert(ta, '[', `](${href})`);
        return;
      }
      const md = b.dataset.md;
      if (b.hasAttribute('data-wrap')) insert(ta, md, md);
      else {
        const lineStart = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        ta.setSelectionRange(lineStart, lineStart);
        insert(ta, md);
      }
    });

    const fileInput = bar.querySelector('[data-md-image]');
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const label = fileInput.parentElement;
      const old = label.firstChild.textContent;
      label.firstChild.textContent = 'Đang tải…';
      try {
        const fd = new FormData();
        fd.append('image', file);
        fd.append('_csrf', csrf);
        const res = await fetch('/admin/upload-image', { method: 'POST', body: fd, headers: { 'x-csrf-token': csrf } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi tải ảnh');
        const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        insert(ta, `\n![${alt}](${data.url})\n`);
      } catch (err) {
        window.alert(err.message);
      } finally {
        label.firstChild.textContent = old;
        fileInput.value = '';
      }
    });
  });
})();
