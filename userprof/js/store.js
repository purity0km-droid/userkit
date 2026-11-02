/* データ層: プロフィール(localStorage) + 画像(IndexedDB) + バックアップ + コピー用テキスト */
(function () {
  'use strict';

  // 同じ github.io ドメインの他ツールと混ざらないよう、キーは userprof で始める
  const LS_KEY = 'userprof:v1';
  const DB_NAME = 'userprof-images';
  const BACKUP_APP = 'userprof';
  const BACKUP_AT_KEY = 'userprof:backupAt';      // 最後にバックアップを書き出した日時
  const BACKUP_SNOOZE_KEY = 'userprof:backupSnooze';  // 一覧のバックアップの案内を「あとで」にした日時

  /** zetaのユーザープロフィールの上限(改行も1字) */
  const ZETA_LIMIT = 1000;
  /** zetaに貼る文章の、残しておく前の版の数 */
  const ZETA_HISTORY = 10;

  /** 目印の色 (userカード・詳細画面の色帯に使用)。user.color はこの番号か、自由に選んだ '#rrggbb' */
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
    { key: 'birthday', label: '誕生日' },
    { key: 'gender', label: '性別' },
    { key: 'height', label: '身長' },
    { key: 'firstPerson', label: '一人称' },
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
      id: U.uid(), name: '', reading: '', plot: '', partners: [], color: 0, bio: '',
      extra: [],                          // 自分で足した項目 [{ id, label, value }]
      timeline: [], notes: [], images: [],
      // zetaプロフ: source=元の文章(丸ごと) / text=zetaに貼る文章 / history=前の版 [{ at, kind, text }](新しい順)
      zeta: { source: '', text: '', history: [] },
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
    u.reading = s(raw.reading);
    u.plot = s(raw.plot);
    u.partners = Array.isArray(raw.partners) ? raw.partners.map(s).filter(Boolean) : [];
    u.color = normColor(raw.color);
    u.bio = s(raw.bio);
    FIELDS.forEach((f) => { u[f.key] = s(raw[f.key]); });
    u.extra = (Array.isArray(raw.extra) ? raw.extra : []).filter((x) => x && typeof x === 'object').map((x) => ({
      id: s(x.id) || U.uid(), label: s(x.label), value: s(x.value)
    })).filter((x) => x.label.trim() || x.value.trim());
    u.timeline = (Array.isArray(raw.timeline) ? raw.timeline : []).map((t) => ({
      id: s(t.id) || U.uid(), when: s(t.when), title: s(t.title), text: s(t.text)
    }));
    u.notes = (Array.isArray(raw.notes) ? raw.notes : []).map((n) => ({
      id: s(n.id) || U.uid(), title: s(n.title), text: s(n.text)
    }));
    u.images = (Array.isArray(raw.images) ? raw.images : []).map((i) => ({
      id: s(i.id) || U.uid(), caption: s(i.caption)
    }));
    const z = raw.zeta && typeof raw.zeta === 'object' ? raw.zeta : {};
    u.zeta = {
      source: s(z.source), text: s(z.text),
      history: (Array.isArray(z.history) ? z.history : []).filter((v) => v && typeof v.text === 'string' && v.text.trim())
        .map((v) => ({ at: Number.isFinite(v.at) ? v.at : 0, kind: s(v.kind), text: v.text })).slice(0, ZETA_HISTORY)
    };
    u.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : u.createdAt;
    u.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : u.updatedAt;
    return u;
  }

  function normColor(c) {
    if (Number.isInteger(c) && c >= 0 && c < COLORS.length) return c;
    if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c.trim())) return c.trim().toLowerCase();
    return 0;
  }
  /** user の目印の色 (#rrggbb) */
  const colorHex = (u) => (typeof u.color === 'string' ? u.color : (COLORS[u.color] || COLORS[0]).hex);
  /** 目印の色と、その上に載せる文字の色 (淡い色を選んだときは濃い文字) */
  function markStyle(u) {
    const hex = colorHex(u);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return { '--mark': hex, '--mark-ink': lum > 0.55 ? '#2c2c2c' : '#ffffff' };
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
    const ok = persist();
    if (ok) askPersist();
    return ok;
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

  /**
   * zetaに貼る文章の版を残す (新しい順・同じ文章は1つにまとめる。一度コピーした版は「コピーした版」のまま)。
   * kind: copy=コピーした版 / replaced=道具で置き換える前 / restore=前の版に戻す前
   */
  function keepZeta(user, text, kind) {
    const t = String(text || '');
    if (!t.trim()) return false;
    const old = user.zeta.history.find((v) => v.text === t);
    const k = old && old.kind === 'copy' ? 'copy' : kind;
    user.zeta.history = [{ at: Date.now(), kind: k, text: t }, ...user.zeta.history.filter((v) => v !== old)].slice(0, ZETA_HISTORY);
    return true;
  }

  /* ====================================================== 消されにくくする・バックアップの日時 */
  /** ブラウザに、空き容量が減ってもこのサイトのデータを消さないよう頼む (読み込みごとに1回まで) */
  let persistAsked = null;
  function askPersist() {
    const st = navigator.storage;
    if (!st || !st.persist || !st.persisted) return Promise.resolve(null);
    if (!persistAsked) persistAsked = st.persisted().then((p) => p || st.persist()).catch(() => null);
    return persistAsked;
  }
  /** true=頼んである / false=まだ・断られた / null=このブラウザでは確かめられない */
  function persisted() {
    const st = navigator.storage;
    if (!st || !st.persisted) return Promise.resolve(null);
    return st.persisted().catch(() => null);
  }

  const readTime = (key) => {
    try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : 0; } catch (e) { return 0; }
  };
  const writeTime = (key) => { try { localStorage.setItem(key, String(Date.now())); } catch (e) { /* 案内が出続けるだけ */ } };
  const DAY = 24 * 60 * 60 * 1000;
  const backupAt = () => readTime(BACKUP_AT_KEY);
  /** 一覧でバックアップを勧めるか (最後のバックアップ、なければ最初の登録から14日たち、その後に書き換えがあるとき) */
  function backupDue() {
    if (!state.users.length) return false;
    const now = Date.now(), last = backupAt();
    if (now - readTime(BACKUP_SNOOZE_KEY) < 7 * DAY) return false;
    if (!state.users.some((u) => u.updatedAt > last)) return false;
    const since = last || Math.min(...state.users.map((u) => u.createdAt));
    return now - since >= 14 * DAY;
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
  const forget = (id) => { if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); } };
  const Images = {
    put: (id, blob) => { forget(id); return tx('readwrite', (s) => s.put({ id, blob })); },
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
      forget(id);
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
  /** バックアップを書き出したことを覚えておく (一覧の案内とバックアップの画面に使う) */
  function markBackup() {
    writeTime(BACKUP_AT_KEY);
    askPersist();
  }

  /**
   * バックアップを読んで、未登録の user(add)・ファイルの方が新しい登録済みの user(newer)・
   * それ以外の登録済みの user の数(same) に分ける。まだ何も書き換えない
   */
  function readBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('ファイルを読み取れませんでした。復元用のJSONファイルを選んでください。'); }
    if (!data || data.app !== BACKUP_APP || !Array.isArray(data.users)) {
      throw new Error('userprofのバックアップファイルではないようです。');
    }
    const seen = new Set();
    const add = [], newer = [];
    let same = 0;
    data.users.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const u = normalizeUser(raw);
      if (seen.has(u.id)) return;
      seen.add(u.id);
      const cur = getUser(u.id);
      if (!cur) add.push(u);
      else if (u.updatedAt > cur.updatedAt) newer.push(u);
      else same++;
    });
    const images = new Map((Array.isArray(data.images) ? data.images : [])
      .filter((i) => i && typeof i.dataUrl === 'string' && i.dataUrl.startsWith('data:image/')).map((i) => [i.id, i.dataUrl]));
    return { add, newer, same, images };
  }

  /** readBackup の結果を取り込む。replace=true なら newer の user をファイルの中身に置き換える */
  async function applyBackup(plan, replace) {
    // ファイルに入っている画像を書き込む。keep にある画像は、ファイルに無くても端末に残っているので使う
    const putImages = async (u, keep) => {
      const ok = [];
      for (const im of u.images) {
        const dataUrl = plan.images.get(im.id);
        if (dataUrl) {
          try { await Images.put(im.id, await dataUrlToBlob(dataUrl)); ok.push(im); continue; } catch (e) { /* 画像だけ諦める */ }
        }
        if (keep.has(im.id)) ok.push(im);
      }
      u.images = ok;
    };
    for (const u of plan.add) {
      await putImages(u, new Set());
      state.users.push(u);
    }
    if (replace) {
      for (const u of plan.newer) {
        const i = state.users.findIndex((x) => x.id === u.id);
        if (i < 0) continue;
        const old = state.users[i];
        await putImages(u, new Set(old.images.map((im) => im.id)));
        const now = new Set(u.images.map((im) => im.id));
        await Promise.all(old.images.filter((im) => !now.has(im.id)).map((im) => Images.remove(im.id).catch(() => {})));
        state.users[i] = u;
      }
    }
    persist();
    return {
      added: plan.add.length,
      replaced: replace ? plan.newer.length : 0,
      kept: plan.same + (replace ? 0 : plan.newer.length)
    };
  }

  /* ====================================================== コピー用テキスト (zetaに貼る用) */
  const sec = (label, body) => `【${label}】\n${body}`;
  const line = (label, v) => (v.includes('\n') ? sec(label, v) : `【${label}】${v}`);
  /** keys = 書き出す項目 (FIELDS の key・name・bio、自分で足した項目は 'x:<id>')。省くと全部 */
  function profileText(u, keys) {
    const want = (k) => !keys || keys.includes(k);
    const lines = [];
    if (want('name') && u.name) lines.push(`【名前】${u.name}${u.reading.trim() ? `（${u.reading.trim()}）` : ''}`);
    FIELDS.forEach((f) => {
      const v = u[f.key].trim();
      if (want(f.key) && v) lines.push(line(f.label, v));
    });
    u.extra.forEach((x) => {
      const v = x.value.trim();
      if (want('x:' + x.id) && v) lines.push(line(x.label.trim() || '項目', v));
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
    COLORS, FIELDS, ZETA_LIMIT, ZETA_HISTORY, load, users, colorHex, markStyle, getUser, plots, emptyUser, saveUser, touch, deleteUser,
    keepZeta, askPersist, persisted, backupAt, backupDue,
    snoozeBackup: () => writeTime(BACKUP_SNOOZE_KEY),
    exportBackup, markBackup, readBackup, applyBackup,
    text: { profile: profileText, timeline: timelineText, notes: notesText, all: allText }
  };
  window.Images = Images;
})();
