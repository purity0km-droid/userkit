/* データ層: プロット(IndexedDB) + 画像(IndexedDB) + 前の版 + バックアップ */
(function () {
  'use strict';

  // 同じ github.io ドメインの他ツールと混ざらないよう、名前は charplot で始める
  const DB_NAME = 'charplot';
  const BACKUP_APP = 'charplot';
  const BACKUP_AT_KEY = 'charplot:backupAt';
  const BACKUP_SNOOZE_KEY = 'charplot:backupSnooze';
  /** 残しておく前の版の数 (プロットごと) */
  const HISTORY = 20;
  /** これより大きい画像は縮めて保存する (小さい画像は元のファイルのまま) */
  const KEEP_ORIGINAL = 5 * 1024 * 1024;

  /**
   * zeta の字数の上限 (2026-11-02 に編集画面で確かめた値。改行も1字)。
   * prompt = 説明・ナレーター・キャラの名前とプロフィールの合計(題名・トークプロフィール・状況例は数えない)
   * about = 紹介文の本文とキャラごとの欄の合計
   */
  const LIMIT = {
    title: 20, charName: 10, prompt: 2400,
    profName: 20, profSummary: 50, profDesc: 1000,
    examples: 2000, intro: 1500, short: 40, about: 10000, comment: 150,
    // 設定集の画面(2026-11-13 にユーザーのスクショで確かめた): 紹介文の題名・簡単な紹介と、ロアブックの項目ごとの題名・キーワード 1 語・内容
    loreTitle: 20, loreIntro: 50, itemTitle: 20, keyword: 20, itemContent: 500
  };
  /** zeta で足せる数 (ハッシュタグは 2026-11-02 に編集画面の「追加 7/10」で確かめた) */
  const MAX = { chars: 10, profiles: 5, lore: 5, introImages: 5, tags: 10, loreItems: 50, keywords: 5 };

  /** スタイルのタブの選び方 (zeta の画面の並び。single=1つ選ぶ、max=いくつまで選べるか) */
  const STYLE = [
    { label: 'プレイシステム', items: [
      { key: 'choices', label: 'ユーザーターンに選択肢を提供', type: 'toggle' },
      { key: 'bgInfo', label: '背景のインフォボックス', type: 'text' },
      { key: 'charInfo', label: 'キャラのインフォボックス', type: 'text' }] },
    { label: '進行方式', items: [
      { key: 'difficulty', label: '難易度', options: ['簡単', '普通', '難しい', '極限'] },
      { key: 'pace', label: '展開速度', options: ['速い', '自然', '遅い'] }] },
    { label: 'ストーリー演出', items: [
      { key: 'view', label: 'ナレーション視点', options: ['一人称', '二人称', '三人称'] },
      { key: 'tense', label: '時制', options: ['過去形', '現在形'] },
      { key: 'length', label: '応答の長さ', options: ['短い', '中間', '長い', '自動'] },
      { key: 'expr', label: '表現方式', options: ['会話多め', '基本', '行動多め'] },
      { key: 'mood', label: '雰囲気', max: 2, options: ['ロマンス', '癒し', 'シリアス', 'ヤンデレ', 'ファンタジー', 'アクション', 'ミステリー', 'ホラー'] },
      { key: 'writing', label: '文章スタイル', options: ['恋愛心理小説', 'ハードボイルド', '夜想文学', '温かな青春物語', 'アクション', '王道ファンタジー', 'ライトノベル', '心理ホラー', '設定しない'] }] }
  ];
  const STYLE_ITEMS = STYLE.flatMap((g) => g.items);

  /** プラグインの名前の候補 (zeta の画面の並び) */
  const PLUGINS = ['イベントカット', 'BGM', 'メッセージのやり取り', 'ダイスイベント', 'キャラクターの日記', 'ティアリスト', 'LIVEチャット欄',
    'エンディング', 'カレンダー・時計', 'クエスト', 'zetagram', '匿名掲示板', 'スマホをのぞく', '突発イベント', 'ゼタマンガ', 'ラブライン',
    'ドリームビュー', '幽霊のグループチャット'];

  /* ====================================================== 字数 */
  const nl = (s) => String(s || '').replace(/\r\n?/g, '\n');
  /** zeta の数え方に合わせて改行も1字 (編集画面の textarea の長さと同じ。絵文字などは2字になる) */
  const count = (s) => nl(s).length;
  const sum = (list, f) => list.reduce((n, x) => n + f(x), 0);
  const promptCount = (p) => count(p.description) + count(p.narrator) + sum(p.characters, (c) => count(c.name) + count(c.profile));
  const examplesCount = (p) => sum(p.examples, (e) => count(e.text));
  const introCount = (p) => sum(p.intro, (m) => (m.who === 'img' ? 0 : count(m.text)));
  /** 設定集のキーワードの欄を語に分ける(カンマ・読点・改行で区切る) */
  const keywordsOf = (t) => nl(t).split(/[,、，\n]/).map((x) => x.trim()).filter(Boolean);
  const aboutCount = (p) => sum(p.about, (b) => (b.kind === 'text' ? count(b.text) : 0))
    + sum(p.characters, (c) => count(p.aboutChars[c.id]));

  /* ====================================================== 形をそろえる */
  const s = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
  const ids = (v) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);

  function emptyStyle() {
    const st = { memo: '' };
    STYLE_ITEMS.forEach((it) => { st[it.key] = it.type === 'toggle' ? false : it.max ? [] : ''; });
    return st;
  }
  function emptyPlot() {
    const now = Date.now();
    return {
      id: U.uid(), title: '', description: '', narrator: '',
      characters: [],          // [{ id, name, profile, images: [画像id] }]
      profiles: [],            // トークプロフィール [{ id, name, summary, description, image }]
      examples: [],            // 状況例 [{ id, text }]
      lore: [],                // 設定集 [{ id, title, intro, items: [{ id, title, keywords, content }], memo(自分用の控え) }]
      style: emptyStyle(),
      plugins: [],             // [{ id, name, memo }]
      intro: [],               // [{ id, who: 'n'(ナレーター)|'u'(ユーザー)|キャラのid|'img', text, image }]
      cover: [],               // カバー画像のid (先頭がメイン)
      short: '', tags: [],
      aboutCustom: true,
      about: [],               // 紹介文の本文 [{ id, kind: 'text'|'image', text, image }]
      aboutChars: {},          // 紹介文のキャラごとの欄 { キャラのid: 文 }
      comment: '',
      publish: { open: false, comments: true },
      memo: '',
      history: [],             // 前の版 [{ at, kind, data }] (新しい順)
      createdAt: now, updatedAt: now
    };
  }
  /** 外部データ(バックアップ・前の版)を安全な形に揃える */
  function normalizePlot(raw) {
    const p = emptyPlot();
    raw = raw && typeof raw === 'object' ? raw : {};
    p.id = s(raw.id) || p.id;
    ['title', 'description', 'narrator', 'short', 'comment', 'memo'].forEach((k) => { p[k] = s(raw[k]); });
    p.characters = arr(raw.characters).map((c) => ({ id: s(c.id) || U.uid(), name: s(c.name), profile: s(c.profile), images: ids(c.images) }));
    p.profiles = arr(raw.profiles).map((x) => ({ id: s(x.id) || U.uid(), name: s(x.name), summary: s(x.summary), description: s(x.description), image: s(x.image) }));
    p.examples = arr(raw.examples).map((e) => ({ id: s(e.id) || U.uid(), text: s(e.text) }));
    // 2026-11-13 より前の設定集は { name, memo } だけ。名前は題名に、メモは自分用の控えに移す
    p.lore = arr(raw.lore).map((l) => ({
      id: s(l.id) || U.uid(), title: s(l.title !== undefined ? l.title : l.name), intro: s(l.intro),
      items: arr(l.items).map((x) => ({ id: s(x.id) || U.uid(), title: s(x.title), keywords: s(x.keywords), content: s(x.content) })),
      memo: s(l.memo)
    }));
    const st = raw.style && typeof raw.style === 'object' ? raw.style : {};
    STYLE_ITEMS.forEach((it) => {
      const v = st[it.key];
      if (it.type === 'toggle') p.style[it.key] = v === true;
      else if (it.max) p.style[it.key] = ids(v).filter((x) => it.options.includes(x)).slice(0, it.max);
      else p.style[it.key] = s(v);
    });
    p.style.memo = s(st.memo);
    p.plugins = arr(raw.plugins).map((g) => ({ id: s(g.id) || U.uid(), name: s(g.name), memo: s(g.memo) }));
    p.intro = arr(raw.intro).map((m) => ({ id: s(m.id) || U.uid(), who: s(m.who) || 'n', text: s(m.text), image: s(m.image) }))
      .filter((m) => (m.who === 'img' ? m.image : true));
    p.cover = ids(raw.cover);
    p.tags = ids(raw.tags);
    p.aboutCustom = raw.aboutCustom !== false;
    p.about = arr(raw.about).map((b) => ({ id: s(b.id) || U.uid(), kind: b.kind === 'image' ? 'image' : 'text', text: s(b.text), image: s(b.image) }))
      .filter((b) => (b.kind === 'image' ? b.image : true));
    const ac = raw.aboutChars && typeof raw.aboutChars === 'object' ? raw.aboutChars : {};
    p.characters.forEach((c) => { if (ac[c.id]) p.aboutChars[c.id] = s(ac[c.id]); });
    const pub = raw.publish && typeof raw.publish === 'object' ? raw.publish : {};
    p.publish = { open: pub.open === true, comments: pub.comments !== false };
    p.history = arr(raw.history).filter((v) => v.data && typeof v.data === 'object')
      .map((v) => ({ at: Number.isFinite(v.at) ? v.at : 0, kind: s(v.kind), data: dataOf(normalizePlot(v.data)) })).slice(0, HISTORY);
    p.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : p.createdAt;
    p.updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : p.updatedAt;
    return p;
  }
  /** 前の版に残す中身 (id・日時・前の版そのものは除く) */
  function dataOf(p) {
    const { id, history, createdAt, updatedAt, ...rest } = p;
    return JSON.parse(JSON.stringify(rest));
  }
  /** 使っている画像のid */
  function imageIds(d, out) {
    out = out || new Set();
    d.cover.forEach((x) => out.add(x));
    d.characters.forEach((c) => c.images.forEach((x) => out.add(x)));
    d.profiles.forEach((x) => { if (x.image) out.add(x.image); });
    d.intro.forEach((m) => { if (m.image) out.add(m.image); });
    d.about.forEach((b) => { if (b.image) out.add(b.image); });
    return out;
  }
  const allImageIds = (p) => { const out = imageIds(p); p.history.forEach((v) => imageIds(v.data, out)); return out; };

  /* ====================================================== IndexedDB */
  let dbPromise;
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB非対応'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('plots')) db.createObjectStore('plots', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  function tx(store, mode, fn) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  /* ====================================================== プロット */
  let plots = [];
  let loadError = null;

  async function load() {
    try {
      const rows = await tx('plots', 'readonly', (st) => st.getAll());
      plots = (rows || []).map(normalizePlot);
    } catch (e) {
      console.error('読み込みに失敗しました', e);
      loadError = e;
    }
  }
  const all = () => [...plots].sort((a, b) => b.updatedAt - a.updatedAt);
  const get = (id) => plots.find((p) => p.id === id) || null;

  function write(p) {
    return tx('plots', 'readwrite', (st) => st.put(JSON.parse(JSON.stringify(p)))).then(() => { askPersist(); return true; }, (e) => {
      console.error(e);
      U.toast('保存できませんでした(ブラウザの保存容量/設定をご確認ください)', 'error');
      return false;
    });
  }
  function create() {
    const p = emptyPlot();
    plots.push(p);
    write(p);
    return p;
  }
  async function remove(id) {
    plots = plots.filter((p) => p.id !== id);
    await tx('plots', 'readwrite', (st) => st.delete(id)).catch(() => {});
    await gcImages();
  }

  // 書き込みは打つたびにせず、少し待ってまとめる。開いてから最初に書き換える前の中身を、前の版に残す
  const pending = new Set();
  const baseline = new Map();   // プロットのid → 開いたときの中身
  let timer = 0;
  function flush() {
    clearTimeout(timer);
    const list = [...pending];
    pending.clear();
    return Promise.all(list.map(write));
  }
  /** プロットを開いたときに呼ぶ (その時点の中身を覚えておく) */
  function opened(p) { baseline.set(p.id, dataOf(p)); }
  /** 書き換えたあとに呼ぶ */
  function touch(p) {
    const base = baseline.get(p.id);
    if (base) {
      baseline.delete(p.id);
      keepData(p, base, 'open');
    }
    p.updatedAt = Date.now();
    pending.add(p);
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  /* ====================================================== 前の版 */
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function keepData(p, data, kind) {
    if (p.history[0] && same(p.history[0].data, data)) return false;
    p.history = [{ at: Date.now(), kind, data }, ...p.history].slice(0, HISTORY);
    return true;
  }
  /** いまの中身を前の版に残す。kind: manual=自分で残した / open=開いて書き換える前 / restore=前の版に戻す前 */
  const keep = (p, kind) => keepData(p, dataOf(p), kind);
  function restore(p, v) {
    keep(p, 'restore');
    const fresh = normalizePlot({ ...v.data, id: p.id, createdAt: p.createdAt });
    Object.keys(fresh).forEach((k) => { if (k !== 'history') p[k] = fresh[k]; });
    touch(p);
  }
  function dropVersion(p, v) {
    p.history = p.history.filter((x) => x !== v);
    touch(p);
    gcImages();
  }

  /**
   * 見比べ・検索に使う、欄ごとの文 [{ key, label, text }]。
   * 名前の付いた欄は id を key にして、並べ替えても同じ欄どうしで比べる
   */
  function fields(d) {
    const out = [];
    const add = (key, label, text) => out.push({ key, label, text: s(text) });
    const charName = (id) => { const c = d.characters.find((x) => x.id === id); return c ? c.name || 'キャラ' : '消したキャラ'; };
    add('title', '題名', d.title);
    add('description', '説明', d.description);
    add('narrator', 'ナレーター', d.narrator);
    d.characters.forEach((c, i) => {
      add(`c:${c.id}:name`, `キャラ${i + 1}の名前`, c.name);
      add(`c:${c.id}:profile`, `キャラ「${c.name || i + 1}」のプロフィール`, c.profile);
    });
    d.profiles.forEach((x, i) => {
      const n = `トークプロフィール「${x.name || i + 1}」`;
      add(`p:${x.id}:name`, `トークプロフィール${i + 1}の名前`, x.name);
      add(`p:${x.id}:summary`, `${n}の簡単な紹介`, x.summary);
      add(`p:${x.id}:description`, `${n}の説明`, x.description);
    });
    d.examples.forEach((e, i) => add(`e:${e.id}`, `状況例${i + 1}`, e.text));
    d.lore.forEach((l, i) => {
      const n = `設定集「${l.title || i + 1}」`;
      add(`l:${l.id}:title`, `設定集${i + 1}の題名`, l.title);
      add(`l:${l.id}:intro`, `${n}の簡単な紹介`, l.intro);
      l.items.forEach((x, j) => add(`l:${l.id}:i:${x.id}`, `${n}の項目「${x.title || j + 1}」`, [x.title, x.keywords, x.content].filter(Boolean).join('\n')));
      add(`l:${l.id}:memo`, `${n}の控え`, l.memo);
    });
    add('style', 'スタイル', styleText(d.style));
    d.plugins.forEach((g, i) => add(`g:${g.id}`, `プラグイン「${g.name || i + 1}」`, [g.name, g.memo].filter(Boolean).join('\n')));
    add('intro', 'イントロ', d.intro.map((m) => (m.who === 'img' ? '[画像]'
      : `${m.who === 'n' ? 'ナレーター' : m.who === 'u' ? '{{user}}' : charName(m.who)}: ${m.text}`)).join('\n'));
    add('short', '簡単な紹介', d.short);
    add('tags', 'ハッシュタグ', d.tags.map((t) => '#' + t).join(' '));
    d.about.forEach((b, i) => add(`a:${b.id}`, `紹介文${i + 1}`, b.kind === 'image' ? '[画像]' : b.text));
    d.characters.forEach((c) => add(`ac:${c.id}`, `紹介文「${c.name || 'キャラ'}」の欄`, d.aboutChars[c.id]));
    add('comment', 'クリエイターコメント', d.comment);
    add('publish', '設定', `公開: ${d.publish.open ? 'する' : 'しない'}\nコメント: ${d.publish.comments ? '許可' : '許可しない'}`);
    add('memo', '自分用のメモ', d.memo);
    return out;
  }
  function styleText(st) {
    const lines = STYLE_ITEMS.map((it) => {
      const v = st[it.key];
      if (it.type === 'toggle') return v ? it.label : '';
      const t = Array.isArray(v) ? v.join('・') : v;
      return t ? `${it.label}: ${t}` : '';
    }).filter(Boolean);
    if (st.memo) lines.push(st.memo);
    return lines.join('\n');
  }

  /* ====================================================== 消されにくくする・バックアップの日時 */
  let persistAsked = null;
  function askPersist() {
    const st = navigator.storage;
    if (!st || !st.persist || !st.persisted) return Promise.resolve(null);
    if (!persistAsked) persistAsked = st.persisted().then((p) => p || st.persist()).catch(() => null);
    return persistAsked;
  }
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
    if (!plots.length) return false;
    const now = Date.now(), last = backupAt();
    if (now - readTime(BACKUP_SNOOZE_KEY) < 7 * DAY) return false;
    if (!plots.some((p) => p.updatedAt > last)) return false;
    const since = last || Math.min(...plots.map((p) => p.createdAt));
    return now - since >= 14 * DAY;
  }

  /* ====================================================== 画像 */
  const urlCache = new Map();
  const forget = (id) => { if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); } };
  const Images = {
    put: (id, blob) => { forget(id); return tx('images', 'readwrite', (st) => st.put(blob, id)); },
    blob: (id) => tx('images', 'readonly', (st) => st.get(id)).then((b) => b || null),
    async url(id) {
      if (!id) return null;
      if (urlCache.has(id)) return urlCache.get(id);
      const b = await Images.blob(id).catch(() => null);
      if (!b) return null;
      const url = URL.createObjectURL(b);
      urlCache.set(id, url);
      return url;
    },
    remove: (id) => { forget(id); return tx('images', 'readwrite', (st) => st.delete(id)); },
    /** 画像ファイルを保存用の Blob にする。5MB までの画像はそのまま、それより大きい画像は長辺2400pxのWebPに縮める */
    async fromFile(file) {
      if (!file || !/^image\//.test(file.type)) throw new Error('画像ファイルではありません');
      if (file.size <= KEEP_ORIGINAL && /^image\/(png|jpeg|webp|gif)$/.test(file.type)) return file;
      const bmp = await loadBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const hh = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = hh;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, hh);
      if (bmp.close) bmp.close();
      return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できません'))), 'image/webp', 0.9);
      });
    },
    /** ファイルを保存して、新しい画像のidを返す */
    async add(file) {
      const blob = await Images.fromFile(file);
      const id = U.uid();
      await Images.put(id, blob);
      return id;
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
  /** どのプロット・前の版からも使われていない画像を消す */
  async function gcImages() {
    const used = new Set();
    plots.forEach((p) => allImageIds(p).forEach((x) => used.add(x)));
    const keys = await tx('images', 'readonly', (st) => st.getAllKeys()).catch(() => []);
    await Promise.all((keys || []).filter((k) => !used.has(k)).map((k) => Images.remove(k).catch(() => {})));
  }
  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const dataUrlToBlob = (dataUrl) => fetch(dataUrl).then((r) => r.blob());

  /* ====================================================== バックアップ */
  /** list = 書き出すプロット (省くと全部) */
  async function exportBackup(list) {
    await flush();
    list = list || plots;
    const want = new Set();
    list.forEach((p) => allImageIds(p).forEach((x) => want.add(x)));
    const images = [];
    for (const id of want) {
      const blob = await Images.blob(id).catch(() => null);
      if (blob) images.push({ id, dataUrl: await blobToDataUrl(blob) });
    }
    return JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), plots: list, images });
  }
  function markBackup() {
    writeTime(BACKUP_AT_KEY);
    askPersist();
  }
  /**
   * バックアップを読んで、未登録のプロット(add)・ファイルの方が新しい登録済みのプロット(newer)・
   * それ以外の登録済みのプロットの数(same) に分ける。まだ何も書き換えない
   */
  function readBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('ファイルを読み取れませんでした。復元用のJSONファイルを選んでください。'); }
    if (!data || data.app !== BACKUP_APP || !Array.isArray(data.plots)) {
      throw new Error('charplotのバックアップファイルではないようです。');
    }
    const seen = new Set();
    const add = [], newer = [];
    let sameN = 0;
    data.plots.forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const p = normalizePlot(raw);
      if (seen.has(p.id)) return;
      seen.add(p.id);
      const cur = get(p.id);
      if (!cur) add.push(p);
      else if (p.updatedAt > cur.updatedAt) newer.push(p);
      else sameN++;
    });
    const images = new Map((Array.isArray(data.images) ? data.images : [])
      .filter((i) => i && typeof i.id === 'string' && typeof i.dataUrl === 'string' && i.dataUrl.startsWith('data:image/')).map((i) => [i.id, i.dataUrl]));
    return { add, newer, same: sameN, images };
  }
  /** readBackup の結果を取り込む。replace=true なら newer のプロットをファイルの中身に置き換える */
  async function applyBackup(plan, replace) {
    await flush();
    const take = [...plan.add, ...(replace ? plan.newer : [])];
    // ファイルに入っている画像を書き込む。ファイルに無い画像は、端末に残っていればそのまま使える
    const want = new Set();
    take.forEach((p) => allImageIds(p).forEach((x) => want.add(x)));
    for (const id of want) {
      const dataUrl = plan.images.get(id);
      if (dataUrl) { try { await Images.put(id, await dataUrlToBlob(dataUrl)); } catch (e) { /* 画像だけ諦める */ } }
    }
    for (const p of take) {
      const i = plots.findIndex((x) => x.id === p.id);
      if (i >= 0) plots[i] = p; else plots.push(p);
      baseline.delete(p.id);
      await write(p);
    }
    if (replace && plan.newer.length) await gcImages();
    return { added: plan.add.length, replaced: replace ? plan.newer.length : 0, kept: plan.same + (replace ? 0 : plan.newer.length) };
  }

  window.Store = {
    LIMIT, MAX, STYLE, STYLE_ITEMS, PLUGINS, HISTORY,
    count, promptCount, examplesCount, introCount, aboutCount, keywordsOf,
    load, loadError: () => loadError, all, get, create, remove, touch, opened, flush,
    keep, restore, dropVersion, fields, styleText, gcImages,
    askPersist, persisted, backupAt, backupDue, snoozeBackup: () => writeTime(BACKUP_SNOOZE_KEY),
    exportBackup, markBackup, readBackup, applyBackup
  };
  window.Images = Images;
})();
