/* userkit 共通エディタ (userpair / userline で使う)
 *  - その場で書ける文字 (contenteditable)
 *  - 画像の枠 (クリック・ドラッグ・貼り付けで追加 / ホイール・ピンチで拡大 / ドラッグで位置合わせ)
 *  - 増やせる項目のリスト
 *  - 自動保存 (IndexedDB) / JSONの保存・読み込み / PNG書き出し / userprof からの読み込み
 *  シートは決まった幅で組み、画面が狭いときは全体を縮小して見せる(書き出す画像の見た目を端末で変えないため)。
 */
(function () {
  'use strict';
  const { h, icon } = U;
  const { pick: pickColor, normHex, toHex } = ColorPick;   // 色を選ぶダイアログ (colorpick.js)
  const H2I_URL = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const parse = (p) => (Array.isArray(p) ? p : String(p).split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k)));
  const getIn = (o, p) => parse(p).reduce((x, k) => (x == null ? undefined : x[k]), o);
  function setIn(o, p, v) {
    const ks = parse(p);
    let x = o;
    for (let i = 0; i < ks.length - 1; i++) {
      if (x[ks[i]] == null) x[ks[i]] = typeof ks[i + 1] === 'number' ? [] : {};
      x = x[ks[i]];
    }
    x[ks[ks.length - 1]] = v;
  }
  const PLAINTEXT = (() => { const d = document.createElement('div'); try { d.contentEditable = 'plaintext-only'; } catch (e) { return false; } return d.contentEditable === 'plaintext-only'; })();
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

  let hovered = null;   // マウスが乗っている画像枠 (貼り付け先)
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('[contenteditable],input,textarea')) return;
    const f = U.imageFromPaste(e);
    if (!f) return;
    const slot = (document.activeElement && document.activeElement.__setFile) ? document.activeElement : hovered;
    if (slot && slot.__setFile) { e.preventDefault(); slot.__setFile(f); }
  });

  /* ================================================================ 本体 */
  function create(cfg) {
    // cfg: { app, version, width, defaults(), migrate(state), render(ed) → Node, mount }
    const store = U.kv('userkit-editor');
    const ed = { state: cfg.defaults(), cfg };
    let saveTimer = 0;

    ed.get = (p) => getIn(ed.state, p);
    ed.set = (p, v, o) => { setIn(ed.state, p, v); ed.dirty(); if (o && o.rerender) ed.rerender(); };
    ed.dirty = () => { clearTimeout(saveTimer); saveTimer = setTimeout(ed.save, 400); };
    ed.save = async () => {
      try { await store.set(cfg.app, { v: cfg.version, state: ed.state, at: Date.now() }); }
      catch (e) { U.toast('ブラウザに保存できませんでした(容量をご確認ください)', 'error'); }
    };
    ed.load = async () => {
      try {
        const r = await store.get(cfg.app);
        if (r && r.state) ed.state = cfg.migrate ? cfg.migrate(r.state) : r.state;
      } catch (e) { /* 初回など */ }
    };

    /* ---------- 表示 (縮小して収める) ---------- */
    const zoomBox = h('div.ed-zoom');
    const stage = h('div.ed-stage', zoomBox);
    cfg.mount.append(stage);
    const fit = () => {
      const avail = stage.clientWidth;
      zoomBox.style.zoom = String(Math.min(1, avail / cfg.width));
    };
    new ResizeObserver(fit).observe(stage);
    ed.rerender = () => {
      const y = window.scrollY;
      ed.sheet = cfg.render(ed);
      zoomBox.replaceChildren(ed.sheet);
      fit();
      window.scrollTo(0, y);
    };

    /* ---------- その場で書ける文字 ---------- */
    ed.text = (p, o) => {
      o = o || {};
      const el = h((o.tag || 'div') + '.ed-text' + (o.cls ? '.' + o.cls : '') + (o.multi ? '.multi' : ''),
        { 'data-ph': o.ph || '', spellcheck: 'false', role: 'textbox', 'aria-label': o.label || o.ph || '入力', 'aria-multiline': o.multi ? 'true' : 'false' });
      el.contentEditable = PLAINTEXT ? 'plaintext-only' : 'true';
      const v0 = ed.get(p) || '';
      el.textContent = v0;
      el.classList.toggle('is-empty', !v0.trim());
      el.addEventListener('input', () => {
        // innerText は CSS の text-transform(大文字表示など)を反映して返すので、外して読む(入力したとおりに保存する)
        const tt = el.style.textTransform;
        el.style.textTransform = 'none';
        let v = el.innerText.replace(/ /g, ' ').replace(/\n+$/, '');
        el.style.textTransform = tt;
        if (!o.multi) v = v.replace(/\n/g, ' ');
        ed.set(p, v);
        el.classList.toggle('is-empty', !v.trim());
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !o.multi && !e.isComposing) { e.preventDefault(); el.blur(); } });
      if (!PLAINTEXT) {
        el.addEventListener('paste', (e) => {
          e.preventDefault();
          const t = (e.clipboardData || window.clipboardData).getData('text/plain');
          document.execCommand('insertText', false, o.multi ? t : t.replace(/\n/g, ' '));
        });
      }
      return el;
    };

    /* ---------- 画像の枠 ---------- */
    ed.image = (p, o) => {
      o = o || {};
      const R = o.ratio || 1;
      const slot = h('div.ed-img' + (o.round ? '.round' : '') + (o.cls ? '.' + o.cls : ''), {
        tabindex: 0, role: 'button', 'aria-label': (o.label || '画像') + '(クリックで選ぶ・ドラッグ・貼り付け)',
        style: { aspectRatio: String(R) }
      });
      const input = h('input.ed-ui', { type: 'file', accept: 'image/*', hidden: true });
      const place = (img, v) => {
        const A = v.w / v.h, z = v.zoom || 1;
        const wp = Math.max(1, A / R) * z * 100, hp = Math.max(R / A, 1) * z * 100;
        img.style.width = wp + '%';
        img.style.height = hp + '%';
        img.style.left = ((100 - wp) / 2 + (v.x || 0) * 100) + '%';
        img.style.top = ((100 - hp) / 2 + (v.y || 0) * 100) + '%';
      };
      const clampV = (v) => {
        const A = v.w / v.h, z = v.zoom;
        const mx = (Math.max(1, A / R) * z - 1) / 2, my = (Math.max(R / A, 1) * z - 1) / 2;
        v.x = clamp(v.x || 0, -mx, mx);
        v.y = clamp(v.y || 0, -my, my);
      };
      const draw = () => {
        const v = ed.get(p);
        slot.replaceChildren(input);
        const has = !!(v && v.src);
        slot.classList.toggle('has-img', has);
        if (!has) {
          slot.append(h('div.ed-img-ph.ed-ui', icon('plus', o.round ? 16 : 20),
            !o.compact && h('b', o.label || '画像'),
            !o.compact && !o.round && h('small', 'クリック・ドラッグ・貼り付け')));
          return;
        }
        const img = h('img', { src: v.src, alt: '', draggable: 'false' });
        place(img, v);
        slot.append(img, h('div.ed-img-tools.ed-ui',
          h('button', { type: 'button', title: '画像を変える', 'aria-label': '画像を変える', onclick: (e) => { e.stopPropagation(); input.click(); } }, icon('image', 14)),
          h('button', { type: 'button', title: '大きさ・位置を戻す', 'aria-label': '大きさ・位置を戻す', onclick: (e) => { e.stopPropagation(); Object.assign(v, { x: 0, y: 0, zoom: 1 }); ed.dirty(); draw(); } }, icon('refresh', 14)),
          h('button', { type: 'button', title: '画像を外す', 'aria-label': '画像を外す', onclick: (e) => { e.stopPropagation(); ed.set(p, null); draw(); } }, icon('close', 14))));
      };
      const setFile = async (f) => {
        if (!f || !f.type || !f.type.startsWith('image/')) return U.toast('画像ファイルを選んでください', 'error');
        try {
          const src = await U.fileToDataUrl(f, o.max || 1400);
          const img = await U.loadImage(src);
          ed.set(p, { src, w: img.naturalWidth, h: img.naturalHeight, x: 0, y: 0, zoom: 1 });
          draw();
        } catch (e) { U.toast('画像を読み込めませんでした', 'error'); }
      };
      slot.__setFile = setFile;
      input.addEventListener('change', () => { setFile(input.files[0]); input.value = ''; });
      slot.addEventListener('click', (e) => { if (e.target.closest('.ed-img-tools')) return; if (!(ed.get(p) || {}).src) input.click(); });
      slot.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === slot) { e.preventDefault(); input.click(); } });
      slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('over'));
      slot.addEventListener('drop', (e) => { e.preventDefault(); slot.classList.remove('over'); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
      slot.addEventListener('pointerenter', () => { hovered = slot; });
      slot.addEventListener('pointerleave', () => { if (hovered === slot) hovered = null; });
      slot.addEventListener('wheel', (e) => {
        const v = ed.get(p);
        if (!v || !v.src) return;
        e.preventDefault();
        v.zoom = clamp((v.zoom || 1) * Math.exp(-e.deltaY * 0.0015), 1, 6);
        clampV(v);
        place(slot.querySelector('img'), v);
        ed.dirty();
      }, { passive: false });
      // ドラッグで位置合わせ / 2本指で拡大
      const pts = new Map();
      let g = null;
      slot.addEventListener('pointerdown', (e) => {
        const v = ed.get(p);
        if (!v || !v.src || e.target.closest('.ed-img-tools')) return;
        try { slot.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const r = slot.getBoundingClientRect();
        if (pts.size === 1) g = { type: 'pan', sx: e.clientX, sy: e.clientY, x0: v.x || 0, y0: v.y || 0, w: r.width, hh: r.height };
        else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          g = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: v.zoom || 1 };
        }
      });
      slot.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId) || !g) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const v = ed.get(p);
        if (!v) return;
        if (g.type === 'pan') {
          v.x = g.x0 + (e.clientX - g.sx) / g.w;
          v.y = g.y0 + (e.clientY - g.sy) / g.hh;
        } else if (pts.size >= 2) {
          const [a, b] = [...pts.values()];
          v.zoom = clamp(g.z0 * (Math.hypot(a.x - b.x, a.y - b.y) || 1) / g.d0, 1, 6);
        }
        clampV(v);
        place(slot.querySelector('img'), v);
      });
      const end = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (!pts.size) { g = null; ed.dirty(); }
      };
      slot.addEventListener('pointerup', end);
      slot.addEventListener('pointercancel', end);
      slot.addEventListener('dblclick', () => { const v = ed.get(p); if (v && v.src) { Object.assign(v, { x: 0, y: 0, zoom: 1 }); ed.dirty(); draw(); } });
      draw();
      return slot;
    };

    /* ---------- 増やせる項目 ---------- */
    ed.list = (p, renderItem, o) => {
      o = o || {};
      let arr = ed.get(p);
      if (!Array.isArray(arr)) { arr = []; setIn(ed.state, p, arr); }
      const wrap = h('div.ed-list' + (o.cls ? '.' + o.cls : ''));
      arr.forEach((item, i) => {
        const node = renderItem(item, i, parse(p).concat(i).join('.'));
        node.classList.add('ed-item');
        if (o.removable !== false) {
          node.append(h('button.ed-rm.ed-ui', {
            type: 'button', title: o.rmLabel || '削除', 'aria-label': o.rmLabel || '削除',
            onclick: (e) => { e.stopPropagation(); arr.splice(i, 1); ed.set(p, arr, { rerender: true }); }
          }, icon('close', 11)));
        }
        wrap.append(node);
      });
      if (o.add && (!o.max || arr.length < o.max)) {
        wrap.append(h('button.ed-add.ed-ui', { type: 'button', onclick: () => { arr.push(o.add()); ed.set(p, arr, { rerender: true }); } },
          icon('plus', 12), o.addLabel || '追加'));
      }
      return wrap;
    };

    /* ---------- 色 (押すと、画像からスポイト・パレット・カラーコードで選べる) ---------- */
    // o.sources: () => [{ src, label }] スポイトに使う画像(省略時はシート内の画像すべて) / o.title: 文字 or () => 文字
    ed.color = (p, o) => {
      o = o || {};
      const sw = h('button.ed-color', { type: 'button', title: '色を変える(画像からスポイトもできます)' });
      const show = () => {
        const v = ed.get(p) || '#cccccc';
        sw.style.setProperty('--c', v);
        sw.setAttribute('aria-label', `色 ${v.toUpperCase()}(押して変える)`);
        sw.replaceChildren(...(o.code !== false ? [h('span.ed-color-code', v.toUpperCase())] : []));
      };
      sw.addEventListener('click', async () => {
        const t = typeof o.title === 'function' ? o.title() : o.title;
        const v = await pickColor({ value: ed.get(p), title: t ? `${t} の色` : '色を選ぶ', sources: (o.sources || ed.images)() });
        if (v) { ed.set(p, v); show(); }
      });
      show();
      return sw;
    };
    /** シートに入っている画像 [{ src }] */
    ed.images = () => {
      const out = [];
      const walk = (x) => {
        if (!x || typeof x !== 'object') return;
        if (typeof x.src === 'string' && x.src) out.push({ src: x.src });
        else Object.values(x).forEach(walk);
      };
      walk(ed.state);
      return out;
    };

    /* ---------- 書き出し・保存 ---------- */
    ed.exportPng = async (filename) => {
      const node = ed.sheet;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const lib = await loadH2I();
      const z = zoomBox.style.zoom;
      zoomBox.style.zoom = '1';
      node.classList.add('exporting');
      try {
        const opts = {
          pixelRatio: 2, skipFonts: true, cacheBust: false,
          backgroundColor: getComputedStyle(node).backgroundColor,
          filter: (n) => !(n.classList && n.classList.contains('ed-ui'))
        };
        let blob = await lib.toBlob(node, opts);
        if (isSafari) blob = await lib.toBlob(node, opts);   // Safariは2回目で画像がそろう
        if (!blob) throw new Error('画像を作れませんでした');
        await U.saveImage(blob, filename);
      } finally {
        node.classList.remove('exporting');
        zoomBox.style.zoom = z;
      }
    };
    ed.saveJson = () => U.download(`${cfg.app}-${U.stamp()}.json`, JSON.stringify({ app: cfg.app, version: cfg.version, state: ed.state }));
    ed.loadJson = async (file) => {
      let data;
      try { data = JSON.parse(await file.text()); } catch (e) { return U.toast('ファイルを読み取れませんでした', 'error'); }
      if (!data || data.app !== cfg.app || !data.state) return U.toast(`${cfg.app} の保存ファイルではないようです`, 'error');
      ed.state = cfg.migrate ? cfg.migrate(data.state) : data.state;
      await ed.save();
      ed.rerender();
      U.toast('読み込みました');
    };
    ed.reset = async () => {
      if (!(await U.confirmDialog({ title: 'すべて消す', message: '入力した内容と画像をすべて消して、最初の状態に戻しますか?(先に「保存」しておくと安心です)', okLabel: '消す', danger: true }))) return;
      ed.state = cfg.defaults();
      await ed.save();
      ed.rerender();
    };

    /* ---------- ツールバーの部品 ---------- */
    ed.fileButton = (label, onFile, accept) => {
      const inp = h('input', { type: 'file', accept: accept || '.json,application/json', hidden: true });
      inp.addEventListener('change', () => { const f = inp.files[0]; inp.value = ''; if (f) onFile(f); });
      return h('span', inp, h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => inp.click() }, icon('upload'), label));
    };
    ed.exportButton = (getName) => {
      const b = h('button.btn.btn-primary.btn-sm', { type: 'button' }, icon('download'), '画像で保存');
      b.addEventListener('click', async () => {
        b.disabled = true;
        try { await ed.exportPng(getName()); } catch (e) { console.error(e); U.toast(e.message || '画像にできませんでした', 'error'); }
        finally { b.disabled = false; }
      });
      return b;
    };
    /** ボタンの下に開く小さなパネル */
    ed.popover = (label, iconName, build) => {
      const box = h('details.ed-pop', h('summary.btn.btn-outline.btn-sm', icon(iconName), label), h('div.ed-pop-body'));
      box.addEventListener('toggle', () => { if (box.open) box.querySelector('.ed-pop-body').replaceChildren(build(() => { box.open = false; })); });
      // パネルから開いたダイアログ(色を選ぶなど)の操作では閉じない
      document.addEventListener('click', (e) => { if (box.open && !box.contains(e.target) && !(e.target.closest && e.target.closest('dialog'))) box.open = false; });
      return box;
    };
    return ed;
  }

  /* ================================================================ 画像化ライブラリの読み込み */
  let h2iPromise = null;
  function loadH2I() {
    if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
    if (!h2iPromise) {
      h2iPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = H2I_URL;
        s.onload = () => (window.htmlToImage ? resolve(window.htmlToImage) : reject(new Error('画像化の部品を読み込めませんでした')));
        s.onerror = () => { h2iPromise = null; reject(new Error('画像化の部品を読み込めませんでした。通信できる状態で、もう一度お試しください')); };
        document.head.append(s);
      });
    }
    return h2iPromise;
  }

  /* ================================================================ userprof から読み込む */
  function readUserprofUsers() {
    try {
      const d = JSON.parse(localStorage.getItem('userprof:v1'));
      return d && Array.isArray(d.users) ? d.users : [];
    } catch (e) { return []; }
  }
  function userprofImage(id) {
    return new Promise((resolve) => {
      if (!window.indexedDB || !id) return resolve(null);
      const req = indexedDB.open('userprof-images', 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('images')) req.result.createObjectStore('images', { keyPath: 'id' }); };
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        try {
          const g = req.result.transaction('images', 'readonly').objectStore('images').get(id);
          g.onsuccess = () => resolve(g.result ? g.result.blob : null);
          g.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      };
    });
  }
  /** userprof の user を選ばせて、{ user, image:{src,w,h}|null } を返す */
  function pickUserprof() {
    const users = readUserprofUsers();
    if (!users.length) {
      U.toast('userprof に user が見つかりません(同じ端末・同じブラウザで登録してください)', 'error');
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let chosen = null;
      const list = h('div.pick-list', users.map((u) => h('button', {
        type: 'button',
        onclick: () => { chosen = u; ctl.close(); }
      }, icon('user'), h('span', h('b', u.name || '(名前なし)'), h('br'), h('small', [u.plot, (u.partners || []).join('、')].filter(Boolean).join(' ／ ') || 'プロット未設定')))));
      const ctl = U.openDialog({
        title: 'userprof から読み込む',
        content: h('div.modal-body', h('p.modal-lead', '名前・プロフィールと、1枚目の画像を読み込みます。'), list),
        onClose: async () => {
          if (!chosen) return resolve(null);
          let image = null;
          const blob = chosen.images && chosen.images[0] ? await userprofImage(chosen.images[0].id) : null;
          if (blob) {
            try {
              const src = await U.fileToDataUrl(blob, 1400);
              const img = await U.loadImage(src);
              image = { src, w: img.naturalWidth, h: img.naturalHeight, x: 0, y: 0, zoom: 1 };
            } catch (e) { image = null; }
          }
          resolve({ user: chosen, image });
        }
      });
    });
  }

  /* ================================================================ テーマ(配色) */
  const THEMES = [
    // 初期値: pair-canvas と同じ配色
    { id: 'basic', name: 'ベーシック', main: '#6d5dfc', soft: '#efedff', bg: '#f5f7fb', card: '#ffffff', text: '#2c2c2c', muted: '#6b6478', line: '#e3e0fb', ink: '#ffffff' },
    { id: 'rose', name: 'ローズ', main: '#e58fa9', soft: '#fde8ee', bg: '#fff6f8', card: '#ffffff', text: '#4a2f3a', muted: '#a8848f', line: '#f3d4de', ink: '#ffffff' },
    { id: 'lavender', name: 'ラベンダー', main: '#9b7fd6', soft: '#efe8fb', bg: '#f8f5fe', card: '#ffffff', text: '#3a2f50', muted: '#8d82a6', line: '#e1d8f3', ink: '#ffffff' },
    { id: 'mint', name: 'ミント', main: '#5fb8a5', soft: '#e1f4ef', bg: '#f4fbf9', card: '#ffffff', text: '#23433d', muted: '#6f938b', line: '#cfe9e2', ink: '#ffffff' },
    { id: 'sky', name: 'スカイ', main: '#6aa4e0', soft: '#e3effc', bg: '#f5f9ff', card: '#ffffff', text: '#243a52', muted: '#7189a3', line: '#d3e3f6', ink: '#ffffff' },
    { id: 'lemon', name: 'レモン', main: '#e2ad3b', soft: '#fbf1d6', bg: '#fffbf0', card: '#ffffff', text: '#4a3b16', muted: '#a08e5f', line: '#f2e3b8', ink: '#ffffff' },
    { id: 'mono', name: 'モノクロ', main: '#4a4a50', soft: '#ececee', bg: '#f7f7f8', card: '#ffffff', text: '#222226', muted: '#808086', line: '#dedee2', ink: '#ffffff' },
    { id: 'night', name: 'ナイト', main: '#b79cff', soft: '#2c2840', bg: '#17151f', card: '#211e2d', text: '#ece8f7', muted: '#9a93b3', line: '#363149', ink: '#17151f' }
  ];
  const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
  // 自分で決められる色 [キー, 名前, 使われる所]
  const TOKENS = [
    ['main', 'メイン', '見出し・帯・点'], ['soft', '淡い色', 'タグ・枠の面'], ['bg', '背景', 'シートの地'], ['card', 'カード', 'カードの地'],
    ['text', '文字', ''], ['muted', '薄い文字', 'ラベルなど'], ['line', '線', '枠線・区切り'], ['ink', '帯の文字', 'メインの上の文字']
  ];
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return toHex(...x.map((v, i) => v * t + y[i] * (1 - t))); };
  const lum = (hex) => {
    const [r, g, b] = rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /**
   * テーマの色に、自分で決めた色(pal: { main: '#rrggbb', ... })を重ねる。
   * 決めていない色のうち、淡い色・線・薄い文字・帯の文字は、決めた色に合わせて作り直す。
   */
  function themeColors(id, pal) {
    const t = Object.assign({}, themeOf(id));
    const o = {};
    TOKENS.forEach(([k]) => { const v = normHex(pal && pal[k]); if (v) o[k] = v; });
    ['main', 'bg', 'card', 'text'].forEach((k) => { if (o[k]) t[k] = o[k]; });
    t.soft = o.soft || (o.main || o.card ? mix(t.main, t.card, 0.13) : t.soft);
    t.line = o.line || (o.main || o.card ? mix(t.main, t.card, 0.2) : t.line);
    t.muted = o.muted || (o.text || o.card ? mix(t.text, t.card, 0.65) : t.muted);
    t.ink = o.ink || (o.main ? (1.05 / (lum(t.main) + 0.05) >= 3 ? '#ffffff' : '#1f1d26') : t.ink);
    return t;
  }
  /** シートに付けるCSS変数 */
  function themeVars(id, pal) {
    const t = themeColors(id, pal);
    return {
      '--t-main': t.main, '--t-soft': t.soft, '--t-bg': t.bg, '--t-card': t.card, '--t-text': t.text,
      '--t-muted': t.muted, '--t-line': t.line, '--t-ink': t.ink,
      '--accent': t.main, '--ph': t.muted + 'aa', '--ph-line': t.line, '--muted-c': t.muted, '--img-bg': t.soft
    };
  }
  /**
   * テーマを選ぶポップオーバー。下で色を自分で決めることもできる(カラーコード・パレット・画像からスポイト)。
   * o.palette: 自分で決めた色を入れる場所(既定 'palette') / o.tokens: 出す色のキー(既定 すべて)
   */
  function themePicker(ed, path, o) {
    o = o || {};
    const palPath = o.palette || 'palette';
    const tokens = TOKENS.filter(([k]) => !o.tokens || o.tokens.includes(k));
    const pal = () => {
      let v = ed.get(palPath);
      if (!v || typeof v !== 'object') { v = {}; ed.set(palPath, v); }
      return v;
    };
    // シートは作り直さず、色の変数だけ差し替える(入力中の文字や画像をそのままにするため)
    const restyle = () => {
      if (!ed.sheet) return;
      Object.entries(themeVars(ed.get(path), pal())).forEach(([k, v]) => ed.sheet.style.setProperty(k, v));
    };
    return ed.popover('テーマ', 'palette', () => {
      const setOwn = (k, v) => { if (v) ed.set(`${palPath}.${k}`, v); else { delete pal()[k]; ed.dirty(); } };
      // 表示をいまの色にそろえる(入力中の欄は書き換えない)
      const sync = () => {
        const p = pal();
        const eff = themeColors(ed.get(path), p);
        themeBtns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === ed.get(path) ? 'true' : 'false'));
        rows.forEach(({ k, row, sw, hex, rm }) => {
          const own = normHex(p[k]);
          row.classList.toggle('own', !!own);
          sw.style.setProperty('--c', eff[k]);
          hex.placeholder = eff[k].toUpperCase();
          if (document.activeElement !== hex) hex.value = own ? own.toUpperCase() : '';
          rm.disabled = !own;
        });
        resetAll.disabled = !tokens.some(([k]) => normHex(p[k]));
        restyle();
      };
      const themeBtns = THEMES.map((t) => h('button.theme-opt', {
        type: 'button', 'data-id': t.id, onclick: () => { ed.set(path, t.id); sync(); }
      }, h('span.theme-dots', h('i', { style: { background: t.main } }), h('i', { style: { background: t.soft } }), h('i', { style: { background: t.bg } })), t.name));
      const rows = tokens.map(([k, name, where]) => {
        const sw = h('button.pal-sw', { type: 'button', title: '色を選ぶ(パレット・画像からスポイト)', 'aria-label': `${name}の色を選ぶ` });
        const hex = h('input.pal-hex', { type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': `${name}のカラーコード` });
        const rm = h('button.pal-rm', { type: 'button', title: 'テーマの色に戻す', 'aria-label': `${name}をテーマの色に戻す`, onclick: () => { setOwn(k, null); sync(); } }, icon('close', 11));
        sw.addEventListener('click', async () => {
          const v = await pickColor({ value: themeColors(ed.get(path), pal())[k], title: name.endsWith('色') ? name : `${name}の色`, sources: ed.images() });
          if (v) { setOwn(k, v); sync(); }
        });
        hex.addEventListener('input', () => {
          const v = normHex(hex.value);
          if (v || !hex.value.trim()) { setOwn(k, v); sync(); }
        });
        // 入力を終えたら、書きかけ(不正なコード)を消して決まった色の表記にそろえる
        hex.addEventListener('change', () => { const own = normHex(pal()[k]); hex.value = own ? own.toUpperCase() : ''; });
        hex.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); hex.blur(); } });
        return { k, sw, hex, rm, row: h('div.pal-row', sw, h('span.pal-name', h('b', name), where && h('small', where)), hex, rm) };
      });
      const resetAll = h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { ed.set(palPath, {}); sync(); } }, icon('refresh', 13), 'すべて戻す');
      const box = h('div.theme-pop',
        h('div.theme-grid', themeBtns),
        h('div.pal-head', h('b', '色を自分で決める'), resetAll),
        h('p.hint', 'カラーコード(#RRGGBB)を入れるか、色の丸を押して選びます(画像からスポイトも可)。決めた色はテーマより優先されます。'),
        h('div.pal-list', rows.map((r) => r.row)));
      sync();
      return box;
    });
  }
  /** 表示する項目を選ぶポップオーバー */
  function showPicker(ed, path, items) {
    return ed.popover('表示項目', 'eye', () => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      items.map(([key, label]) => {
        const cb = h('input', { type: 'checkbox', checked: ed.get(path + '.' + key) !== false });
        cb.addEventListener('change', () => ed.set(path + '.' + key, cb.checked, { rerender: true }));
        return h('label.check', cb, label);
      })));
  }

  window.Ed = { create, pickUserprof, pickColor, getIn, setIn, THEMES, themeColors, themeVars, themePicker, showPicker };
})();
