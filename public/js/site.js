(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Header khi cuộn ----
  const header = document.querySelector('[data-header]');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ---- Trình chiếu ảnh nền (Đập & Nhà máy) ----
  const slideBox = document.querySelector('[data-slides]');
  const slideCtl = document.querySelector('[data-slide-controls]');
  if (slideBox && slideCtl) {
    const imgs = [...slideBox.querySelectorAll('img')];
    const dots = [...slideCtl.querySelectorAll('[data-slide-go]')];
    const toggleBtn = slideCtl.querySelector('[data-slide-toggle]');
    const DELAY = 2000; // mỗi ảnh hiển thị 2 giây
    let current = 0;
    let timer = null;
    // Luôn tự chạy (có nút tạm dừng); khi người dùng bật giảm chuyển động, CSS bỏ hiệu ứng phóng to
    let paused = false;

    // Ảnh sau được tải ngầm sau khi trang tải xong để không làm chậm ảnh đầu
    window.addEventListener('load', () => imgs.forEach((img) => { img.loading = 'eager'; }), { once: true });

    const go = async (n) => {
      const next = (n + imgs.length) % imgs.length;
      if (next === current) return;
      const img = imgs[next];
      img.loading = 'eager';
      try { await img.decode(); } catch { /* vẫn chuyển ảnh nếu decode lỗi */ }
      imgs[current].classList.remove('is-active');
      img.classList.add('is-active');
      dots[current]?.removeAttribute('aria-current');
      dots[next]?.setAttribute('aria-current', 'true');
      current = next;
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!paused && !document.hidden) timer = setTimeout(async () => { await go(current + 1); schedule(); }, DELAY);
    };
    const setPaused = (p) => {
      paused = p;
      slideCtl.classList.toggle('is-paused', p);
      toggleBtn.setAttribute('aria-label', p ? toggleBtn.dataset.labelPlay : toggleBtn.dataset.labelPause);
      schedule();
    };

    toggleBtn.addEventListener('click', () => setPaused(!paused));
    dots.forEach((d) => d.addEventListener('click', () => { go(Number(d.dataset.slideGo)); schedule(); }));
    document.addEventListener('visibilitychange', schedule);
    setPaused(paused);
  }

  // ---- Menu di động ----
  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.getElementById('main-nav');
  if (toggle && nav) {
    const label = toggle.querySelector('.sr-only');
    const setOpen = (open) => {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      label.textContent = open ? toggle.dataset.labelClose : toggle.dataset.labelOpen;
      if (open) {
        document.documentElement.style.setProperty('--nav-top', `${header.getBoundingClientRect().bottom}px`);
        nav.querySelector('a')?.focus();
      }
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { setOpen(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 1141px)').addEventListener('change', (e) => e.matches && setOpen(false));
  }

  // ---- Hiện dần khi cuộn ----
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-visible'));
  }

  // ---- Đếm số thống kê ----
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    const run = (el) => {
      const target = parseFloat(el.dataset.count);
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      const fmt = new Intl.NumberFormat(el.dataset.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      const start = performance.now();
      const dur = 1400;
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt.format(target * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach((el) => io.observe(el));
  }

  // ---- Lọc album ----
  const filter = document.querySelector('[data-filter]');
  if (filter) {
    const items = document.querySelectorAll('.gallery-grid__item[data-album]');
    filter.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-album]');
      if (!btn) return;
      const album = btn.dataset.album;
      filter.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      items.forEach((it) => { it.hidden = album !== 'all' && it.dataset.album !== album; });
    });
  }

  // ---- Lightbox ----
  document.querySelectorAll('[data-lightbox]').forEach((grid) => {
    const labels = {
      close: grid.dataset.labelClose || 'Close', prev: grid.dataset.labelPrev || 'Previous', next: grid.dataset.labelNext || 'Next',
    };
    let box, img, cap, index = 0, links = [], lastFocus;
    const icon = (n) => `<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;

    const build = () => {
      box = document.createElement('div');
      box.className = 'lightbox';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.innerHTML = `<figure class="lightbox__figure"><img class="lightbox__img" alt=""></figure>
        <p class="lightbox__caption" aria-live="polite"></p>
        <button type="button" class="lightbox__close" aria-label="${labels.close}">${icon('x')}</button>
        <button type="button" class="lightbox__prev" aria-label="${labels.prev}">${icon('chevron-left')}</button>
        <button type="button" class="lightbox__next" aria-label="${labels.next}">${icon('chevron-right')}</button>`;
      img = box.querySelector('img');
      cap = box.querySelector('.lightbox__caption');
      box.querySelector('.lightbox__close').addEventListener('click', close);
      box.querySelector('.lightbox__prev').addEventListener('click', () => show(index - 1));
      box.querySelector('.lightbox__next').addEventListener('click', () => show(index + 1));
      box.addEventListener('click', (e) => { if (e.target === box || e.target.classList.contains('lightbox__figure')) close(); });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft') show(index - 1);
        else if (e.key === 'ArrowRight') show(index + 1);
        else if (e.key === 'Tab') {
          const f = [...box.querySelectorAll('button')];
          const i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      });
      let x0 = null;
      box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    };

    const show = (i) => {
      index = (i + links.length) % links.length;
      const a = links[index];
      img.src = a.href;
      img.alt = a.querySelector('img')?.alt || '';
      cap.textContent = `${a.dataset.caption || ''} · ${index + 1}/${links.length}`;
    };

    function close() {
      box.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(() => box.remove(), 200);
      lastFocus?.focus();
    }

    grid.addEventListener('click', (e) => {
      const a = e.target.closest('a.gallery-grid__item, a[data-lightbox-item]');
      if (!a) return;
      e.preventDefault();
      links = [...grid.querySelectorAll('a.gallery-grid__item:not([hidden]), a[data-lightbox-item]')];
      lastFocus = a;
      if (!box) build();
      document.body.appendChild(box);
      document.body.style.overflow = 'hidden';
      show(links.indexOf(a));
      requestAnimationFrame(() => box.classList.add('is-open'));
      box.querySelector('.lightbox__close').focus();
    });
  });

  // ---- Form ----
  document.querySelectorAll('[data-form]').forEach((form) => {
    form.addEventListener('submit', () => {
      const btn = form.querySelector('[type="submit"]');
      if (!btn) return;
      btn.setAttribute('aria-busy', 'true');
      const span = btn.querySelector('span');
      if (span && btn.dataset.sending) span.textContent = btn.dataset.sending;
    });
  });
  const alertBox = document.querySelector('[data-focus]');
  if (alertBox) alertBox.focus({ preventScroll: false });

  document.querySelectorAll('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));
})();
