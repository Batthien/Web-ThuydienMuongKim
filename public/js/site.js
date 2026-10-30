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

  // ---- Biểu đồ kết quả sản xuất kinh doanh (SVG thuần) ----
  const prod = document.querySelector('[data-prod]');
  if (prod) {
    const rows = JSON.parse(prod.querySelector('[data-prod-rows]').textContent);
    const T = JSON.parse(prod.querySelector('[data-prod-labels]').textContent);
    const locale = prod.dataset.locale;
    const nf = (v, d = 2) => (v == null ? '—' : new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(v));
    // Sản lượng kWh -> triệu kWh; doanh thu triệu đồng -> tỷ đồng
    const scale = { output: (v) => (v == null ? null : v / 1e6), revenue: (v) => (v == null ? null : v / 1e3) };
    const key = { output: ['oa', 'op'], revenue: ['ra', 'rp'] };
    const unit = { output: T.unitOutput, revenue: T.unitRevenue };
    const sum = (list, k) => (list.some((r) => r[k] != null) ? list.reduce((s, r) => s + (r[k] || 0), 0) : null);
    const state = { year: Number(prod.dataset.year), plant: 'output', year2: 'output' };
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs = {}, text) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      return n;
    };
    const niceMax = (v) => {
      if (!v) return 1;
      const p = 10 ** Math.floor(Math.log10(v));
      return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v * 1.08);
    };

    // Tên ngắn trên trục: "Thủy điện Mường Kim II" -> "Mường Kim II"
    const shortName = (s) => String(s).replace(/^(Nhà máy\s+)?(Thủy điện|Thuỷ điện)\s+/i, '').replace(/\s+(HPP|Hydropower( Plant)?)$/i, '');

    // Biểu đồ cột nhóm: mỗi nhóm 2 cột (Thực hiện, Kế hoạch)
    const barChart = (box, groups, unitLabel) => {
      const W = 420, H = 340, pad = { t: 26, r: 6, b: 44, l: 40 };
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      const max = niceMax(Math.max(0, ...groups.flatMap((g) => [g.a || 0, g.p || 0])));
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': unitLabel });
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + ih - (ih * i) / 4;
        svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'grid' }));
        svg.append(el('text', { x: pad.l - 8, y: y + 4, class: 'axis', 'text-anchor': 'end' }, nf((max * i) / 4, 0)));
      }
      const gw = iw / groups.length, bw = Math.min(40, gw / 2.8);
      groups.forEach((g, i) => {
        const cx = pad.l + gw * i + gw / 2;
        [['a', 'bar--actual', -1], ['p', 'bar--plan', 1]].forEach(([k, cls, dir]) => {
          const v = g[k];
          if (v == null) return;
          const h = (ih * v) / max, x = cx + (dir < 0 ? -bw - 2 : 2), y = pad.t + ih - h;
          const r = el('rect', { x, y: pad.t + ih, width: bw, height: 0, rx: 4, class: `bar ${cls}` });
          r.append(el('title', {}, `${g.label} – ${k === 'a' ? T.actual : T.plan}: ${nf(v)} ${unitLabel}`));
          svg.append(r);
          requestAnimationFrame(() => { r.setAttribute('y', y); r.setAttribute('height', h); });
          svg.append(el('text', { x: x + bw / 2, y: y - 6, class: 'val', 'text-anchor': 'middle' }, nf(v, v >= 100 ? 0 : 1)));
        });
        // Nhãn trục X (tối đa 2 dòng)
        const words = String(g.label).split(' ');
        const lines = String(g.label).length > 14 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [g.label];
        lines.forEach((ln, j) => svg.append(el('text', { x: cx, y: H - pad.b + 20 + j * 15, class: 'axis axis--x', 'text-anchor': 'middle' }, ln)));
      });
      box.replaceChildren(svg);
    };

    const renderPlant = () => {
      const m = state.plant, [ka, kp] = key[m];
      const list = rows.filter((r) => r.year === state.year);
      const box = prod.querySelector('[data-chart="plant"]');
      box.closest('.prod-card').querySelector('[data-unit]').textContent = `(${unit[m]})`;
      barChart(box, list.map((r) => ({ label: shortName(r.plant), a: scale[m](r[ka]), p: scale[m](r[kp]) })), unit[m]);
    };
    const renderYears = () => {
      const m = state.year2, [ka, kp] = key[m];
      const years = [...new Set(rows.map((r) => r.year))].sort();
      const box = prod.querySelector('[data-chart="year"]');
      box.closest('.prod-card').querySelector('[data-unit]').textContent = `(${unit[m]})`;
      barChart(box, years.map((y) => {
        const list = rows.filter((r) => r.year === y);
        return { label: String(y), a: scale[m](sum(list, ka)), p: scale[m](sum(list, kp)) };
      }), unit[m]);
    };
    const renderProgress = () => {
      const list = rows.filter((r) => r.year === state.year);
      const oa = sum(list, 'oa'), op = sum(list, 'op'), ra = sum(list, 'ra'), rp = sum(list, 'rp');
      const set = (k, v) => { prod.querySelector(`[data-k="${k}"]`).textContent = v; };
      const planOnly = oa == null;
      const pct = !planOnly && op ? (oa / op) * 100 : null;
      set('oa', nf(scale.output(oa)));
      set('op', nf(scale.output(op)));
      set('tOut', nf(scale.output(planOnly ? op : oa)));
      set('tRev', nf(scale.revenue(planOnly ? rp : ra)));
      set('rOut', pct == null ? '—' : `${nf(pct, 1)}%`);
      set('rRev', !planOnly && ra != null && rp ? `${nf((ra / rp) * 100, 1)}%` : '—');
      prod.querySelector('[data-donut-pct]').textContent = pct == null ? T.planOnly : `${nf(pct, 1)}%`;
      prod.querySelector('[data-donut-caption]').textContent = pct == null ? String(state.year) : T.ofPlan;
      const arc = prod.querySelector('[data-donut-arc]');
      const fill = pct == null ? 0 : Math.min(100, pct);
      requestAnimationFrame(() => arc.setAttribute('stroke-dasharray', `${fill} ${100 - fill}`));
      prod.querySelector('[data-donut]').classList.toggle('is-over', pct != null && pct >= 100);
      prod.querySelector('[data-prod-note]').hidden = !planOnly;
      prod.querySelector('[data-year-tag]').textContent = state.year;
    };
    // Giữ nhãn gốc của ô đầu để khôi phục khi chuyển năm
    prod.querySelectorAll('.prod-tile').forEach((t) => { t.dataset.label = t.querySelector('span').textContent; });
    const renderTiles = () => {
      const planOnly = !rows.some((r) => r.year === state.year && r.oa != null);
      prod.querySelectorAll('.prod-tile').forEach((t, i) => {
        if (i < 2) t.querySelector('span').textContent = planOnly ? `${t.dataset.label} (${T.plan.toLowerCase()})` : t.dataset.label;
      });
    };

    prod.querySelector('[data-prod-year]').addEventListener('change', (e) => {
      state.year = Number(e.target.value);
      renderProgress(); renderTiles(); renderPlant();
    });
    prod.querySelectorAll('[data-tabs]').forEach((tabs) => {
      tabs.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-metric]');
        if (!b) return;
        tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        if (tabs.dataset.tabs === 'plant') { state.plant = b.dataset.metric; renderPlant(); } else { state.year2 = b.dataset.metric; renderYears(); }
      });
    });
    renderProgress(); renderTiles(); renderPlant(); renderYears();
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

  // ---- Ảnh trong bài viết: tự bọc liên kết để mở bằng lightbox ----
  document.querySelectorAll('[data-zoom-images]').forEach((root) => {
    root.querySelectorAll('.article__cover img, .prose img').forEach((img) => {
      if (img.closest('a')) return; // ảnh đã có liên kết riêng
      const srcset = (img.getAttribute('srcset') || '').split(',').map((s) => s.trim().split(' ')[0]).filter(Boolean);
      const a = document.createElement('a');
      a.href = srcset[srcset.length - 1] || img.src; // bản lớn nhất
      a.className = 'zoomable';
      a.setAttribute('data-lightbox-item', '');
      a.dataset.caption = img.alt || '';
      img.replaceWith(a);
      a.appendChild(img);
    });
  });

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
