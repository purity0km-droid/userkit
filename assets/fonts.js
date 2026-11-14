/* userkit 共通: 書体(フォント)の選び方と読み込み(usermix のジャケットが使う)。書体の id は次の 3 種類:
   'noto' など = おすすめ(CURATED)。ふつうは Google Fonts で、使う太さの CSS を <link> で読み、使う字の分だけ document.fonts.load で待つ。
                 file のある物は assets/fonts/ に同梱した書体(配布条件で再配布を認めている物だけ。ファイルも説明書きも手を加えずに置く)
   'local:名前' = 端末に入っているフォントの名前。入っていなければ代わりの書体になる(Safari などは端末に足したフォントを使わせない)
   'file:キー'  = 利用者が選んだフォントファイル。この端末の IndexedDB(userkit-editor の userkit-fonts・userkit-font:キー)にだけ置く。
                  リポジトリにもサーバーにも置かない(再配布を禁じる規約の書体があるため。同梱はユーザーが決めた物だけ)
   画像の書き出し(html-to-image)は skipFonts のままにして、使う書体の @font-face だけを embedCss で作り fontEmbedCSS に渡す。
   Google Fonts は使う字が入った分割ファイルだけを埋め込む(全部を埋め込むと重い)。字そのものは Google に送らない(text= は使わない) */
