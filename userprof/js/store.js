/* データ層: プロフィール(localStorage) + 画像(IndexedDB) + バックアップ + コピー用テキスト */
(function () {
  'use strict';

  // 同じ github.io ドメインの他ツールと混ざらないよう、キーは userprof で始める
  const LS_KEY = 'userprof:v1';
  const DB_NAME = 'userprof-images';
  const BACKUP_APP = 'userprof';

  /** 目印の色 (userカード・詳細画面の色帯に使用) */
  const COLORS = [
    { name: 'ラベンダー', hex: '#b79ce0' },
    { name: 'セージ', hex: '#9dbd9d' },
    { name: 'ローズ', hex: '#d98aa0' },
    { name: 'ミストブルー', hex: '#8fb0cc' },
    { name: 'ミルクティー', hex: '#c9a98a' },
    { name: 'バイオレット', hex: '#7b3fc4' },
    { name: 'ピンク', hex: '#f08bbd' },
    { name: 'スカイブルー', hex: '#4fb3f0' },
    { name: 'ターコイズ', hex: '#2cc1b5' },
    { name: 'グリーン', hex: '#4cb264' },
    { name: 'ライム', hex: '#a6d640' },
    { name: 'イエロー', hex: '#f2cf3a' },
    { name: 'オレンジ', hex: '#f09a3a' },
    { name: 'レッド', hex: '#e2514f' },
    { name: 'ブラウン', hex: '#8b5e3c' },
    { name: 'グレー', hex: '#8b8b97' }
  ];

  /** 詳しいプロフィールの項目 (long=複数行入力) */
  const FIELDS = [
    { key: 'age', label: '年齢' },
    { key: 'gender', label: '性別' },
    { key: 'height', label: '身長' },
    { key: 'occupation', label: '職業・立場' },
    { key: 'hairColor', label: '髪色' },
    { key: 'hairStyle', label: '髪型' },
    { key: 'eyes', label: '瞳の色' },
    { key: 'style', label: '服装・雰囲気', long: true },
    { key: 'personality', label: '性格', long: true },
    { key: 'family', label: '家族構成', long: true },
    { key: 'likes', label: '好きなもの', long: true },
    { key: 'dislikes', label: '嫌いなもの', long: true },
    { key: 'past', label: '生い立ち・過去', long: true }
  ];

  /* ====================================================== プロフィール */
  let state = { version: 1, users: [] };

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.users)) state = { version: 1, users: parsed.users.map(normalizeUser) };
      }
    } catch (e) {
      console.error('読み込みに失敗しました', e);
    }
  }
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      U.toast('保存できませんでした(ブラウザの保存容量/設定をご確認ください)', 'error');
      return false;
    }
  }

  function emptyUser() {
    const now = Date.now();
    const u = {
      id: U.uid(), name: '', plot: '', partners: [], color: 0, bio: '',
      timeline: [], notes: [], images: [],
      createdAt: now, updatedAt: now
    };
    FIELDS.forEach((f) => { u[f.key] = ''; });
    return u;
  }
  /** 外部データ(バックアップ等)を安全な形に揃える */
  function normalizeUser(raw) {
    const u = emptyUser();
    const s = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
    u.id = s(raw.id) || u.id;
    u.name = s(raw.name);
    u.plot = s(raw.plot);
    u.partners = Array.isArray(raw.partners) ? raw.partners.map(s).filter(Boolean) : [];
    u.color = Number.isInteger(raw.color) && raw.color >= 0 && raw.color < COLORS.length ? raw.color : 0;
    u.bio = s(raw.bio);
    FIELDS.forEach((f) => { u[f.key] = s(raw[f.key]); });
    u.timeline = (Array.isArray(raw.timeline) ? raw.timeline : []).map((t) => ({
      id: s(t.id) || U.uid(), when: s(t.when), title: s(t.title), text: s(t.text)
    }));
    u.notes = (Array.isArray(raw.notes) ? raw.notes : []).map((n) => ({
      id: s(n.id) || U.uid(), title: s(n.title), text: s(n.text)
    }));
    u.images = (Array.isArray(raw.images) ? raw.images : []).map((i) => ({
      id: s(i.id) || U.uid(), caption: s(i.caption)
    }));
    u.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : u.createdAt;
    u.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : u.updatedAt;
    return u;
  }

  const users = () => state.users;
  const getUser = (id) => state.users.find((u) => u.id === id) || null;
  function plots() {
    return [...new Set(state.users.map((u) => u.plot.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
  }

  function saveUser(user) {
    user.updatedAt = Date.now();
    const i = state.users.findIndex((u) => u.id === user.id);
    if (i >= 0) state.users[i] = user; else state.users.unshift(user);
    return persist();
  }
  /** 既存userの一部を書き換えて保存 (更新日時も更新) */
  function touch(user) {
    user.updatedAt = Date.now();
    return persist();
  }
  async function deleteUser(id) {
    const u = getUser(id);
    if (!u) return;
    state.users = state.users.filter((x) => x.id !== id);
    persist();
    await Promise.all(u.images.map((im) => Images.remove(im.id).catch(() => {})));
  }

  /* ====================================================== 画像 (IndexedDB) */
  let dbPromise;
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB非対応'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  function tx(mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction('images', mode);
      const r = fn(t.objectStore('images'));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  const urlCache = new Map();
  const Images = {
    put: (id, blob) => tx('readwrite', (s) => s.put({ id, blob })),
    async blob(id) {
      const rec = await tx('readonly', (s) => s.get(id));
      return rec ? rec.blob : null;
    },
    async url(id) {
      if (urlCache.has(id)) return urlCache.get(id);
      const b = await Images.blob(id);
      if (!b) return null;
      const url = URL.createObjectURL(b);
      urlCache.set(id, url);
      return url;
    },
    async remove(id) {
      if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
      return tx('readwrite', (s) => s.delete(id));
    },
    /** 長辺を縮小してWebP/JPEGで保存 (容量節約) */
    async fromFile(file, maxSide = 1280) {
      const bmp = await loadBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できません'))), 'image/webp', 0.86);
      });
    }
  };
  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めません')); };
      img.src = url;
    });
  }
  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const dataUrlToBlob = (dataUrl) => fetch(dataUrl).then((r) => r.blob());

  /* ====================================================== バックアップ */
  async function exportBackup() {
    const imgs = [];
    for (const u of state.users) {
      for (const im of u.images) {
        const blob = await Images.blob(im.id).catch(() => null);
        if (blob) imgs.push({ id: im.id, dataUrl: await blobToDataUrl(blob) });
      }
    }
    return JSON.stringify({
      app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(),
      users: state.users, images: imgs
    });
  }

  /** 登録済みuserはそのまま残し、未登録のuserだけ追加する */
  async function importBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('ファイルを読み取れませんでした。復元用のJSONファイルを選んでください。'); }
    if (!data || data.app !== BACKUP_APP || !Array.isArray(data.users)) {
      throw new Error('userprofのバックアップファイルではないようです。');
    }
    const have = new Set(state.users.map((u) => u.id));
    const imgMap = new Map((Array.isArray(data.images) ? data.images : []).map((i) => [i.id, i.dataUrl]));
    let added = 0, skipped = 0;
    for (const raw of data.users) {
      if (!raw || typeof raw !== 'object') continue;
      const u = normalizeUser(raw);
      if (have.has(u.id)) { skipped++; continue; }
      const ok = [];
      for (const im of u.images) {
        const dataUrl = imgMap.get(im.id);
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) continue;
        try { await Images.put(im.id, await dataUrlToBlob(dataUrl)); ok.push(im); } catch (e) { /* 画像だけ諦める */ }
      }
      u.images = ok;
      state.users.push(u);
      have.add(u.id);
      added++;
    }
    persist();
    return { added, skipped };
  }

  /* ====================================================== コピー用テキスト (zetaに貼る用) */
  const sec = (label, body) => `【${label}】\n${body}`;
  function profileText(u, keys) {
    const want = (k) => !keys || keys.includes(k);
    const lines = [];
    if (want('name') && u.name) lines.push(`【名前】${u.name}`);
    FIELDS.forEach((f) => {
      const v = u[f.key].trim();
      if (want(f.key) && v) lines.push(v.includes('\n') ? sec(f.label, v) : `【${f.label}】${v}`);
    });
    if (want('bio') && u.bio.trim()) lines.push(sec('自由メモ・背景設定', u.bio.trim()));
    return lines.join('\n');
  }
  function timelineText(u) {
    if (!u.timeline.length) return '';
    return sec('年表', u.timeline.map((t) => {
      const head = [t.when, t.title].filter(Boolean).join(' ');
      return `・${head}${t.text.trim() ? '\n  ' + t.text.trim().replace(/\n/g, '\n  ') : ''}`;
    }).join('\n'));
  }
  function notesText(u) {
    return u.notes.map((n) => sec(n.title || 'メモ', n.text.trim())).join('\n\n');
  }
  function allText(u) {
    return [
      profileText(u),
      u.plot ? `【プロット】${u.plot}` : '',
      u.partners.length ? `【相手キャラ】${u.partners.join('、')}` : '',
      timelineText(u), notesText(u)
    ].filter(Boolean).join('\n\n');
  }

  window.Store = {
    COLORS, FIELDS, load, users, getUser, plots, emptyUser, saveUser, touch, deleteUser,
    exportBackup, importBackup,
    text: { profile: profileText, timeline: timelineText, notes: notesText, all: allText }
  };
  window.Images = Images;
})();
