/* usermask: スクショのユーザー名・アイコンを隠す
 *  - 囲み(マスク)は元画像を書き換えずに持ち、表示と保存のたびに合成する
 *  - 「文字にぴったり」: 囲んだ中の一番多い色を背景とみなし、背景と違う画素(=文字)だけを隠す
 *  - 登録: 囲んだ部分の見た目を覚え、次の画像から MaskMatch(match-core.js) で探す
 */
(function () {
  'use strict';
  const { h, icon } = U;

  Kit.mountBar('usermask');

  /* ================================================================ 設定・登録の保存 */
  const LS_SET = 'usermask:settings';
  const LS_TPL = 'usermask:templates';
  const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const writeJSON = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) {
      U.toast('ブラウザに保存できませんでした', 'error'); return false;
    }
  };
  const settings = Object.assign({
    tool: 'lasso', style: 'black', fit: true, color: '#000000',
    // 実際のzetaのスクショ(586px幅)で、本文中の名前が0.73〜0.92、名前欄(別の字体)が0.75。誤検出は0.65でも無し
    auto: true, invert: true, threshold: 0.72, outlines: true
  }, readJSON(LS_SET) || {});
  const saveSettings = () => writeJSON(LS_SET, settings);
  let templates = Array.isArray(readJSON(LS_TPL)) ? readJSON(LS_TPL) : [];
  const saveTemplates = () => writeJSON(LS_TPL, templates);

  const STYLES = [
    { id: 'black', label: '塗りつぶし' },
    { id: 'bg', label: '背景色で消す' },
    { id: 'mosaic', label: 'モザイク' },
    { id: 'blur', label: 'ぼかし' }
  ];
  const TOOLS = [
    { id: 'pan', label: '動かす', icon: 'hand', key: 'h' },
    { id: 'select', label: '選ぶ', icon: 'pointer', key: 'v' },
    { id: 'lasso', label: '囲む', icon: 'lasso', key: 'l' },
    { id: 'rect', label: '四角', icon: 'square', key: 'r' },
    { id: 'ellipse', label: '丸', icon: 'circle', key: 'o' }
  ];
  const FIT_DIST = 42;          // 背景色との差がこれ以上なら「文字」とみなす(RGB距離)
  const MAX_AREA = 16e6;        // iPhoneのcanvas上限(約1677万px)を超えないように縮小
  const HISTORY_MAX = 60;

  /* ================================================================ 状態 */
  const images = [];   // {id,name,src,w,h,rgba,gray,masks,undo,redo,comp,dirty,thumb,detecting}
  let cur = null;
  let selectedId = null;
  const view = { scale: 1, tx: 0, ty: 0 };
  let cw = 0, ch = 0, dpr = window.devicePixelRatio || 1;

  /* ================================================================ 小物 */
  const mk = (w, hgt) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, hgt); return c; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const selMask = () => (cur && selectedId ? cur.masks.find((m) => m.id === selectedId) : null);

  function getRGBA(e) {
    if (!e.rgba) {
      const c = mk(e.w, e.h);
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(e.src, 0, 0, e.w, e.h);
      e.rgba = x.getImageData(0, 0, e.w, e.h).data;
    }
    return e.rgba;
  }
  function getGray(e) {
    if (!e.gray) e.gray = MaskMatch.toGray(getRGBA(e), e.w, e.h);
    return e.gray;
  }

  /* ================================================================ 囲みの形 */
  function shapePath(m) {
    const p = new Path2D();
    if (m.shape === 'lasso') {
      m.pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
    } else if (m.shape === 'ellipse') {
      p.ellipse(m.x + m.w / 2, m.y + m.h / 2, Math.abs(m.w / 2), Math.abs(m.h / 2), 0, 0, Math.PI * 2);
    } else {
      p.rect(m.x, m.y, m.w, m.h);
    }
    return p;
  }
  function shapeBox(m) {
    if (m.shape === 'lasso') {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const [x, y] of m.pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    return { x: m.x, y: m.y, w: m.w, h: m.h };
  }
  /** 画像内に収めた整数の箱 */
  function intBox(b, e, pad) {
    pad = pad || 0;
    const x = clamp(Math.floor(b.x - pad), 0, e.w), y = clamp(Math.floor(b.y - pad), 0, e.h);
    const x2 = clamp(Math.ceil(b.x + b.w + pad), 0, e.w), y2 = clamp(Math.ceil(b.y + b.h + pad), 0, e.h);
    return { x, y, w: x2 - x, h: y2 - y };
  }
  function translate(m, dx, dy) {
    if (m.shape === 'lasso') m.pts = m.pts.map(([x, y]) => [x + dx, y + dy]);
    else { m.x += dx; m.y += dy; }
    m._c = null;
  }
  function normRect(m) {
    if (m.w < 0) { m.x += m.w; m.w = -m.w; }
    if (m.h < 0) { m.y += m.h; m.h = -m.h; }
  }

  /* ================================================================ 隠す範囲の計算 */
  /** 箱の中・形の内側で一番多い色 (5bit/chで数えて、その色の平均) */
  function dominantColor(rgba, iw, bb, inside) {
    const cnt = new Uint32Array(32768), sr = new Float64Array(32768), sg = new Float64Array(32768), sb = new Float64Array(32768);
    let best = 0, bestK = -1;
    for (let y = 0; y < bb.h; y++) {
      for (let x = 0; x < bb.w; x++) {
        if (inside && !inside[y * bb.w + x]) continue;
        const i = ((bb.y + y) * iw + bb.x + x) * 4;
        const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
        const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        cnt[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
        if (cnt[k] > best) { best = cnt[k]; bestK = k; }
      }
    }
    if (bestK < 0) return [255, 255, 255];
    return [sr[bestK] / best, sg[bestK] / best, sb[bestK] / best].map(Math.round);
  }

  function buildCache(e, m) {
    const pad = 4;
    const bb = intBox(shapeBox(m), e, pad);
    if (bb.w < 2 || bb.h < 2) return null;
    const rgba = getRGBA(e);

    // 形の内側 (1/0)
    const sc = mk(bb.w, bb.h);
    const sx = sc.getContext('2d', { willReadFrequently: true });
    sx.translate(-bb.x, -bb.y);
    sx.fillStyle = '#fff';
    sx.fill(shapePath(m));
    const sa = sx.getImageData(0, 0, bb.w, bb.h).data;
    const inside = new Uint8Array(bb.w * bb.h);
    let insideN = 0;
    for (let i = 0; i < inside.length; i++) if (sa[i * 4 + 3] > 127) { inside[i] = 1; insideN++; }
    if (!insideN) return null;

    const bg = dominantColor(rgba, e.w, bb, inside);
    const cache = { bx: bb.x, by: bb.y, bw: bb.w, bh: bb.h, bg, alpha: sc, tight: null };

    if (m.fit) {
      const fg = new Uint8Array(bb.w * bb.h);
      let n = 0, x1 = bb.w, y1 = bb.h, x2 = -1, y2 = -1;
      const t2 = FIT_DIST * FIT_DIST;
      for (let y = 0; y < bb.h; y++) {
        for (let x = 0; x < bb.w; x++) {
          const k = y * bb.w + x;
          if (!inside[k]) continue;
          const i = ((bb.y + y) * e.w + bb.x + x) * 4;
          const dr = rgba[i] - bg[0], dg = rgba[i + 1] - bg[1], db = rgba[i + 2] - bg[2];
          if (dr * dr + dg * dg + db * db > t2) {
            fg[k] = 1; n++;
            if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
          }
        }
      }
      if (n >= 3) {
        cache.tight = { x: bb.x + x1, y: bb.y + y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
        const ac = mk(bb.w, bb.h);
        const ax = ac.getContext('2d');
        if (m.style === 'bg') {
          // 文字の画素を2pxふくらませて、背景色で塗る
          const id = ax.createImageData(bb.w, bb.h);
          const r = 2;
          for (let y = 0; y < bb.h; y++) {
            for (let x = 0; x < bb.w; x++) {
              if (!fg[y * bb.w + x]) continue;
              for (let yy = Math.max(0, y - r); yy <= Math.min(bb.h - 1, y + r); yy++) {
                for (let xx = Math.max(0, x - r); xx <= Math.min(bb.w - 1, x + r); xx++) id.data[(yy * bb.w + xx) * 4 + 3] = 255;
              }
            }
          }
          ax.putImageData(id, 0, 0);
        } else {
          // 文字がおさまる最小の箱(丸のときは楕円)を、少し余白をつけて隠す
          const p = 3;
          const tx = x1 - p, ty = y1 - p, tw = x2 - x1 + 1 + p * 2, th = y2 - y1 + 1 + p * 2;
          ax.fillStyle = '#fff';
          ax.beginPath();
          if (m.shape === 'ellipse') ax.ellipse(tx + tw / 2, ty + th / 2, tw / 2 + 1, th / 2 + 1, 0, 0, Math.PI * 2);
          else if (ax.roundRect) ax.roundRect(tx, ty, tw, th, Math.min(6, th / 3));
          else ax.rect(tx, ty, tw, th);
          ax.fill();
        }
        cache.alpha = ac;
      }
    }
    return cache;
  }

  /** 1つの囲みを合成先に描く */
  function applyMask(ctx, e, m) {
    const c = m._c || (m._c = buildCache(e, m));
    if (!c) return;
    const eff = mk(c.bw, c.bh);
    const x = eff.getContext('2d');
    if (m.style === 'mosaic' || m.style === 'blur') {
      const base = c.tight || { w: c.bw, h: c.bh };
      if (m.style === 'mosaic') {
        const b = clamp(Math.round(Math.min(base.w, base.h) / 4), 6, 40);
        const sw = Math.ceil(c.bw / b), sh = Math.ceil(c.bh / b);
        const small = mk(sw, sh);
        const s = small.getContext('2d');
        s.imageSmoothingEnabled = true;
        s.drawImage(e.src, c.bx, c.by, c.bw, c.bh, 0, 0, sw, sh);
        x.imageSmoothingEnabled = false;
        x.drawImage(small, 0, 0, sw, sh, 0, 0, sw * b, sh * b);
      } else {
        // 縮小→拡大を2回くり返して強めにぼかす (Safariでも動く方法)
        const k = clamp(Math.round(Math.min(base.w, base.h) / 3), 6, 60);
        let src = e.src, sx0 = c.bx, sy0 = c.by, sw0 = c.bw, sh0 = c.bh;
        for (let pass = 0; pass < 2; pass++) {
          const sw = Math.max(1, Math.round(c.bw / k)), sh = Math.max(1, Math.round(c.bh / k));
          const small = mk(sw, sh);
          const s = small.getContext('2d');
          s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'high';
          s.drawImage(src, sx0, sy0, sw0, sh0, 0, 0, sw, sh);
          const up = mk(c.bw, c.bh);
          const u = up.getContext('2d');
          u.imageSmoothingEnabled = true; u.imageSmoothingQuality = 'high';
          u.drawImage(small, 0, 0, sw, sh, 0, 0, c.bw, c.bh);
          src = up; sx0 = 0; sy0 = 0; sw0 = c.bw; sh0 = c.bh;
        }
        x.drawImage(src, 0, 0);
      }
    } else {
      x.fillStyle = m.style === 'bg' ? `rgb(${c.bg.join(',')})` : (m.color || '#000');
      x.fillRect(0, 0, c.bw, c.bh);
    }
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(c.alpha, 0, 0);
    ctx.drawImage(eff, c.bx, c.by);
  }

  function getComposite(e) {
    if (!e.comp) e.comp = mk(e.w, e.h);
    if (e.dirty) {
      const x = e.comp.getContext('2d');
      x.clearRect(0, 0, e.w, e.h);
      x.drawImage(e.src, 0, 0, e.w, e.h);
      for (const m of e.masks) applyMask(x, e, m);
      e.dirty = false;
    }
    return e.comp;
  }
  const changed = (e) => { e = e || cur; if (!e) return; e.dirty = true; scheduleRender(); updateThumb(e); };

  /* ================================================================ 履歴 */
  const snap = (masks) => masks.map((m) => Object.assign({}, m, { _c: null, pts: m.pts ? m.pts.map((p) => p.slice()) : undefined }));
  function pushHistory(e) {
    e = e || cur;
    e.undo.push(snap(e.masks));
    if (e.undo.length > HISTORY_MAX) e.undo.shift();
    e.redo = [];
    updateHistoryButtons();
  }
  function undo() {
    if (!cur || !cur.undo.length) return;
    cur.redo.push(snap(cur.masks));
    cur.masks = cur.undo.pop();
    if (!cur.masks.some((m) => m.id === selectedId)) selectedId = null;
    changed(); refreshSide(); updateHistoryButtons();
  }
  function redo() {
    if (!cur || !cur.redo.length) return;
    cur.undo.push(snap(cur.masks));
    cur.masks = cur.redo.pop();
    if (!cur.masks.some((m) => m.id === selectedId)) selectedId = null;
    changed(); refreshSide(); updateHistoryButtons();
  }

  /* ================================================================ DOM */
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const tplInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const canvas = h('canvas.mask-canvas', { 'aria-label': '編集中の画像', tabindex: 0 });
  const ctx = canvas.getContext('2d');
  const stageBadge = h('div.stage-badge', { hidden: true });
  const stage = h('div.mask-stage', canvas, stageBadge);

  const toolSeg = h('div.seg', { role: 'group', 'aria-label': '道具' });
  const styleSeg = h('div.seg', { role: 'group', 'aria-label': '隠し方' });
  const fitBox = h('input', { type: 'checkbox', checked: settings.fit });
  const colorIn = h('input.color-in', { type: 'color', value: settings.color, title: '塗りつぶしの色', 'aria-label': '塗りつぶしの色' });
  const undoBtn = h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '元に戻す (Ctrl+Z)', 'aria-label': '元に戻す', onclick: undo }, icon('undo'));
  const redoBtn = h('button.btn.btn-ghost.btn-icon', { type: 'button', title: 'やり直す (Ctrl+Shift+Z)', 'aria-label': 'やり直す', onclick: redo }, icon('redo'));
  const zoomLabel = h('span.zoom-label', '100%');
  const outlineBox = h('input', { type: 'checkbox', checked: settings.outlines });

  const toolbar = h('div.mask-toolbar',
    h('div.tb-group', toolSeg),
    h('div.tb-group', styleSeg, colorIn,
      h('label.check', { title: '囲んだ中の文字の形に合わせて隠します' }, fitBox, '文字にぴったり')),
    h('div.tb-group.tb-right',
      undoBtn, redoBtn,
      h('span.tb-sep'),
      h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '縮小', 'aria-label': '縮小', onclick: () => zoomBy(1 / 1.25) }, icon('zoomout')),
      zoomLabel,
      h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '拡大', 'aria-label': '拡大', onclick: () => zoomBy(1.25) }, icon('zoomin')),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => fitView('width') }, '幅'),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => fitView('all') }, '全体')));

  const thumbs = h('div.thumbs');
  const selPanel = h('section.side-card.sel-card');
  const tplList = h('div.tpl-list');
  const tplStatus = h('p.tpl-status', { role: 'status' });
  const autoBox = h('input', { type: 'checkbox', checked: settings.auto });
  const invertBox = h('input', { type: 'checkbox', checked: settings.invert });
  const threshIn = h('input', { type: 'range', min: 0.6, max: 0.95, step: 0.01, value: settings.threshold, 'aria-label': '見つける厳しさ' });

  const side = h('aside.mask-side',
    h('section.side-card',
      h('h2', '画像'),
      thumbs,
      h('button.btn.btn-outline.btn-sm.full', { type: 'button', onclick: () => fileInput.click() }, icon('plus'), '画像を追加')),
    selPanel,
    h('section.side-card',
      h('h2', '登録した名前・アイコン'),
      h('p.side-hint', 'よく隠す名前やアイコンを登録すると、次に開いた画像から自動で探して隠します。見た目で覚えるので、同じ端末・同じ表示サイズのスクショほどよく見つかります。'),
      tplList,
      tplStatus,
      h('label.check', autoBox, '画像を開いたら自動で探す'),
      h('label.check', invertBox, 'ライト/ダーク表示の違いも探す'),
      h('div.range-row', h('small', 'ゆるい'), threshIn, h('small', 'きびしい')),
      h('div.btn-row',
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => detect(cur, true) }, icon('search'), 'この画像で探す')),
      h('div.btn-row.small-links',
        h('button.link-btn', { type: 'button', onclick: exportTemplates }, '登録を書き出す'),
        h('button.link-btn', { type: 'button', onclick: () => tplInput.click() }, '登録を読み込む'))),
    h('section.side-card',
      h('h2', '保存'),
      h('label.check', outlineBox, '囲みの枠を表示する(保存画像には入りません)'),
      h('button.btn.btn-primary.full', { type: 'button', onclick: saveCurrent }, icon('download'), 'この画像を保存'),
      h('button.btn.btn-outline.btn-sm.full', { type: 'button', onclick: saveAll }, 'すべての画像を保存')));

  const work = h('div.mask-work', { hidden: true }, toolbar, h('div.mask-body', stage, side));

  const empty = h('section.mask-empty',
    h('div.drop', { tabindex: 0, role: 'button', 'aria-label': 'スクショを選ぶ', onclick: () => fileInput.click(),
      onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fileInput.click(); } } },
      h('span.drop-ic', icon('image', 34)),
      h('h1', 'スクショのユーザー名・アイコンを隠す'),
      h('p', 'ここに画像をドロップ、またはタップして選択。Ctrl+V で貼り付けもできます。'),
      h('span.btn.btn-primary', icon('upload'), 'スクショを選ぶ')),
    h('ol.steps',
      h('li', h('b', '1'), h('span', '隠したいところを、指やマウスでざっくり囲む')),
      h('li', h('b', '2'), h('span', '「文字にぴったり」なら、文字の形に合わせて隠れます')),
      h('li', h('b', '3'), h('span', 'よく隠す名前は「登録」すると、次から自動で隠れます'))),
    h('p.privacy', icon('eye', 16), '画像はこの端末の中だけで処理されます。どこにも送信しません。'));

  document.getElementById('app').append(empty, work, fileInput, tplInput);
  document.body.append(Kit.footer());

  /* ---------- ツールバーの中身 ---------- */
  function renderToolbar() {
    toolSeg.replaceChildren(...TOOLS.map((t) => h('button', {
      type: 'button', 'aria-pressed': settings.tool === t.id ? 'true' : 'false', title: `${t.label} (${t.key.toUpperCase()})`,
      onclick: () => { settings.tool = t.id; saveSettings(); renderToolbar(); updateCursor(); }
    }, icon(t.icon, 17), h('span.lbl', t.label))));
    styleSeg.replaceChildren(...STYLES.map((s) => h('button', {
      type: 'button', 'aria-pressed': settings.style === s.id ? 'true' : 'false',
      onclick: () => setStyle(s.id)
    }, s.label)));
    // 消すとツールバーの高さが変わって画像がずれるので、場所は残す
    colorIn.style.visibility = settings.style === 'black' ? 'visible' : 'hidden';
  }
  // ツールバーは「これから描く囲み」の設定。描いた囲みの変更は「選択中の囲み」パネルで行う
  function setStyle(id) {
    settings.style = id; saveSettings(); renderToolbar();
  }
  fitBox.addEventListener('change', () => { settings.fit = fitBox.checked; saveSettings(); });
  colorIn.addEventListener('input', () => { settings.color = colorIn.value; saveSettings(); });
  /** 選択中の囲みを書き換える */
  function editSelected(fn) {
    const m = selMask();
    if (!m) return;
    pushHistory();
    fn(m);
    m._c = null;
    changed();
    refreshSide();
  }
  outlineBox.addEventListener('change', () => { settings.outlines = outlineBox.checked; saveSettings(); scheduleRender(); });
  autoBox.addEventListener('change', () => { settings.auto = autoBox.checked; saveSettings(); });
  invertBox.addEventListener('change', () => { settings.invert = invertBox.checked; saveSettings(); });
  threshIn.addEventListener('change', () => { settings.threshold = Number(threshIn.value); saveSettings(); });
  function updateHistoryButtons() {
    undoBtn.disabled = !cur || !cur.undo.length;
    redoBtn.disabled = !cur || !cur.redo.length;
  }
  function updateCursor() {
    canvas.dataset.tool = settings.tool;
  }

  /* ================================================================ 画像の読み込み */
  async function addFiles(files) {
    const list = [...files].filter((f) => f && f.type && f.type.startsWith('image/'));
    if (!list.length) return U.toast('画像ファイルを選んでください', 'error');
    const added = [];
    for (const f of list) {
      try {
        const url = URL.createObjectURL(f);
        const img = await U.loadImage(url);
        let src = img, w = img.naturalWidth, hh = img.naturalHeight;
        if (w * hh > MAX_AREA) {
          const s = Math.sqrt(MAX_AREA / (w * hh));
          w = Math.floor(w * s); hh = Math.floor(hh * s);
          const c = mk(w, hh);
          c.getContext('2d').drawImage(img, 0, 0, w, hh);
          src = c;
          URL.revokeObjectURL(url);
          U.toast('大きな画像なので、少し縮小して読み込みました');
        }
        const e = {
          id: U.uid(), name: (f.name || 'image').replace(/\.[^.]+$/, ''), src, url: src === img ? url : null,
          w, h: hh, rgba: null, gray: null, masks: [], undo: [], redo: [], comp: null, dirty: true, thumb: null, detecting: false
        };
        images.push(e);
        added.push(e);
      } catch (err) {
        console.error(err);
        U.toast(`「${f.name}」を読み込めませんでした`, 'error');
      }
    }
    if (!added.length) return;
    empty.hidden = true;
    work.hidden = false;
    renderThumbs();
    openImage(added[0]);
    if (settings.auto && templates.length) {
      for (const e of added) await detect(e, false);
    }
  }
  fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
  document.addEventListener('paste', (ev) => {
    const tg = ev.target;
    if (tg && tg.closest && tg.closest('input,textarea,[contenteditable]')) return;
    const f = U.imageFromPaste(ev);
    if (f) { ev.preventDefault(); addFiles([f]); }
  });
  ['dragenter', 'dragover'].forEach((t) => document.addEventListener(t, (ev) => {
    if (ev.dataTransfer && [...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); document.body.classList.add('dragging'); }
  }));
  ['dragleave', 'drop'].forEach((t) => document.addEventListener(t, (ev) => {
    if (t === 'dragleave' && ev.relatedTarget) return;
    document.body.classList.remove('dragging');
  }));
  document.addEventListener('drop', (ev) => {
    if (ev.dataTransfer && ev.dataTransfer.files.length) { ev.preventDefault(); addFiles(ev.dataTransfer.files); }
  });

  function openImage(e) {
    cur = e;
    selectedId = null;
    renderThumbs();
    refreshSide();
    updateHistoryButtons();
    requestAnimationFrame(() => { resizeCanvas(); fitView('width'); });
  }
  async function removeImage(e) {
    if (e.masks.length && !(await U.confirmDialog({ title: '画像を閉じる', message: `「${e.name}」を一覧から外しますか? 隠した内容も消えます。`, okLabel: '外す', danger: true }))) return;
    const i = images.indexOf(e);
    images.splice(i, 1);
    if (e.url) URL.revokeObjectURL(e.url);
    if (cur === e) {
      if (images.length) openImage(images[Math.min(i, images.length - 1)]);
      else { cur = null; work.hidden = true; empty.hidden = false; }
    }
    renderThumbs();
  }

  /* ---------- サムネイル ---------- */
  function updateThumb(e) {
    if (!e.thumb) return;
    const c = e.thumb.querySelector('canvas');
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(getComposite(e), 0, 0, c.width, c.height);
    const b = e.thumb.querySelector('.th-count');
    b.textContent = e.masks.length ? String(e.masks.length) : '';
    b.hidden = !e.masks.length;
  }
  function renderThumbs() {
    thumbs.replaceChildren(...images.map((e) => {
      if (!e.thumb) {
        const s = 96 / e.h;
        const c = mk(Math.max(1, Math.round(e.w * s)), 96);
        e.thumb = h('div.thumb',
          h('button.th-open', { type: 'button', title: e.name, onclick: () => openImage(e) }, c, h('span.th-count', { hidden: true })),
          h('button.th-del', { type: 'button', title: '一覧から外す', 'aria-label': `${e.name}を一覧から外す`, onclick: () => removeImage(e) }, icon('close', 14)));
        updateThumb(e);
      }
      e.thumb.classList.toggle('current', e === cur);
      e.thumb.classList.toggle('busy', !!e.detecting);
      return e.thumb;
    }));
  }

  /* ================================================================ 表示 (拡大・移動) */
  function resizeCanvas() {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cw = r.width; ch = r.height;
    canvas.width = Math.max(1, Math.round(cw * dpr));
    canvas.height = Math.max(1, Math.round(ch * dpr));
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    clampView();
    scheduleRender();
  }
  new ResizeObserver(() => { if (cur) resizeCanvas(); }).observe(stage);

  function fitView(kind) {
    if (!cur || !cw) return;
    const m = 16;
    const s = kind === 'all'
      ? Math.min((cw - m * 2) / cur.w, (ch - m * 2) / cur.h)
      : Math.min((cw - m * 2) / cur.w, 1.5);
    view.scale = clamp(s, 0.05, 16);
    view.tx = (cw - cur.w * view.scale) / 2;
    view.ty = kind === 'all' ? (ch - cur.h * view.scale) / 2 : m;
    clampView();
    scheduleRender();
  }
  function clampView() {
    if (!cur) return;
    const iw = cur.w * view.scale, ih = cur.h * view.scale, m = 40;
    view.tx = iw <= cw ? (cw - iw) / 2 : clamp(view.tx, cw - iw - m, m);
    view.ty = ih <= ch ? (ch - ih) / 2 : clamp(view.ty, ch - ih - m, m);
  }
  function zoomAt(px, py, factor) {
    const ns = clamp(view.scale * factor, 0.05, 16);
    const f = ns / view.scale;
    view.tx = px - (px - view.tx) * f;
    view.ty = py - (py - view.ty) * f;
    view.scale = ns;
    clampView();
    scheduleRender();
  }
  const zoomBy = (f) => zoomAt(cw / 2, ch / 2, f);
  const toImg = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.scale, y: (cy - r.top - view.ty) / view.scale };
  };

  /* ================================================================ 描画 */
  let rafId = 0;
  function scheduleRender() {
    if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; render(); });
  }
  let drawing = null;   // 描いている途中の形

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cur) return;
    zoomLabel.textContent = Math.round(view.scale * 100) + '%';
    const S = view.scale * dpr;
    ctx.setTransform(S, 0, 0, S, view.tx * dpr, view.ty * dpr);
    ctx.imageSmoothingEnabled = view.scale < 2;
    ctx.shadowColor = 'rgba(40,20,70,.25)';
    ctx.shadowBlur = 12 / view.scale;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cur.w, cur.h);
    ctx.shadowColor = 'transparent';
    ctx.drawImage(getComposite(cur), 0, 0);

    const lw = 1.5 / view.scale;
    if (settings.outlines) {
      for (const m of cur.masks) {
        if (m.id === selectedId) continue;
        ctx.lineWidth = lw;
        ctx.setLineDash(m.auto ? [5 / view.scale, 4 / view.scale] : []);
        ctx.strokeStyle = m.auto ? 'rgba(20,150,140,.95)' : 'rgba(109,93,252,.85)';
        ctx.stroke(shapePath(m));
      }
    }
    const sm = selMask();
    if (sm) {
      ctx.setLineDash([]);
      ctx.lineWidth = 2.2 / view.scale;
      ctx.strokeStyle = '#6d5dfc';
      ctx.stroke(shapePath(sm));
      const b = shapeBox(sm);
      ctx.lineWidth = 1 / view.scale;
      ctx.setLineDash([4 / view.scale, 3 / view.scale]);
      ctx.strokeStyle = 'rgba(52,38,74,.6)';
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
      if (sm.shape !== 'lasso') {
        const hs = 9 / view.scale;
        for (const [hx, hy] of corners(b)) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = '#6d5dfc';
          ctx.lineWidth = 2 / view.scale;
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
        }
      }
    }
    if (drawing) {
      ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      ctx.lineWidth = 2 / view.scale;
      ctx.strokeStyle = '#6d5dfc';
      ctx.fillStyle = 'rgba(109,93,252,.14)';
      const p = new Path2D();
      if (drawing.shape === 'lasso') {
        drawing.pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      } else {
        const r = rectFrom(drawing.start, drawing.end);
        if (drawing.shape === 'ellipse') p.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
        else p.rect(r.x, r.y, r.w, r.h);
      }
      ctx.fill(p);
      ctx.stroke(p);
      ctx.setLineDash([]);
    }
  }
  const corners = (b) => [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
  function rectFrom(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }

  /* ================================================================ 当たり判定 */
  const hitCtx = mk(1, 1).getContext('2d');
  function hitMask(p) {
    // 上に描いたもの(配列の後ろ)から順に調べる。細い形のために枠線の近くも当たりにする
    hitCtx.lineWidth = 10 / view.scale;
    for (let i = cur.masks.length - 1; i >= 0; i--) {
      const path = shapePath(cur.masks[i]);
      if (hitCtx.isPointInPath(path, p.x, p.y) || hitCtx.isPointInStroke(path, p.x, p.y)) return cur.masks[i];
    }
    return null;
  }
  function hitHandle(m, p) {
    if (!m || m.shape === 'lasso') return -1;
    const r = 12 / view.scale;
    const cs = corners(shapeBox(m));
    for (let i = 0; i < cs.length; i++) if (Math.abs(p.x - cs[i][0]) <= r && Math.abs(p.y - cs[i][1]) <= r) return i;
    return -1;
  }

  /* ================================================================ 操作 (マウス・タッチ・ペン) */
  const pointers = new Map();
  let g = null;   // 進行中のジェスチャー

  canvas.addEventListener('pointerdown', (ev) => {
    if (!cur) return;
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 合成イベントなど */ }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      // 2本指: 拡大縮小と移動。描きかけは取り消す
      drawing = null;
      const [a, b] = [...pointers.values()];
      g = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...view } };
      scheduleRender();
      return;
    }
    if (pointers.size > 2) return;
    const p = toImg(ev.clientX, ev.clientY);
    const tool = settings.tool;
    const sm = selMask();
    const hIdx = hitHandle(sm, p);
    if (ev.button === 1 || tool === 'pan' || spaceDown) {
      g = { type: 'pan', sx: ev.clientX, sy: ev.clientY, v0: { ...view } };
    } else if (hIdx >= 0) {
      const b = shapeBox(sm);
      const opp = corners(b)[3 - hIdx];
      g = { type: 'resize', m: sm, opp: { x: opp[0], y: opp[1] }, pushed: false };
    } else if (tool === 'select') {
      const m = hitMask(p);
      if (m) {
        selectedId = m.id; refreshSide();
        g = { type: 'move', m, last: p, pushed: false };
      } else {
        if (selectedId) { selectedId = null; refreshSide(); }
        g = { type: 'pan', sx: ev.clientX, sy: ev.clientY, v0: { ...view } };
      }
    } else {
      drawing = { shape: tool, start: p, end: p, pts: [[p.x, p.y]] };
      g = { type: 'draw', sx: ev.clientX, sy: ev.clientY };
    }
    scheduleRender();
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) {
      // ホバー時のカーソル
      if (cur && ev.pointerType === 'mouse') {
        const p = toImg(ev.clientX, ev.clientY);
        canvas.classList.toggle('on-handle', hitHandle(selMask(), p) >= 0);
      }
      return;
    }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!g) return;
    if (g.type === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = canvas.getBoundingClientRect();
      const ns = clamp(g.v0.scale * d / g.d0, 0.05, 16);
      // 最初の中点の下にあった画像の点を、いまの中点に合わせる
      const ix = (g.mid0.x - r.left - g.v0.tx) / g.v0.scale, iy = (g.mid0.y - r.top - g.v0.ty) / g.v0.scale;
      view.scale = ns;
      view.tx = mid.x - r.left - ix * ns;
      view.ty = mid.y - r.top - iy * ns;
      clampView(); scheduleRender();
      return;
    }
    const p = toImg(ev.clientX, ev.clientY);
    if (g.type === 'pan') {
      view.tx = g.v0.tx + (ev.clientX - g.sx);
      view.ty = g.v0.ty + (ev.clientY - g.sy);
      clampView(); scheduleRender();
    } else if (g.type === 'draw' && drawing) {
      if (drawing.shape === 'lasso') {
        const last = drawing.pts[drawing.pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) * view.scale > 2) drawing.pts.push([p.x, p.y]);
      }
      drawing.end = p;
      scheduleRender();
    } else if (g.type === 'move') {
      if (!g.pushed) { pushHistory(); g.pushed = true; }
      translate(g.m, p.x - g.last.x, p.y - g.last.y);
      g.last = p;
      changed();
    } else if (g.type === 'resize') {
      if (!g.pushed) { pushHistory(); g.pushed = true; }
      const r = rectFrom(g.opp, p);
      Object.assign(g.m, { x: r.x, y: r.y, w: Math.max(2, r.w), h: Math.max(2, r.h) });
      g.m._c = null;
      changed();
    }
  });

  function endPointer(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if (!g) return;
    if (g.type === 'pinch') {
      if (pointers.size === 0) g = null;
      else {
        // 1本指が残ったら、そのまま移動に切り替える
        const [a] = [...pointers.values()];
        g = { type: 'pan', sx: a.x, sy: a.y, v0: { ...view } };
      }
      return;
    }
    if (g.type === 'draw' && drawing) finishDrawing(ev.type === 'pointercancel');
    if ((g.type === 'move' || g.type === 'resize') && g.pushed) refreshSide();
    g = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  function finishDrawing(cancelled) {
    const d = drawing;
    drawing = null;
    if (cancelled || !d) return scheduleRender();
    const r = d.shape === 'lasso'
      ? shapeBox({ shape: 'lasso', pts: d.pts })
      : rectFrom(d.start, d.end);
    // ほとんど動いていなければ「タップ」= 囲みを選ぶ
    if (Math.max(r.w, r.h) * view.scale < 6 || (d.shape === 'lasso' && d.pts.length < 3)) {
      const m = hitMask(d.start);
      selectedId = m ? m.id : null;
      refreshSide();
      return scheduleRender();
    }
    const m = {
      id: U.uid(), shape: d.shape, style: settings.style, color: settings.color, fit: settings.fit, auto: false
    };
    if (d.shape === 'lasso') {
      // 点が多すぎると重いので間引く
      const step = Math.max(1, Math.floor(d.pts.length / 300));
      m.pts = d.pts.filter((_, i) => i % step === 0);
    } else Object.assign(m, r);
    pushHistory();
    cur.masks.push(m);
    selectedId = m.id;
    changed();
    refreshSide();
  }

  canvas.addEventListener('wheel', (ev) => {
    if (!cur) return;
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) {
      const r = canvas.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * 0.01));
    } else {
      view.tx -= ev.shiftKey ? ev.deltaY : ev.deltaX;
      view.ty -= ev.shiftKey ? 0 : ev.deltaY;
      clampView(); scheduleRender();
    }
  }, { passive: false });

  /* ---------- キーボード ---------- */
  let spaceDown = false, lastNudge = 0;
  document.addEventListener('keydown', (ev) => {
    const tg = ev.target;
    if (!cur || (tg && tg.closest && tg.closest('input,textarea,select,[contenteditable],dialog'))) return;
    const k = ev.key;
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && k.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if (mod && k.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    if (mod && k.toLowerCase() === 's') { ev.preventDefault(); saveCurrent(); return; }
    if (k === ' ') { spaceDown = true; ev.preventDefault(); return; }
    if (k === 'Escape') { drawing = null; selectedId = null; refreshSide(); scheduleRender(); return; }
    const sm = selMask();
    if (sm && (k === 'Delete' || k === 'Backspace')) { ev.preventDefault(); deleteSelected(); return; }
    if (sm && k.startsWith('Arrow')) {
      ev.preventDefault();
      const n = ev.shiftKey ? 10 : 1;
      if (Date.now() - lastNudge > 700) pushHistory();
      lastNudge = Date.now();
      translate(sm, k === 'ArrowLeft' ? -n : k === 'ArrowRight' ? n : 0, k === 'ArrowUp' ? -n : k === 'ArrowDown' ? n : 0);
      changed();
      return;
    }
    if (!mod) {
      const t = TOOLS.find((x) => x.key === k.toLowerCase());
      if (t) { settings.tool = t.id; saveSettings(); renderToolbar(); updateCursor(); }
    }
  });
  document.addEventListener('keyup', (ev) => { if (ev.key === ' ') spaceDown = false; });

  /* ================================================================ 選択中の囲み */
  function deleteSelected() {
    const m = selMask();
    if (!m) return;
    pushHistory();
    cur.masks = cur.masks.filter((x) => x.id !== m.id);
    selectedId = null;
    changed();
    refreshSide();
  }
  function refreshSide() {
    const m = selMask();
    selPanel.replaceChildren();
    if (!cur) return;
    if (!m) {
      selPanel.append(
        h('h2', '囲み'),
        h('p.side-hint', cur.masks.length
          ? `この画像の囲み: ${cur.masks.length}か所。「選ぶ」でタップすると、動かしたり隠し方を変えたりできます。`
          : '隠したいところを囲んでください。「動かす」を選ぶと画像をスクロールできます(2本指でも動かせます)。'),
        cur.masks.some((x) => x.auto) && h('p.side-hint.auto-note', '点線の枠は、登録から自動で見つけた囲みです。違っていたら選んで削除してください。'),
        cur.masks.length > 0 && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: async () => {
          if (await U.confirmDialog({ title: '囲みをすべて消す', message: 'この画像の囲みをすべて消しますか?', okLabel: '消す', danger: true })) {
            pushHistory(); cur.masks = []; selectedId = null; changed(); refreshSide();
          }
        } }, icon('trash'), 'すべて消す'));
      return;
    }
    const shapeName = { lasso: '囲み', rect: '四角', ellipse: '丸' }[m.shape];
    const selFit = h('input', { type: 'checkbox', checked: !!m.fit, onchange: (ev) => editSelected((x) => { x.fit = ev.target.checked; }) });
    const selColor = h('input.color-in', { type: 'color', value: m.color || '#000000', title: '塗りつぶしの色', 'aria-label': '塗りつぶしの色' });
    selColor.addEventListener('input', () => { m.color = selColor.value; m._c = null; changed(); });
    selColor.addEventListener('focus', () => pushHistory(), { once: true });
    selPanel.append(
      h('h2', '選択中の囲み', h('small.sel-shape', shapeName), m.auto && h('span.pill', '自動')),
      h('div.seg.seg-wrap', { role: 'group', 'aria-label': 'この囲みの隠し方' }, STYLES.map((s) => h('button', {
        type: 'button', 'aria-pressed': m.style === s.id ? 'true' : 'false',
        onclick: () => { if (m.style !== s.id) editSelected((x) => { x.style = s.id; }); }
      }, s.label))),
      h('div.sel-opts',
        h('label.check', selFit, '文字にぴったり'),
        m.style === 'black' && selColor),
      h('p.side-hint', '「選ぶ」でドラッグすると動かせます。矢印キーで1px(Shiftで10px)ずつ動きます。'),
      h('div.btn-row',
        h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: registerSelected }, icon('star'), 'この部分を登録'),
        h('button.btn.btn-outline.btn-sm.btn-danger-o', { type: 'button', onclick: deleteSelected }, icon('trash'), '削除')));
  }

  /* ================================================================ 登録 (テンプレート) */
  const tplGrayCache = new Map();
  async function tplGray(t) {
    if (tplGrayCache.has(t.id)) return tplGrayCache.get(t.id);
    const img = await U.loadImage(t.data);
    const c = mk(t.w, t.h);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const g2 = MaskMatch.toGray(x.getImageData(0, 0, t.w, t.h).data, t.w, t.h);
    tplGrayCache.set(t.id, g2);
    return g2;
  }

  function registerSelected() {
    const m = selMask();
    if (!m) return;
    if (!m._c) m._c = buildCache(cur, m);
    const c = m._c;
    if (!c) return U.toast('この囲みは登録できません', 'error');
    // 文字にぴったりなら文字のある範囲、そうでなければ形の範囲を覚える
    const region = intBox(c.tight ? { x: c.tight.x - 2, y: c.tight.y - 2, w: c.tight.w + 4, h: c.tight.h + 4 } : shapeBox(m), cur, 0);
    if (region.w < 8 || region.h < 8) return U.toast('小さすぎて登録できません。もう少し大きく囲んでください', 'error');

    const nameIn = h('input', { type: 'text', id: 'tpl-name', value: m.shape === 'ellipse' ? 'アイコン' : 'ユーザー名', maxlength: 30, autocomplete: 'off' });
    const preview = mk(region.w, region.h);
    preview.getContext('2d').drawImage(cur.src, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
    preview.className = 'tpl-preview';
    const form = h('form.modal-body',
      h('p.modal-lead', 'この見た目を覚えて、次に開いた画像から自動で探します。'),
      preview,
      h('div.field', h('label', { for: 'tpl-name' }, '登録名'), nameIn),
      h('p.hint', `見つけたときは「${STYLES.find((s) => s.id === m.style).label}${m.fit ? '・文字にぴったり' : ''}」で隠します。`),
      h('div.modal-foot',
        h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, 'キャンセル'),
        h('button.btn.btn-primary', { type: 'submit' }, icon('star'), '登録する')));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      // 大きすぎるものは縮めて保存 (srcW も同じ比率で縮める)
      const k = Math.min(1, 320 / region.w, 200 / region.h);
      const tw = Math.max(8, Math.round(region.w * k)), th = Math.max(8, Math.round(region.h * k));
      const out = mk(tw, th);
      const ox = out.getContext('2d', { willReadFrequently: true });
      ox.imageSmoothingQuality = 'high';
      ox.drawImage(cur.src, region.x, region.y, region.w, region.h, 0, 0, tw, th);
      // 灰色にして保存 (照合は明るさだけを見る)
      const id = ox.getImageData(0, 0, tw, th);
      let mean = 0;
      const gray = MaskMatch.toGray(id.data, tw, th);
      for (let i = 0; i < gray.length; i++) mean += gray[i];
      mean /= gray.length;
      let v = 0;
      for (let i = 0; i < gray.length; i++) v += (gray[i] - mean) ** 2;
      if (Math.sqrt(v / gray.length) < 6) {
        U.toast('模様が少なすぎて、見分けがつきません。文字やアイコンが入るように囲んでください', 'error');
        return;
      }
      for (let i = 0, j = 0; i < gray.length; i++, j += 4) { id.data[j] = id.data[j + 1] = id.data[j + 2] = gray[i]; id.data[j + 3] = 255; }
      ox.putImageData(id, 0, 0);
      const t = {
        id: U.uid(), name: nameIn.value.trim() || '登録', w: tw, h: th, srcW: cur.w * k,
        data: out.toDataURL('image/png'), shape: m.shape === 'ellipse' ? 'ellipse' : 'rect',
        style: m.style, color: m.color, fit: !!m.fit, createdAt: Date.now()
      };
      templates.push(t);
      if (!saveTemplates()) { templates.pop(); return; }
      m.tplId = t.id;
      ctl.close();
      renderTemplates();
      U.toast(`「${t.name}」を登録しました`);
    });
    const ctl = U.openDialog({ title: '名前・アイコンを登録', content: form });
    nameIn.select();
  }

  function renderTemplates() {
    tplList.replaceChildren(...(templates.length ? templates.map((t) => h('div.tpl',
      h('img', { src: t.data, alt: '' }),
      h('span.tpl-name', t.name, h('small', `${STYLES.find((s) => s.id === t.style)?.label || ''}${t.fit ? '・ぴったり' : ''}`)),
      h('button.btn.btn-ghost.btn-icon.danger', { type: 'button', title: '登録を削除', 'aria-label': `${t.name}の登録を削除`, onclick: async () => {
        if (await U.confirmDialog({ title: '登録を削除', message: `「${t.name}」の登録を削除しますか?`, okLabel: '削除する', danger: true })) {
          templates = templates.filter((x) => x.id !== t.id);
          tplGrayCache.delete(t.id);
          saveTemplates(); renderTemplates();
        }
      } }, icon('trash')))) : [h('p.side-hint.none', 'まだ登録はありません。囲んだあと「この部分を登録」を押すと追加されます。')]));
  }

  function exportTemplates() {
    if (!templates.length) return U.toast('登録がありません', 'error');
    U.download(`usermask-templates-${U.stamp()}.json`, JSON.stringify({ app: 'usermask', version: 1, templates }));
  }
  tplInput.addEventListener('change', async () => {
    const f = tplInput.files[0];
    tplInput.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || data.app !== 'usermask' || !Array.isArray(data.templates)) throw new Error();
      const have = new Set(templates.map((t) => t.id));
      let n = 0;
      for (const t of data.templates) {
        if (!t || have.has(t.id) || typeof t.data !== 'string' || !t.data.startsWith('data:image/png')) continue;
        if (!(t.w > 0 && t.h > 0 && t.srcW > 0)) continue;
        templates.push({
          id: String(t.id), name: String(t.name || '登録').slice(0, 30), w: t.w | 0, h: t.h | 0, srcW: Number(t.srcW), data: t.data,
          shape: t.shape === 'ellipse' ? 'ellipse' : 'rect', style: STYLES.some((s) => s.id === t.style) ? t.style : 'black',
          color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#000000', fit: !!t.fit, createdAt: Number(t.createdAt) || Date.now()
        });
        n++;
      }
      saveTemplates(); renderTemplates();
      U.toast(`${n}件の登録を読み込みました`);
    } catch (e) {
      U.toast('usermaskの登録ファイルではないようです', 'error');
    }
  });

  /* ---------- 照合の実行 (Workerがあれば裏で) ---------- */
  let worker = null, reqSeq = 0;
  const pending = new Map();
  function getWorker() {
    if (worker !== null) return worker;
    try {
      worker = new Worker('match-core.js');
      worker.onmessage = (ev) => {
        const p = pending.get(ev.data.id);
        if (!p) return;
        pending.delete(ev.data.id);
        ev.data.ok ? p.resolve(ev.data.matches) : p.reject(new Error(ev.data.error));
      };
      worker.onerror = () => {
        worker = false;
        pending.forEach((p) => p.reject(new Error('worker')));
        pending.clear();
      };
    } catch (e) { worker = false; }
    return worker;
  }
  async function runMatch(gray, w, hh, tpls, opt) {
    const wk = getWorker();
    if (wk) {
      try {
        return await new Promise((resolve, reject) => {
          const id = ++reqSeq;
          pending.set(id, { resolve, reject });
          wk.postMessage({ id, gray, w, h: hh, tpls, opt });
        });
      } catch (e) { /* 下のメインスレッド版へ */ }
    }
    await new Promise((r) => setTimeout(r, 30));
    return MaskMatch.findTemplates(gray, w, hh, tpls, opt);
  }

  async function detect(e, manual) {
    if (!e) return;
    if (!templates.length) {
      if (manual) U.toast('先に名前やアイコンを登録してください', 'error');
      return;
    }
    if (e.detecting) return;
    e.detecting = true;
    renderThumbs();
    tplStatus.textContent = '探しています…';
    if (e === cur) { stageBadge.hidden = false; stageBadge.textContent = '登録した名前・アイコンを探しています…'; }
    try {
      const tpls = await Promise.all(templates.map(async (t) => ({ id: t.id, gray: await tplGray(t), w: t.w, h: t.h, srcW: t.srcW })));
      const t0 = performance.now();
      const matches = await runMatch(getGray(e), e.w, e.h, tpls, { threshold: settings.threshold, invert: settings.invert });
      const ms = Math.round(performance.now() - t0);
      // 自動の囲みは入れ替え、手で付けた囲みと重なるものは足さない
      const manualBoxes = e.masks.filter((m) => !m.auto).map((m) => shapeBox(m));
      const overlap = (a, b) => {
        const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
        const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        return inter / Math.min(a.w * a.h, b.w * b.h || 1);
      };
      const fresh = [];
      for (const mt of matches) {
        if (manualBoxes.some((b) => overlap(b, mt) > 0.5)) continue;
        const t = templates.find((x) => x.id === mt.tplId);
        if (!t) continue;
        const pad = t.fit ? 4 : 1;
        fresh.push({
          id: U.uid(), shape: t.shape, style: t.style, color: t.color || '#000000', fit: t.fit, auto: true, tplId: t.id,
          score: Math.round(mt.score * 100) / 100,
          x: mt.x - pad, y: mt.y - pad, w: mt.w + pad * 2, h: mt.h + pad * 2
        });
      }
      const before = e.masks.filter((m) => m.auto).length;
      if (fresh.length || before) {
        pushHistory(e);
        e.masks = e.masks.filter((m) => !m.auto).concat(fresh);
        if (e === cur && !e.masks.some((m) => m.id === selectedId)) selectedId = null;
        changed(e);
      }
      tplStatus.textContent = fresh.length ? `${fresh.length}か所で見つけました (${ms}ms)` : '見つかりませんでした';
      if (fresh.length) U.toast(`登録した名前・アイコンを${fresh.length}か所で見つけて隠しました`);
      else if (manual) U.toast('この画像では見つかりませんでした');
    } catch (err) {
      console.error(err);
      tplStatus.textContent = '探す途中でエラーになりました';
    } finally {
      e.detecting = false;
      if (e === cur) stageBadge.hidden = true;
      renderThumbs();
      if (e === cur) refreshSide();
    }
  }

  /* ================================================================ 保存 */
  const toBlob = (c) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('保存用の画像を作れませんでした'))), 'image/png'));
  const outName = (e) => `masked_${U.safeName(e.name, 'image')}.png`;
  async function saveCurrent() {
    if (!cur) return;
    try {
      const r = await U.saveImage(await toBlob(getComposite(cur)), outName(cur));
      if (r === 'downloaded' || r === 'shared') U.toast('保存しました');
    } catch (e) { U.toast(e.message, 'error'); }
  }
  async function saveAll() {
    if (!images.length) return;
    try {
      const files = [];
      for (const e of images) files.push(new File([await toBlob(getComposite(e))], outName(e), { type: 'image/png' }));
      if (U.isTouch() && navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files }); return; } catch (err) { if (err.name === 'AbortError') return; }
      }
      for (const f of files) { U.downloadBlob(f, f.name); await new Promise((r) => setTimeout(r, 350)); }
      U.toast(`${files.length}枚を保存しました`);
    } catch (e) { U.toast(e.message, 'error'); }
  }

  /* ================================================================ 起動 */
  renderToolbar();
  renderTemplates();
  updateCursor();
  updateHistoryButtons();
  U.hydrateIcons(document);

  // 動作確認・デバッグ用 (コンソールから状態を見る)
  window.__usermask = { images, view, templates: () => templates, settings, detect: (m) => detect(cur, m), get cur() { return cur; } };
})();
