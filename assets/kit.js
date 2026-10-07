/* userkit 共通: DOM生成 / アイコン / ダイアログ / コピー / トースト / 保存 / ツールバー */
(function () {
  'use strict';

  // このファイルの場所から、サイトのルート(userkit/)を割り出す
  const SCRIPT_SRC = document.currentScript ? document.currentScript.src : location.href;
  const BASE = new URL('../', SCRIPT_SRC);

  /** h('div.cls', {onclick}, child, ...) — textContentベースで安全にDOMを組む */
  function h(spec, attrs, ...children) {
    const m = /^([a-z0-9]+)((?:\.[\w-]+)*)$/i.exec(spec);
    const node = document.createElement(m ? m[1] : 'div');
    if (m && m[2]) node.className = m[2].slice(1).split('.').join(' ');
    if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className += (node.className ? ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') {
          for (const [p, val] of Object.entries(v)) {
            if (p.startsWith('--')) node.style.setProperty(p, val); else node.style[p] = val;
          }
        }
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'value') node.value = v;
        else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'open') node[k] = !!v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    } else if (attrs != null) {
      children.unshift(attrs);
    }
    append(node, children);
    return node;
  }
  function append(node, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }

  /* ---------- アイコン (線画SVG) ---------- */
  const ICONS = {
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
    upload: '<path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    save: '<path d="M5 4h11l4 4v12H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    up: '<path d="M6 14l6-6 6 6"/>',
    down: '<path d="M6 10l6 6 6-6"/>',
    left: '<path d="M14 6l-6 6 6 6"/>',
    right: '<path d="M10 6l6 6-6 6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    star: '<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    bubble: '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>',
    mask: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 10h6M7 14h10"/>',
    pair: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c.7-3 2.6-4.5 5-4.5S12.3 16 13 19M11 19c.7-3 2.6-4.5 5-4.5s4.3 1.5 5 4.5"/>',
    timeline: '<path d="M6 4v16"/><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="M11 7h9M11 17h9M11 12h6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v6M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L4 13.8a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
    lasso: '<path d="M12 4c5 0 8 2.5 8 5.5S16.4 15 12 15s-8-2.5-8-5.5S7 4 12 4z" stroke-dasharray="3 2.5"/><path d="M7 14c-1 1.5-.5 3.5 1.5 3.8 1.5.2 1.5 2.2 0 2.7"/>',
    square: '<rect x="4.5" y="5.5" width="15" height="13" rx="1.5"/>',
    circle: '<circle cx="12" cy="12" r="7.5"/>',
    pointer: '<path d="M6 4l12 7-5.5 1.5L10 18z"/>',
    zoomin: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4M8.5 11h5M11 8.5v5"/>',
    zoomout: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4M8.5 11h5"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.2-.5-1.3.4-2.3 1.7-2.3H18a3 3 0 0 0 3-3C21 7 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    share: '<path d="M12 15V4m0 0-4 4m4-4 4 4"/><path d="M6 12v7h12v-7"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16m0 4v-4h-4"/>',
    github: '<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    arrow: '<path d="M4 12h16m0 0-5-5m5 5-5 5"/>',
    swap: '<path d="M4 8h14m0 0-4-4m4 4-4 4M20 16H6m0 0 4-4m-4 4 4 4"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>'
  };
  function icon(name, size) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'icon');
    s.setAttribute('aria-hidden', 'true');
    if (size) { s.style.width = s.style.height = size + 'px'; }
    s.innerHTML = ICONS[name] || '';
    return s;
  }
  function hydrateIcons(root) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      el.replaceChildren(icon(el.dataset.icon, el.dataset.iconSize));
      el.removeAttribute('data-icon');
    });
  }

  /* ---------- トースト ---------- */
  let toastTimer;
  function toast(msg, kind) {
    let t = document.getElementById('toast');
    if (!t) {
      t = h('div.toast', { id: 'toast', role: 'status', 'aria-live': 'polite' });
      document.body.append(t);
    }
    t.textContent = msg;
    t.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  /* ---------- クリップボード ---------- */
  async function copyText(text, okMsg) {
    const done = () => toast(okMsg || 'コピーしました');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return done();
      }
    } catch (e) { /* フォールバックへ */ }
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    ok ? done() : toast('コピーできませんでした', 'error');
  }

  /* ---------- ダイアログ ---------- */
  /** 汎用モーダル。content はNode。close() で閉じる。 */
  function openDialog({ title, content, wide, onClose }) {
    const dlg = h('dialog.modal' + (wide ? '.wide' : ''));
    const close = () => { if (dlg.open) dlg.close(); };
    dlg.append(
      h('div.modal-head',
        h('h2', title),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: close }, icon('close'), '閉じる')),
      content
    );
    dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.body.append(dlg);
    dlg.showModal();
    return { dlg, close };
  }

  function confirmDialog({ title, message, okLabel, danger }) {
    return new Promise((resolve) => {
      let result = false;
      const body = h('div.modal-body',
        h('p.confirm-msg', message),
        h('div.modal-foot',
          h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, 'キャンセル'),
          h('button.btn' + (danger ? '.btn-danger' : '.btn-primary'),
            { type: 'button', onclick: () => { result = true; ctl.close(); } }, okLabel || 'OK')));
      const ctl = openDialog({ title: title || '確認', content: body, onClose: () => resolve(result) });
    });
  }

  /* ---------- 小物 ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function norm(s) {
    return String(s == null ? '' : s).normalize('NFKC').toLowerCase();
  }
  const pad = (n) => String(n).padStart(2, '0');
  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  }
  function stamp(d) {
    d = d || new Date();
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  }
  /** ファイル名に使えない文字を除く */
  function safeName(s, fallback) {
    const t = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '_').slice(0, 40);
    return t || fallback || 'untitled';
  }

  /* ---------- 保存 (ダウンロード / 共有) ---------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function download(filename, text, type) {
    downloadBlob(new Blob([text], { type: type || 'application/json' }), filename);
  }
  const isTouch = () => matchMedia('(pointer: coarse)').matches;
  /**
   * 画像の保存。スマホでは共有シート(「画像を保存」が選べる)を優先し、
   * 使えなければダウンロード。最後の手段として長押し保存用のプレビューを出す。
   */
  async function saveImage(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    if (isTouch() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'aborted';
      }
    }
    try {
      downloadBlob(blob, filename);
      if (isTouch()) showLongPress(blob);
      return 'downloaded';
    } catch (e) {
      showLongPress(blob);
      return 'preview';
    }
  }
  function showLongPress(blob) {
    const url = URL.createObjectURL(blob);
    openDialog({
      title: '画像を保存',
      wide: true,
      onClose: () => URL.revokeObjectURL(url),
      content: h('div.modal-body.longpress',
        h('p.modal-lead', '保存されない場合は、画像を長押し(パソコンは右クリック)して「画像を保存」を選んでください。'),
        h('img', { src: url, alt: '保存する画像' }))
    });
  }

  /* ---------- 画像の読み込み ---------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = src;
    });
  }
  /** File/Blob → 長辺maxSideに縮小した dataURL */
  async function fileToDataUrl(file, maxSide, type) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, (maxSide || 1600) / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const hh = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = hh;
      c.getContext('2d').drawImage(img, 0, 0, w, hh);
      return c.toDataURL(type || 'image/webp', 0.88);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  /** 貼り付け(Ctrl+V)イベントから画像ファイルを取り出す */
  function imageFromPaste(e) {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile();
    }
    return null;
  }

  /* ---------- IndexedDB (キー/値) ---------- */
  function kv(dbName, storeName) {
    storeName = storeName || 'kv';
    let p;
    const open = () => p || (p = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB非対応'));
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
    const run = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const r = fn(t.objectStore(storeName));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
    return {
      get: (k) => run('readonly', (s) => s.get(k)),
      set: (k, v) => run('readwrite', (s) => s.put(v, k)),
      del: (k) => run('readwrite', (s) => s.delete(k))
    };
  }

  /* ---------- ツール一覧 / 共通バー ---------- */
  const TOOLS = [
    { id: 'userprof', label: 'プロフィール帳', icon: 'book',
      desc: 'userのプロフィール・年表・設定メモ・画像を、プロットごとにまとめて保存。zetaに貼る用のコピーも。' },
    { id: 'usermask', label: '名前・アイコン隠し', icon: 'mask',
      desc: 'スクショのユーザー名やアイコンを、なぞるだけで隠す。登録した名前は次の画像から自動で見つけます。' },
    { id: 'talklog', label: 'トーク保存', icon: 'bubble',
      desc: 'zetaのトークを、吹き出しのまま読めるHTMLファイルとして手元に保存。書き出したログの閲覧も。' },
    { id: 'userpair', label: 'ペアプロフィール', icon: 'pair',
      desc: '2人(または1人)のキャラシートを作って、画像で保存。userprofのプロフィールも読み込めます。' },
    { id: 'userline', label: 'タイムラインペアカード', icon: 'timeline',
      desc: 'プロフィール・年表・まとめ・関係を1枚に。縦長のタイムライン風カードを画像で保存。' }
  ];
  const toolUrl = (id) => new URL(id ? id + '/' : './', BASE).href;

  function mountBar(currentId) {
    const cur = TOOLS.find((t) => t.id === currentId);
    const menu = h('details.kit-menu',
      h('summary', { 'aria-label': 'ツールを切り替える' }, icon('menu'), h('span', 'ツール')),
      h('nav.kit-menu-list', { 'aria-label': 'userkit のツール' },
        h('a', { href: toolUrl('') }, icon('sparkle'), h('span', h('b', 'userkit'), h('small', 'ツール一覧'))),
        TOOLS.map((t) => h('a' + (t.id === currentId ? '.current' : ''), {
          href: toolUrl(t.id), 'aria-current': t.id === currentId ? 'page' : null
        }, icon(t.icon), h('span', h('b', t.id), h('small', t.label))))));
    document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    const bar = h('header.kitbar',
      h('a.kit-brand', { href: toolUrl(''), 'aria-label': 'userkit トップへ' },
        h('span.kit-mark', icon('bubble', 18)), h('span.kit-word', 'user', h('b', 'kit'))),
      cur && h('span.kit-sep', '/'),
      cur && h('span.kit-tool', h('b', cur.id), h('small', cur.label)),
      h('span.kit-spacer'),
      menu);
    document.body.prepend(bar);
    return bar;
  }

  function footer(extra) {
    return h('footer.kit-footer',
      extra && h('p', extra),
      h('p', 'AIチャット「zeta」向けの非公式ファンメイドツールです。zeta公式とは関係ありません。'),
      h('p', '入力した内容や画像は、この端末のブラウザの中だけで処理・保存されます。どこにも送信しません。'),
      h('p', h('a', { href: toolUrl('') }, 'userkit'), ' ・ ',
        h('a', { href: 'https://github.com/purity0km-droid/userkit', target: '_blank', rel: 'noopener' }, 'GitHub')));
  }

  window.U = {
    h, append, icon, hydrateIcons, toast, copyText, openDialog, confirmDialog, uid, norm, fmtDate, stamp, safeName,
    download, downloadBlob, saveImage, loadImage, fileToDataUrl, imageFromPaste, kv, isTouch
  };
  window.Kit = { TOOLS, BASE, toolUrl, mountBar, footer };
})();