(function () {
  'use strict';

  const CURATED = [
    { id: 'noto', family: 'Noto Sans JP', label: 'Noto Sans JP', mood: '標準', weights: [400, 500, 700, 900] },
    { id: 'zen-kaku', family: 'Zen Kaku Gothic New', label: 'Zen 角ゴシック New', mood: '素直なゴシック', weights: [300, 400, 500, 700, 900] },
    { id: 'mplus-rounded', family: 'M PLUS Rounded 1c', label: 'M PLUS Rounded 1c', mood: '丸ゴシック・かわいい', weights: [100, 300, 400, 500, 700, 800, 900] },
    { id: 'kiwi-maru', family: 'Kiwi Maru', label: 'キウイ丸', mood: '手書き寄り・甘い', weights: [300, 400, 500] },
    { id: 'shippori-b1', family: 'Shippori Mincho B1', label: 'しっぽり明朝 B1', mood: '静かな明朝・品', weights: [400, 500, 600, 700, 800], serif: true },
    { id: 'zen-old-mincho', family: 'Zen Old Mincho', label: 'Zen オールド明朝', mood: '重い明朝・耽美', weights: [400, 500, 600, 700, 900], serif: true },
    { id: 'kaisei-decol', family: 'Kaisei Decol', label: '解星デコール', mood: '装飾明朝・昭和レトロ', weights: [400, 500, 700], serif: true },
    { id: 'cinzel', family: 'Cinzel', label: 'Cinzel', mood: '碑文のセリフ・荘厳(英字だけ)', weights: [400, 500, 600, 700, 800, 900], serif: true, latin: true },
    { id: 'italiana', family: 'Italiana', label: 'Italiana', mood: '夢見るセリフ・レトロ(英字だけ)', weights: [400], serif: true, latin: true },
    // 同梱(chiphead 氏。ひらがなのデザインは雑念の塊氏。配布条件は fonts/cinecaption/cinecaption2.26.txt。2026-11-14 ユーザー決定)
    { id: 'cinecaption', family: 'ukb-cinecaption', label: 'しねきゃぷしょん', mood: '映画字幕風（同梱）', weights: [400], file: 'fonts/cinecaption/cinecaption226.ttf', type: 'font/ttf',
      noVert: true, credit: 'しねきゃぷしょん: chiphead（ひらがなのデザインは雑念の塊）' }
  ];
  /* 字幕用(usermovie)。ジャケットの一覧(CURATED)には出さない。どれも Google Fonts で SIL Open Font License 1.1
     (2026-11-14 に google/fonts の METADATA.pb で確認。作った画像に OFL はかからず、名前の表示も要らない) */
  const MORE = [
    { id: 'biz-udp', family: 'BIZ UDPGothic', label: 'BIZ UDPゴシック', mood: '読みやすい UD 書体', weights: [400, 700] },
    { id: 'arimo', family: 'Arimo', label: 'Arimo', mood: '定番の字幕（Arial と同じ字幅）', weights: [400, 500, 600, 700], latin: true },
    { id: 'inter', family: 'Inter', label: 'Inter', mood: '今どきのサンセリフ', weights: [400, 500, 600, 700, 800], latin: true },
    { id: 'atkinson', family: 'Atkinson Hyperlegible Next', label: 'Atkinson Hyperlegible', mood: '見分けやすさ重視', weights: [400, 500, 600, 700, 800], latin: true },
    { id: 'jost', family: 'Jost', label: 'Jost', mood: '幾何学的なサンセリフ', weights: [400, 500, 600, 700], latin: true },
    { id: 'eb-garamond', family: 'EB Garamond', label: 'EB Garamond', mood: 'クラシックなセリフ', weights: [400, 500, 600, 700, 800], serif: true, latin: true },
    { id: 'courier-prime', family: 'Courier Prime', label: 'Courier Prime', mood: 'タイプライター', weights: [400, 700], latin: true }
  ];
  /* 縦書き用の字形(vert)がない書体では、縦書きで位置や向きが変わる字(句読点・かっこ・長音・小さい仮名)を端末の書体に任せる。
     ファイルには手を加えず、縦書き用の別の名前(family + '-v')を、その字を外した unicode-range で登録する */
  const VERT_CHARS = '、。，．､｡「」『』（）［］｛｝〔〕【】〈〉《》〘〙〚〛ー－〜～…‥―＝：；ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ';
  const VERT_RANGE = (() => {
    const cps = [...new Set(Array.from(VERT_CHARS).map((c) => c.codePointAt(0)))].sort((a, b) => a - b), out = [];
    let from = 0;
    const hex = (n) => n.toString(16).toUpperCase();
    for (const c of cps) { if (c > from) out.push(from === c - 1 ? `U+${hex(from)}` : `U+${hex(from)}-${hex(c - 1)}`); from = c + 1; }
    out.push(`U+${hex(from)}-10FFFF`);
    return out.join(', ');
  })();
  const BASE = new URL('.', document.currentScript ? document.currentScript.src : location.href).href;   // assets/ の場所
  const ALL_W = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const SANS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo", sans-serif';
  const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif';
  const store = U.kv('userkit-editor');
  const INDEX = 'userkit-fonts';

  const nearest = (ws, w) => ws.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
  const quote = (f) => `"${String(f).replace(/["\\]/g, '')}"`;

  /* ---------------------------------------------------------------- フォントファイル(この端末だけ) */
  let index = null;   // { キー: { name, type, size, added } }
  const faces = new Map();   // キー → Promise<FontFace|null>
  async function fileIndex() {
    if (!index) { try { index = (await store.get(INDEX)) || {}; } catch (e) { index = {}; } }
    return index;
  }
  const famOf = (key) => 'ukf-' + key;
  const typeOf = (name) => { const e = (/\.(\w+)$/.exec(name || '') || [])[1]; return { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[String(e).toLowerCase()] || ''; };
  /** 登録したフォントファイルを document に足す(初めて使うときに 1 回) */
  function ensureFile(key) {
    if (!faces.has(key)) {
      faces.set(key, (async () => {
        const data = await store.get('userkit-font:' + key).catch(() => null);
        if (!data) return null;
        const face = new FontFace(famOf(key), data, { weight: '1 1000' });
        await face.load();
        document.fonts.add(face);
        return face;
      })().catch(() => null));
    }
    return faces.get(key);
  }
  /** 同梱の書体を document に足す(初めて使うときに 1 回。太さは 1 つなので、どの太さでも同じ字形にする) */
  const bundled = new Map();
  function ensureBundled(f) {
    if (!bundled.has(f.id)) {
      bundled.set(f.id, (async () => {
        const face = new FontFace(f.family, `url(${BASE + f.file})`, { weight: '1 1000' });
        await face.load();
        document.fonts.add(face);
        if (f.noVert) {
          const v = new FontFace(f.family + '-v', `url(${BASE + f.file})`, { weight: '1 1000', unicodeRange: VERT_RANGE });
          await v.load();
          document.fonts.add(v);
        }
        return face;
      })().catch(() => { bundled.delete(f.id); return null; }));
    }
    return bundled.get(f.id);
  }
  /** フォントファイルを登録する。読めなければ例外 */
  async function addFile(file) {
    const type = typeOf(file.name);
    if (!type) throw new Error('.ttf・.otf・.woff・.woff2 のファイルを選んでください');
    const data = await file.arrayBuffer();
    try { await new FontFace('ukf-test', data).load(); } catch (e) { throw new Error('フォントとして読めませんでした'); }
    const key = U.uid(), ix = await fileIndex();
    await store.set('userkit-font:' + key, data);
    ix[key] = { name: file.name.replace(/\.\w+$/, ''), type, size: data.byteLength, added: Date.now() };
    await store.set(INDEX, ix);
    return 'file:' + key;
  }
  async function removeFile(key) {
    const ix = await fileIndex();
    delete ix[key];
    await store.set(INDEX, ix);
    await store.del('userkit-font:' + key).catch(() => {});
    const f = await (faces.get(key) || Promise.resolve(null));
    if (f) document.fonts.delete(f);
    faces.delete(key);
    css.delete('file:' + key);
  }
  async function listFiles() {
    const ix = await fileIndex();
    return Object.entries(ix).map(([key, v]) => Object.assign({ key, id: 'file:' + key }, v)).sort((a, b) => a.added - b.added);
  }

  /* ---------------------------------------------------------------- 書体の情報 */
  /** id → { id, kind(gf|local|file), family, label, mood, weights, serif } */
  function info(id) {
    id = String(id || 'noto');
    if (id.startsWith('local:')) { const name = id.slice(6).trim(); return { id, kind: 'local', family: name, label: name, mood: '端末のフォント', weights: ALL_W }; }
    if (id.startsWith('file:')) {
      const key = id.slice(5), v = index && index[key];
      return { id, kind: 'file', key, family: famOf(key), label: v ? v.name : '読み込んだフォント', mood: 'フォントファイル', weights: ALL_W, missing: !!index && !v };
    }
    const c = CURATED.find((x) => x.id === id) || MORE.find((x) => x.id === id) || CURATED[0];
    return Object.assign({ kind: c.file ? 'bundled' : 'gf' }, c);
  }
  /** CSS の font-family(使えない字は端末の書体で出す)。vertical = 縦書きの所に使う(縦書き用の字形がない書体は '-v' の名前) */
  const stack = (id, vertical) => { const f = info(id); return `${quote(f.family + (vertical && f.noVert ? '-v' : ''))}, ${f.serif ? SERIF : SANS}`; };

  /** 端末に入っているか(幅を測って、代わりの書体と同じなら無いとみなす) */
  function hasLocal(name) {
    const g = document.createElement('canvas').getContext('2d'), s = 'あいう永字ABCabc0123';
    return ['monospace', 'serif', 'sans-serif'].some((base) => {
      g.font = `40px ${base}`;
      const w0 = g.measureText(s).width;
      g.font = `40px ${quote(name)}, ${base}`;
      return g.measureText(s).width !== w0;
    });
  }

  /* ---------------------------------------------------------------- 読み込み */
  const cssUrl = (family, w) => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${w}&display=swap`;
  const linked = new Map();
  function link(url) {
    if (!linked.has(url)) {
      linked.set(url, new Promise((res, rej) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = url;
        l.onload = () => res(); l.onerror = () => { linked.delete(url); rej(new Error('書体を読み込めませんでした')); };
        document.head.append(l);
      }));
    }
    return linked.get(url);
  }
  /**
   * 書体を使える状態にする。ws = 使う太さの配列、text = 使う字。
   * 返り値 { ok, why, hint }。ok が false なら代わりの書体で出ている(why に理由、hint にすること。どちらも句点なし)
   */
  async function load(id, ws, text) {
    const f = info(id), sample = text || 'あA';
    if (f.kind === 'local') return hasLocal(f.family) ? { ok: true } : { ok: false, why: `この端末に「${f.family}」が見つかりません` };
    if (f.kind === 'file') {
      await fileIndex();
      const face = await ensureFile(f.key);
      return face ? { ok: true } : { ok: false, why: 'このブラウザに、選んだフォントファイルがありません' };
    }
    if (f.kind === 'bundled') {
      const face = await ensureBundled(f);
      return face ? { ok: true } : { ok: false, why: '書体を読み込めませんでした', hint: '通信できる状態でお試しください' };
    }
    const wl = [...new Set(ws.map((w) => nearest(f.weights, w)))];
    try {
      await Promise.all(wl.map((w) => link(cssUrl(f.family, w))));
      await Promise.all(wl.map((w) => document.fonts.load(`${w} 40px ${quote(f.family)}`, sample)));
    } catch (e) { return { ok: false, why: '書体を読み込めませんでした', hint: '通信できる状態でお試しください' }; }
    const ok = wl.every((w) => document.fonts.check(`${w} 40px ${quote(f.family)}`, sample));
    return ok ? { ok: true } : { ok: false, why: '書体を読み込めませんでした', hint: '通信できる状態でお試しください' };
  }

  /* ---------------------------------------------------------------- 書き出し用の @font-face */
  const css = new Map(), blobs = new Map();
  const toDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  async function fetchText(url) {
    if (!css.has(url)) css.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.text(); }).catch((e) => { css.delete(url); throw e; }));
    return css.get(url);
  }
  async function fetchData(url) {
    if (!blobs.has(url)) blobs.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(); return r.blob(); }).then(toDataUrl).catch((e) => { blobs.delete(url); throw e; }));
    return blobs.get(url);
  }
  /** unicode-range が text の字を 1 つでも含むか(範囲がなければ含む) */
  function covers(block, cps) {
    const m = /unicode-range:\s*([^;}]+)/.exec(block);
    if (!m) return true;
    const ranges = m[1].split(',').map((r) => { const [a, b] = r.trim().replace(/^U\+/i, '').split('-'); return [parseInt(a, 16), parseInt(b || a, 16)]; });
    return cps.some((c) => ranges.some(([a, b]) => c >= a && c <= b));
  }
  /**
   * 書き出しで埋め込む @font-face の CSS(url は data: にしてある)。端末のフォントは埋め込まない('')。vertical = 縦書きの所がある
   * 読めなければ例外(黙って代わりの書体で書き出さないため)
   */
  async function embedCss(id, ws, text, vertical) {
    const f = info(id);
    if (f.kind === 'local') return '';
    if (f.kind === 'file') {
      await fileIndex();
      const v = index[f.key];
      if (!v) throw new Error('選んだフォントファイルがこのブラウザにありません');
      if (!css.has(id)) {
        css.set(id, store.get('userkit-font:' + f.key).then((data) => {
          if (!data) throw new Error('選んだフォントファイルがこのブラウザにありません');
          return toDataUrl(new Blob([data], { type: v.type }));
        }).then((url) => `@font-face { font-family: ${quote(f.family)}; src: url(${url}); font-weight: 1 1000; }`).catch((e) => { css.delete(id); throw e; }));
      }
      return css.get(id);
    }
    if (f.kind === 'bundled') {
      const url = await fetchData(BASE + f.file);   // 手を加えずに丸ごと埋め込む(字を間引くのも改造に当たりうるため)
      const face = (fam, range) => `@font-face { font-family: ${quote(fam)}; src: url(${url}); font-weight: 1 1000;${range ? ` unicode-range: ${range};` : ''} }`;
      return face(f.family) + (f.noVert && vertical ? '\n' + face(f.family + '-v', VERT_RANGE) : '');
    }
    const cps = [...new Set(Array.from(text || ''))].map((c) => c.codePointAt(0));
    const out = [];
    for (const w of [...new Set(ws.map((x) => nearest(f.weights, x)))]) {
      const src = await fetchText(cssUrl(f.family, w));
      for (const block of src.match(/@font-face\s*{[^}]*}/g) || []) {
        if (!covers(block, cps)) continue;
        const um = /url\((['"]?)([^)'"]+)\1\)/.exec(block);
        if (!um) continue;
        out.push(block.replace(um[0], `url(${await fetchData(um[2])})`));
      }
    }
    return out.join('\n');
  }

  window.KitFonts = { CURATED, MORE, info, stack, nearest, hasLocal, load, embedCss, files: { list: listFiles, add: addFile, remove: removeFile, index: fileIndex } };
})();
