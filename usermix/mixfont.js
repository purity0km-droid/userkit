/* usermix の書体(プレイリストと再生画面。ジャケットの書体は jacket.js が曲ごとに持つ)。
   英字(state.font.en)と和文(state.font.ja)を別々に選び、シートの --sans を「英字, 和文, 端末の和文, 総称」の順に並べる。
   'ios'    = iPhone 風。iPhone・Mac は本物のシステムフォント(英字 SF Pro = -apple-system、和文ヒラギノ角ゴ)、
              ほかの端末は似た Google Fonts(英字 Inter、和文 Noto Sans JP)。
              Apple の端末でも、和文に Google Fonts の書体を選んだときの英字は Inter(-apple-system を先に置くと、和文までシステムの書体で出るおそれがあるため)。
   'same'   = 英字も和文の書体で出す。'system' = 端末の書体(前の既定。iPhone・Mac はヒラギノ角ゴ、Windows は游ゴシック)。
   書き出し(画像・動画)では、Google Fonts の書体のうち使う字が入った分割ファイルだけを fontEmbedCSS に入れる(KitFonts.embedCss)。
   読めないときは保存をやめる(黙って代わりの書体で保存しない。ジャケットと同じ)。usermix.js から UmFont.* で使う */
(function () {
  'use strict';
  const { h } = U;

  const EN = ['ios', 'same', 'inter', 'dm-sans', 'manrope', 'plus-jakarta', 'outfit', 'poppins', 'montserrat', 'jost', 'space-grotesk', 'nunito',
    'playfair', 'cormorant', 'eb-garamond', 'fraunces', 'courier-prime'];
  const JA = ['ios', 'system', 'noto', 'line-seed', 'zen-kaku', 'ibm-plex-jp', 'biz-udp', 'mplus2', 'zen-maru', 'mplus-rounded', 'kiwi-maru',
    'shippori-b1', 'zen-old-mincho', 'kaisei-decol'];
  const APPLE = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
  const SYS_SANS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo"';
  const SYS_SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho"';
  const APPLE_EN = '-apple-system, BlinkMacSystemFont';
  const APPLE_JA = '"Hiragino Sans", "Hiragino Kaku Gothic ProN"';
  const WEIGHTS = [400, 500, 700, 800];   // usermix.css で使う太さ
  const q = (f) => `"${String(f).replace(/["\\]/g, '')}"`;

  /** 保存した font を形をそろえて返す(知らない id は iPhone 風) */
  function normalize(x) {
    const o = Object.assign({ en: 'ios', ja: 'ios' }, x && typeof x === 'object' ? x : {});
    if (!EN.includes(o.en)) o.en = 'ios';
    if (!JA.includes(o.ja)) o.ja = 'ios';
    return { en: o.en, ja: o.ja };
  }
  /** 和文・英字の 1 つを { id(KitFonts の id。読み込む物) | css(端末の書体の名前) } にする */
  function jaPart(ja) {
    if (ja === 'ios') return APPLE ? { css: APPLE_JA } : { id: 'noto' };
    if (ja === 'system') return { css: SYS_SANS };
    return { id: ja };
  }
  function enPart(en, ja) {
    if (en === 'same') return null;
    if (en === 'ios') return APPLE && !jaPart(ja).id ? { css: APPLE_EN } : { id: 'inter' };
    return { id: en };
  }
  const cssOf = (p) => (p.id ? q(KitFonts.info(p.id).family) : p.css);
  /** 書体の組み → { stack(CSS の font-family), ids(読み込む KitFonts の id) } */
  function plan(font) {
    const f = normalize(font), ja = jaPart(f.ja), en = enPart(f.en, f.ja);
    const serif = !!(ja.id && KitFonts.info(ja.id).serif);
    const parts = [en && cssOf(en), cssOf(ja), serif ? SYS_SERIF : SYS_SANS, serif ? 'serif' : 'sans-serif'].filter(Boolean);
    const ids = [...new Set([en, ja].filter((p) => p && p.id).map((p) => p.id))];
    return { stack: parts.join(', '), ids };
  }

  /** 名前と説明(書体を選ぶ画面・ツールバー) */
  function labelOf(axis, id) {
    if (axis === 'en' && id === 'ios') return { label: 'iPhone 風', mood: APPLE ? 'SF Pro（この端末のシステムフォント）' : 'SF Pro に似た Inter で表示' };
    if (axis === 'en' && id === 'same') return { label: '和文と同じ', mood: '英字も和文の書体で出す' };
    if (axis === 'ja' && id === 'ios') return { label: 'iPhone 風', mood: APPLE ? 'ヒラギノ角ゴ（この端末の書体）' : 'ヒラギノ角ゴに似た Noto Sans JP で表示' };
    if (axis === 'ja' && id === 'system') return { label: '端末の書体', mood: 'iPhone はヒラギノ角ゴ、Windows は游ゴシック' };
    const f = KitFonts.info(id);
    return { label: f.label, mood: f.mood };
  }
  /** ツールバーに出す短い名前 */
  function shortLabel(font) {
    const f = normalize(font);
    if (f.en === 'ios' && f.ja === 'ios') return 'iPhone 風';
    const ja = labelOf('ja', f.ja).label;
    return f.en === 'same' ? ja : `${labelOf('en', f.en).label}・${ja}`;
  }

  /** 画面に出すための読み込み(待たなくてよい。読めなければ代わりの書体のまま) */
  function ensure(node, font) {
    const { ids } = plan(font), txt = (node && node.textContent) || 'あA';
    return Promise.all(ids.map((id) => KitFonts.load(id, WEIGHTS, txt).catch(() => ({ ok: false }))));
  }

  /** シートの字を、書体の太さ(書体ごとに使える太さへ丸める前)ごとに集める。動画の再生位置の数字も足す */
  function textByWeight(node) {
    const map = new Map(), walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!el || !t.data.trim() || el.closest('.ed-ui')) continue;
      const w = Math.round((parseInt(getComputedStyle(el).fontWeight, 10) || 400) / 100) * 100;
      map.set(w, (map.get(w) || '') + t.data);
    }
    for (const [w, s] of map) map.set(w, s + '0123456789:');
    return map;
  }
  /**
   * 書き出しの設定 { fontEmbedCSS }(Google Fonts の書体を使わなければ {})。読めなければ例外(e.why に理由)。
   * node は書き出す形(縮小なし・.exporting)にしたシート
   */
  async function exportOptions(node, font) {
    const { ids } = plan(font);
    if (!ids.length) return {};
    const stop = (why, hint) => Object.assign(new Error(`${why}。代わりの書体のまま保存しないよう、保存をやめました${hint ? '。' + hint : ''}`), { why });
    const byW = textByWeight(node), out = [];
    for (const id of ids) {
      const ws = KitFonts.info(id).weights, group = new Map();   // 書体の太さ → 字
      for (const [w, s] of byW) { const n = KitFonts.nearest(ws, w); group.set(n, (group.get(n) || '') + s); }
      for (const [w, s] of group) {
        const r = await KitFonts.load(id, [w], s);
        if (!r.ok) throw stop(r.why, r.hint);
        try { out.push(await KitFonts.embedCss(id, [w], s)); } catch (e) { throw stop('書体を画像に入れられませんでした', '通信できる状態でお試しください'); }
      }
    }
    return { fontEmbedCSS: out.join('\n') };
  }

  /* ---------------------------------------------------------------- 書体を選ぶ画面 */
  /** いまのプレイリストから見本の字を拾う(英字だけの曲名・アーティスト、日本語の入った題・曲名) */
  function samples(s) {
    const xs = [s.title, ...s.tracks.flatMap((t) => [t.title, t.artist]), s.label].map((x) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const cut = (x, n) => (Array.from(x).length > n ? Array.from(x).slice(0, n).join('') + '…' : x);
    const en = xs.find((x) => /^[\x20-\x7e]+$/.test(x) && /[A-Za-z]/.test(x));
    const ja = xs.find((x) => /[\u3040-\u30ff\u3400-\u9fff]/.test(x));
    return { en: cut(en || 'Paper Moon Drive', 18), ja: cut(ja || 'ふたりのプレイリスト', 11) };
  }
  /** 見本の書体(選ぶ画面のボタン)。英字のボタンは英字の書体だけ、和文のボタンは和文の書体だけで出す */
  function chipStack(axis, id, font) {
    if (axis === 'en') {
      if (id === 'same') return plan({ en: 'same', ja: normalize(font).ja }).stack;
      const p = enPart(id, 'system');   // iPhone 風は、Apple の端末なら SF Pro の見本
      return `${cssOf(p)}, sans-serif`;
    }
    return plan({ en: 'same', ja: id }).stack;
  }

  /** 書体を選ぶ画面。ed.set で決め、上の見本(いまのシートの写し)を描き直す */
  function dialog(ed) {
    const sm = samples(ed.state);
    const prev = h('div.umf-prev', { 'aria-hidden': 'true' });
    function shot() {
      const src = ed.sheet;
      if (!src || !prev.isConnected) return;
      const c = src.cloneNode(true), oc = src.querySelectorAll('canvas');
      c.querySelectorAll('canvas').forEach((k, i) => { const o = oc[i]; if (!o || !o.width) return; k.width = o.width; k.height = o.height; k.getContext('2d').drawImage(o, 0, 0); });
      c.querySelectorAll('.ed-ui').forEach((n) => n.remove());
      c.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
      c.classList.add('exporting');   // 空の欄の案内を出さない・盤を止める
      c.inert = true;
      c.style.zoom = String(Math.min(1, (prev.clientWidth || 660) / (src.offsetWidth || 760)));
      prev.replaceChildren(c);
    }
    const grids = {};
    const pick = (axis, id) => {
      ed.set('font.' + axis, id, { rerender: true });
      grids[axis].querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      if (axis === 'ja') { const same = grids.en.querySelector('[data-id="same"] b'); if (same) same.style.fontFamily = chipStack('en', 'same', ed.state.font); }
      requestAnimationFrame(shot);
      ensure(ed.sheet, ed.state.font).then((rs) => {
        shot();
        if (rs.some((r) => !r.ok)) U.toast('書体を読み込めませんでした。通信できる状態でお試しください', 'error');
      });
    };
    const grid = (axis, ids, sample) => {
      const cur = normalize(ed.state.font)[axis];
      grids[axis] = h('div.umf-grid', { role: 'group', 'aria-label': axis === 'en' ? '英字の書体' : '和文の書体' }, ids.map((id) => {
        const L = labelOf(axis, id), f = id === 'ios' || id === 'same' || id === 'system' ? null : KitFonts.info(id);
        if (f) KitFonts.load(id, [700], sample).catch(() => {});
        else if (id === 'ios' && !APPLE) KitFonts.load(axis === 'en' ? 'inter' : 'noto', [700], sample).catch(() => {});
        return h('button.umf-chip', { type: 'button', 'data-id': id, 'aria-pressed': String(id === cur), title: L.mood, onclick: () => pick(axis, id) },
          h('b', { style: { fontFamily: chipStack(axis, id, ed.state.font) } }, sample),
          h('span', L.label), h('small', L.mood));
      }));
      return grids[axis];
    };
    U.openDialog({
      title: '書体を選ぶ', wide: true,
      content: h('div.modal-body.umf',
        prev,
        h('section.umf-sec', h('h3', '英字の書体'), grid('en', EN, sm.en)),
        h('section.umf-sec', h('h3', '和文の書体'), grid('ja', JA, sm.ja)),
        h('p.hint', '「iPhone 風」は iPhone・Mac では本物のシステムフォント（SF Pro とヒラギノ角ゴ）で、ほかの端末では似た Google Fonts（Inter と Noto Sans JP）で出します。'),
        h('p.hint', '端末の書体とシステムフォントのほかは Google Fonts の書体です。保存する画像や動画には、使っている字の分だけ書体を入れます。'))
    });
    requestAnimationFrame(shot);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(shot);
  }

  window.UmFont = { EN, JA, normalize, plan, ensure, exportOptions, dialog, shortLabel };
})();
