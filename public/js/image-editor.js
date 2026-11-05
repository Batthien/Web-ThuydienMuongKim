// Căn chỉnh ảnh ngay trên trang (chỉ tải cho Quản trị viên đã đăng nhập)
(() => {
  const script = document.currentScript;
  const csrf = script.dataset.csrf;
  const slots = JSON.parse(script.dataset.slots);
  const MAX_ZOOM = Number(script.dataset.maxZoom);
  const KEY_RE = /^(\/(?:media|uploads\/images)\/[\w/-]+?)-(?:640|1280|1920)\.webp$/;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const icon = (n) => `<svg class="icon" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  let on = false;
  let sel = null; // { img, slot, image, x, y, zoom, dirty, saved }
  let drag = null;

  // ---- Giao diện ----
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'img-edit-ui img-edit-toggle';
  toggle.innerHTML = `${icon('expand')}<span>Căn chỉnh ảnh</span>`;
  const frame = document.createElement('div');
  frame.className = 'img-edit-frame';
  frame.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'img-edit-ui img-edit-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <p class="img-edit-hint" data-hint role="status">Bấm vào ảnh cần căn chỉnh.</p>
    <div class="img-edit-controls" data-controls hidden>
      <label>Phóng to <input type="range" min="100" max="${MAX_ZOOM * 100}" step="1" data-zoom><output data-zoom-value>100%</output></label>
      <div class="img-edit-actions">
        <button type="button" data-reset>Đặt lại</button>
        <button type="button" data-cancel>Huỷ</button>
        <button type="button" class="is-primary" data-save>Lưu</button>
      </div>
    </div>`;
  document.body.append(frame, panel, toggle);
  const $ = (s) => panel.querySelector(s);
  const hint = (t) => { $('[data-hint]').textContent = t; };
  const HINT_READY = 'Kéo ảnh để đổi vị trí, lăn chuột hoặc dùng thanh trượt để phóng to.';

  // ---- Xác định ảnh ----
  const imageKey = (img) => (KEY_RE.exec(img.getAttribute('src') || '') || [])[1] || null;
  const slotOf = (img) => Object.keys(slots).find((s) => slots[s].some((c) => img.closest(c))) || null;
  const editable = (el) => el.tagName === 'IMG' && imageKey(el) && slotOf(el) && Number(getComputedStyle(el).opacity) > 0.1;
  const inUi = (t) => t instanceof Element && t.closest('.img-edit-ui, .site-header, .topbar');
  const imageAt = (x, y) => document.elementsFromPoint(x, y).find(editable) || null;
  const group = (s) => [...document.querySelectorAll('img')].filter((i) => imageKey(i) === s.image && slotOf(i) === s.slot);

  const readState = (img) => {
    const cs = getComputedStyle(img);
    const [px, py] = cs.objectPosition.split(' ').map(parseFloat);
    const m = /^matrix\(([^,]+)/.exec(cs.transform);
    return { x: Number.isFinite(px) ? px : 50, y: Number.isFinite(py) ? py : 50, zoom: m ? clamp(parseFloat(m[1]), 1, MAX_ZOOM) : 1 };
  };

  const apply = () => {
    const { x, y, zoom } = sel;
    group(sel).forEach((i) => {
      i.style.setProperty('object-position', `${x}% ${y}%`, 'important');
      i.style.setProperty('transform', `scale(${zoom})`, 'important');
      i.style.setProperty('transform-origin', `${x}% ${y}%`, 'important');
    });
    $('[data-zoom]').value = Math.round(zoom * 100);
    $('[data-zoom-value]').textContent = `${Math.round(zoom * 100)}%`;
  };

  const clearInline = (s) => group(s).forEach((i) => {
    ['object-position', 'transform', 'transform-origin'].forEach((p) => i.style.removeProperty(p));
  });

  const placeFrame = () => {
    if (!sel) { frame.hidden = true; return; }
    const r = sel.img.parentElement.getBoundingClientRect();
    Object.assign(frame.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    frame.hidden = false;
  };

  // Tải lại CSS căn chỉnh rồi mới bỏ kiểu tạm, để ảnh không bị nhảy
  const refreshCss = (done) => {
    const link = document.querySelector('link[data-image-framing]');
    const fresh = link.cloneNode();
    fresh.href = `/image-framing.css?t=${Date.now()}`;
    fresh.onload = () => { link.remove(); done(); };
    fresh.onerror = done;
    link.after(fresh);
  };

  const send = async (body) => {
    const res = await fetch(script.dataset.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify(body),
    });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) {
      throw new Error('Không lưu được. Phiên đăng nhập có thể đã hết, hãy tải lại trang.');
    }
  };

  const persist = async (s) => {
    await send({ slot: s.slot, image: s.image, x: s.x, y: s.y, zoom: s.zoom });
    s.dirty = false;
    refreshCss(() => clearInline(s));
  };

  const deselect = () => {
    sel = null;
    frame.hidden = true;
    $('[data-controls]').hidden = true;
    document.body.classList.remove('image-edit-selected');
    hint('Bấm vào ảnh cần căn chỉnh.');
  };

  // Rời ảnh đang sửa thì tự lưu, để không mất thay đổi
  const leave = async () => {
    const s = sel;
    deselect();
    if (s && s.dirty) {
      try { await persist(s); } catch (e) { hint(e.message); }
    } else if (s) {
      clearInline(s);
    }
  };

  const select = async (img) => {
    await leave();
    sel = { img, slot: slotOf(img), image: imageKey(img), dirty: false, ...readState(img) };
    sel.original = { x: sel.x, y: sel.y, zoom: sel.zoom };
    document.body.classList.add('image-edit-selected');
    $('[data-controls]').hidden = false;
    hint(HINT_READY);
    apply();
    placeFrame();
  };

  const setMode = async (value) => {
    if (!value) await leave();
    on = value;
    document.body.classList.toggle('image-edit-mode', on);
    panel.hidden = !on;
    toggle.querySelector('span').textContent = on ? 'Thoát căn chỉnh' : 'Căn chỉnh ảnh';
    toggle.setAttribute('aria-pressed', String(on));
    document.dispatchEvent(new Event('image-edit-change')); // dừng/chạy lại trình chiếu
  };
  toggle.addEventListener('click', () => setMode(!on));

  // ---- Kéo & phóng ----
  // left = -(x / 100) * phần ảnh thừa, nên số px kéo đổi được ra % theo phần thừa của khung
  const overflow = () => {
    const { img, zoom } = sel;
    const fw = img.clientWidth, fh = img.clientHeight;
    const cover = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
    return { x: zoom * cover * img.naturalWidth - fw, y: zoom * cover * img.naturalHeight - fh };
  };

  window.addEventListener('pointerdown', async (e) => {
    if (!on || inUi(e.target)) return;
    const img = imageAt(e.clientX, e.clientY);
    if (!img) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    if (!sel || sel.img !== img) await select(img);
    drag = { ...start, moved: false };
  }, true);

  window.addEventListener('pointermove', (e) => {
    if (!drag || !sel) return;
    const over = overflow();
    if (over.x > 0.5) sel.x = clamp(sel.x - ((e.clientX - drag.x) / over.x) * 100, 0, 100);
    if (over.y > 0.5) sel.y = clamp(sel.y - ((e.clientY - drag.y) / over.y) * 100, 0, 100);
    drag.x = e.clientX;
    drag.y = e.clientY;
    sel.dirty = true;
    apply();
  });
  const endDrag = () => { drag = null; };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  window.addEventListener('wheel', (e) => {
    if (!on || !sel || inUi(e.target) || imageAt(e.clientX, e.clientY) !== sel.img) return;
    e.preventDefault();
    sel.zoom = clamp(sel.zoom * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM);
    sel.dirty = true;
    apply();
  }, { passive: false });

  // Trong chế độ căn chỉnh, bấm vào ảnh không mở liên kết hay phóng to ảnh
  window.addEventListener('click', (e) => {
    if (!on || inUi(e.target) || !imageAt(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  document.addEventListener('dragstart', (e) => { if (on) e.preventDefault(); });
  window.addEventListener('scroll', placeFrame, { passive: true });
  window.addEventListener('resize', placeFrame);

  // ---- Nút trên bảng ----
  $('[data-zoom]').addEventListener('input', (e) => {
    if (!sel) return;
    sel.zoom = clamp(Number(e.target.value) / 100, 1, MAX_ZOOM);
    sel.dirty = true;
    apply();
  });
  $('[data-save]').addEventListener('click', async () => {
    if (!sel) return;
    try {
      const s = sel;
      await persist(s);
      s.original = { x: s.x, y: s.y, zoom: s.zoom };
      hint('Đã lưu. Mọi người xem website sẽ thấy ảnh theo vị trí này.');
      deselect();
      hint('Đã lưu. Bấm vào ảnh khác để căn chỉnh tiếp.');
    } catch (e) { hint(e.message); }
  });
  const cancel = () => {
    if (!sel) return;
    const s = sel;
    s.dirty = false;
    clearInline(s);
    deselect();
  };
  $('[data-cancel]').addEventListener('click', cancel);
  $('[data-reset]').addEventListener('click', async () => {
    if (!sel) return;
    const s = sel;
    try {
      await send({ slot: s.slot, image: s.image, reset: true });
      s.dirty = false;
      deselect();
      refreshCss(() => clearInline(s));
      hint('Đã đặt lại ảnh về mặc định.');
    } catch (e) { hint(e.message); }
  });
  document.addEventListener('keydown', (e) => { if (on && e.key === 'Escape') cancel(); });
})();
