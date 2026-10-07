/* userkit 共通: 色を選ぶダイアログ (画像からスポイト + ルーペ / カラーコード / パレット)
 *  userpair・userline(editor.js)と userprof で使う。kit.js の後に読み込む。見た目は colorpick.css
 */
(function () {
  'use strict';
  const { h, icon } = U;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let extraImages = [];   // 「ほかの画像」で開いた画像(保存しない。ページを開いている間だけ残す)
  const normHex = (s) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s || '').trim());
    if (!m) return null;
    const x = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return '#' + x.toLowerCase();
  };
  const toHex = (r, g, b) => '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  const LOUPE_PX = 11;    // ルーペに映す範囲(画像の画素数・奇数)
  const LOUPE_SIZE = 104;

  /**
   * 色を選ぶダイアログ。選んだ色(#rrggbb)を返す。やめたら null
   * sources: [{ src, label }] スポイトに使う画像 / emptyText: 画像が1枚もないときの文
   */
  function pickColor({ value, title, sources, emptyText }) {
    return new Promise((resolve) => {
      const before = normHex(value) || '#cccccc';
      let cur = before, ok = false;
      let off = null, token = 0, down = false, selected = null;

      const chipNew = h('i.cp-chip', { style: { '--c': cur } });
      const hex = h('input.cp-hex', { type: 'text', value: cur.toUpperCase(), maxlength: 7, spellcheck: 'false', 'aria-label': 'カラーコード' });
      const native = h('input', { type: 'color', value: cur, 'aria-label': 'パレットで選ぶ' });
      const setCur = (v, from) => {
        cur = v;
        chipNew.style.setProperty('--c', v);
        if (from !== 'hex') hex.value = v.toUpperCase();
        if (from !== 'native') native.value = v;
      };
      hex.addEventListener('input', () => { const v = normHex(hex.value); if (v) setCur(v, 'hex'); });
      hex.addEventListener('change', () => { hex.value = cur.toUpperCase(); });
      hex.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); apply(); } });
      native.addEventListener('input', () => setCur(native.value, 'native'));

      /* 画像の一覧 */
      const srcs = h('div.cp-srcs', { role: 'group', 'aria-label': '色を取る画像' });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      const all = () => {
        const seen = new Set();
        return (sources || []).concat(extraImages).filter((s) => s && s.src && !seen.has(s.src) && seen.add(s.src));
      };
      const drawSrcs = () => {
        srcs.replaceChildren(...all().map((s) => h('button.cp-src', {
          type: 'button', title: s.label || '画像', 'aria-pressed': s.src === selected ? 'true' : 'false', onclick: () => select(s.src)
        }, h('img', { src: s.src, alt: '' }), s.label && h('span', s.label))),
        h('button.cp-src.add', { type: 'button', title: 'ほかの画像を開く(色を取るためだけに使います)', onclick: () => file.click() }, icon('plus', 16), h('span', 'ほかの画像')), file);
      };
      const addFile = async (f) => {
        if (!f || !f.type || !f.type.startsWith('image/')) return U.toast('画像ファイルを選んでください', 'error');
        try {
          const src = await U.fileToDataUrl(f, 1400);
          extraImages = extraImages.filter((s) => s.src !== src).concat({ src, label: 'ほかの画像' });
          select(src);
        } catch (e) { U.toast('画像を読み込めませんでした', 'error'); }
      };
      file.addEventListener('change', () => { addFile(file.files[0]); file.value = ''; });

      /* スポイト */
      const img = h('img.cp-img', { alt: '色を取る画像', draggable: 'false' });
      const stage = h('div.cp-stage');
      const lcv = h('canvas', { width: LOUPE_SIZE * 2, height: LOUPE_SIZE * 2 });
      const lcode = h('b');
      const loupe = h('div.cp-loupe', { 'aria-hidden': 'true' }, lcv, lcode);
      async function select(src) {
        const my = ++token;
        selected = src;
        off = null;
        drawSrcs();
        try {
          const im = await U.loadImage(src);
          if (my !== token) return;
          const c = document.createElement('canvas');
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          const cx = c.getContext('2d', { willReadFrequently: true });
          cx.drawImage(im, 0, 0);
          off = { c, w: c.width, h: c.height, data: cx.getImageData(0, 0, c.width, c.height).data };
          img.src = src;
          stage.replaceChildren(img);
        } catch (e) { if (my === token) U.toast('画像を読み込めませんでした', 'error'); }
      }
      const sample = (e) => {
        const r = img.getBoundingClientRect();
        const x = clamp(Math.floor((e.clientX - r.left) / r.width * off.w), 0, off.w - 1);
        const y = clamp(Math.floor((e.clientY - r.top) / r.height * off.h), 0, off.h - 1);
        const i = (y * off.w + x) * 4, d = off.data, a = d[i + 3] / 255;
        // 透明な所は白の上に置いた色にする
        return { x, y, hex: toHex(d[i] * a + 255 * (1 - a), d[i + 1] * a + 255 * (1 - a), d[i + 2] * a + 255 * (1 - a)) };
      };
      const showLoupe = (e, s) => {
        const ctx = lcv.getContext('2d');
        const half = (LOUPE_PX - 1) / 2, cell = lcv.width / LOUPE_PX;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#d8d8d8';
        ctx.fillRect(0, 0, lcv.width, lcv.height);
        ctx.drawImage(off.c, s.x - half, s.y - half, LOUPE_PX, LOUPE_PX, 0, 0, lcv.width, lcv.height);
        ctx.lineWidth = 2; ctx.strokeStyle = '#000';
        ctx.strokeRect(half * cell, half * cell, cell, cell);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(half * cell - 2, half * cell - 2, cell + 4, cell + 4);
        loupe.style.setProperty('--c', s.hex);
        lcode.textContent = s.hex.toUpperCase();
        // 指で押しているときは指に隠れないよう上に、マウスのときは右上に出す
        const touch = e.pointerType !== 'mouse', gap = LOUPE_SIZE * 0.5 + 34;
        let lx = e.clientX + (touch ? 0 : gap * 0.75), ly = e.clientY - (touch ? gap + 10 : gap * 0.75);
        if (ly - LOUPE_SIZE / 2 < 4) ly = e.clientY + (touch ? gap + 10 : gap * 0.75);
        if (lx + LOUPE_SIZE / 2 > innerWidth - 4) lx = e.clientX - (touch ? 0 : gap * 0.75);
        loupe.style.left = clamp(lx, LOUPE_SIZE / 2 + 4, innerWidth - LOUPE_SIZE / 2 - 4) + 'px';
        loupe.style.top = ly + 'px';
        loupe.classList.add('show');
      };
      const hideLoupe = () => loupe.classList.remove('show');
      img.addEventListener('pointerdown', (e) => {
        if (!off || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        try { img.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
        down = true;
        const s = sample(e);
        setCur(s.hex);
        showLoupe(e, s);
      });
      img.addEventListener('pointermove', (e) => {
        if (!off || (!down && e.pointerType !== 'mouse')) return;
        const s = sample(e);
        if (down) setCur(s.hex);
        showLoupe(e, s);
      });
      const up = (e) => { down = false; if (e.pointerType !== 'mouse') hideLoupe(); };
      img.addEventListener('pointerup', up);
      img.addEventListener('pointercancel', up);
      img.addEventListener('pointerleave', () => { if (!down) hideLoupe(); });
      img.addEventListener('contextmenu', (e) => e.preventDefault());

      const apply = () => { ok = true; ctl.close(); };
      const body = h('div.modal-body.cp-body',
        h('p.modal-lead', '画像の上を押す(なぞる)と、その場所の色を取れます。'),
        srcs, stage,
        h('div.cp-row',
          h('span.cp-chips', { title: '前の色 → 新しい色' }, h('i.cp-chip.old', { style: { '--c': before } }), icon('arrow', 14), chipNew),
          hex,
          h('label.btn.btn-outline.btn-sm.cp-palette', icon('palette'), 'パレット', native)),
        h('div.modal-foot',
          h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, 'キャンセル'),
          h('button.btn.btn-primary', { type: 'button', onclick: apply }, icon('check'), 'この色にする')));
      const ctl = U.openDialog({ title: title || '色を選ぶ', content: body, wide: true, onClose: () => { token++; resolve(ok ? cur : null); } });
      ctl.dlg.append(loupe);   // ダイアログの中に置かないと背面に隠れる
      // 画像のドロップ・貼り付けでも開ける
      ctl.dlg.addEventListener('dragover', (e) => e.preventDefault());
      ctl.dlg.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) addFile(e.dataTransfer.files[0]); });
      ctl.dlg.addEventListener('paste', (e) => {
        const f = U.imageFromPaste(e);
        if (f) { e.preventDefault(); e.stopPropagation(); addFile(f); }
      });

      const first = all()[0];
      if (first) select(first.src);
      else {
        drawSrcs();
        stage.replaceChildren(h('p.cp-empty', emptyText || 'シートにまだ画像がありません。', h('br'), '「ほかの画像」から開くか、画像をここにドロップ・貼り付けしてください。'));
      }
    });
  }

  window.ColorPick = { pick: pickColor, normHex, toHex };
})();
