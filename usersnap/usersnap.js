/* usersnap — チェキ風プリント(見本)。
   作業台は L 判の印画紙。左に「そのまま」、右に「落書き」の 2 枚を並べ、刷り上がりをそのまま直していく。
   描くのはすべて canvas。寸法は mm で持ち、1 mm あたりの画素数 k だけを変えて、画面にも書き出しにも同じ関数で描く
   (落書きの線・文字・ステッカーは書き出しの解像度で描き直すので、ぼやけない)。
   保存は Ed(IndexedDB の userkit-editor、キー usersnap)。Ed の縮小は使わず、用紙の大きさは作業台に合わせてここで決める */
(function () {
  'use strict';
  const { h, icon } = U;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const safeHex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : d);
  const svgNode = (str) => { const d = document.createElement('div'); d.innerHTML = str; return d.firstElementChild; };
  const r2 = (v) => Math.round(v * 100) / 100;
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const isoToDot = (iso) => iso.replace(/-/g, '.');

  /* ================================================================ 色 */
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return toHex(...x.map((v, i) => v * (1 - t) + y[i] * t)); };
  const lum = (hex) => {
    const [r, g, b] = rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  /* ================================================================ 乱数(粒子やラメは種から毎回同じ形を作る) */
  function hashStr(str) { let x = 2166136261; for (const ch of String(str)) { x ^= ch.codePointAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ================================================================ 寸法(mm) */
  // フィルムの外形と写真の窓 [左, 上, 幅, 高さ]
  const FILMS = {
    mini: { label: 'mini', size: '54×86 mm', w: 54, h: 86, win: [4, 6.5, 46, 62] },
    square: { label: 'square', size: '72×86 mm', w: 72, h: 86, win: [5, 7, 62, 62] }
  };
  const FILM_R = 2.6;        // フィルムの角の丸み
  const PAPERS = {
    L: { label: 'L 判', size: '89×127 mm', w: 127, h: 89 },
    '2L': { label: '2L 判', size: '127×178 mm', w: 178, h: 127 }
  };
  const GAP = 8;             // 2 枚の間(切り取りの目印が両側から入る)
  const SIDE_MIN = 4;        // 用紙の左右に最低限あける幅
  const CUT = 3;             // ふちなしで刷ると切れることがある幅(画面のめやす)
  const EXPORT_DPI = 360, EXPORT_K = EXPORT_DPI / 25.4;
  const film = (s) => FILMS[s.film] || FILMS.mini;

  /* ================================================================ カード(写真・文字やステッカー・線の 1 組) */
  // カード 0 は state そのもの(photo・objects・strokes)、1 枚目以降は state.cards[i - 1]。
  // 並べ方 pair = 1 枚のカードを「そのまま」と「落書き」の 2 枚で並べる、each = カードごとに 1 枚(どれも落書きできる)
  const cardAt = (s, i) => (i > 0 ? s.cards[i - 1] || null : s);
  const emptyCard = () => ({ photo: null, objects: [], strokes: [] });
  /** 描くときのカード: 共通の設定(フチ・効果など)に、そのカードの写真・物・線を重ねたもの */
  const cardView = (s, i) => (i > 0 ? Object.assign({}, s, cardAt(s, i) || emptyCard()) : s);
  /** カードを n 枚までそろえる。足すカードには、1 枚目の文字・サイン・ステッカーを写す(線は写さない) */
  function ensureCards(s, n) {
    while (s.cards.length < n - 1) s.cards.push({ photo: null, objects: s.objects.map((o) => Object.assign({}, o, { id: U.uid() })), strokes: [] });
  }
  const filmR = (s) => (s.corner === 'round' ? FILM_R : 0);

  /* ================================================================ お店の刷り方(試し刷りで測った値。用紙ごとに、このブラウザの localStorage へ) */
  // scale = 刷ると何倍になるか、cut = 切れる幅 [上, 右, 下, 左](mm)。測っていなければ見込みの値(1 倍・3 mm)
  const PRINT_KEY = 'userkit:usersnap:print', MM_KEY = 'userkit:usersnap:mmpx', VIEW_KEY = 'userkit:usersnap:view';
  const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
  const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 使えない環境 */ } };
  let printProfiles = readJson(PRINT_KEY) || {};
  function printProfile(paper) {
    const p = printProfiles[paper];
    const ok = p && p.scale > 0.9 && p.scale < 1.15 && Array.isArray(p.cut) && p.cut.length === 4;
    return ok ? { scale: p.scale, cut: p.cut.map((v) => clamp(Number(v) || 0, 0, 12)), measured: true } : { scale: 1, cut: [CUT, CUT, CUT, CUT], measured: false };
  }
  function savePrintProfile(paper, v) {
    if (v) printProfiles[paper] = v; else delete printProfiles[paper];
    writeJson(PRINT_KEY, printProfiles);
  }
  /**
   * 用紙の上の置き場所(slots)と縮め(sc)。初めは点線(刷ると切れることがある範囲)から 1 mm 内に収める。
   * 実寸(size: real)は、測った拡大を打ち消して刷り上がりで実寸にし、切れ方の片寄りの分だけ中心をずらす
   * (見込みの値のままなら 100%。L 判の mini は上下の余白が 1.5 mm なので、フチの上下が少し欠けることがある)。
   * 2L 判で敷き詰める(tile)ときは、mini を横に 3 枚。1 枚ずつを刷り上がりで実寸(54×86 mm)のまま点線の内に収めるため、
   * 間を 2〜4 mm に詰める(ユーザーの指定。それでも収まらなければ 2 枚に戻し、tileBlocked で知らせる)。3 枚は組にならないので、1 枚ごとに別の写真
   */
  function layout(s) {
    const f = film(s), p = PAPERS[s.paper] || PAPERS.L, pr = printProfile(s.paper), cut = pr.cut;
    const [ct, cr, cb, cl] = cut, full = 1 / pr.scale;
    let cols = 2, gap = GAP, tiled = false, tileBlocked = false;
    if (s.paper === '2L' && s.tile && s.film === 'mini') {
      const room = ((p.w - cl - cr - 2) / full - f.w * 3) / 2;
      if (room >= 2) { cols = 3; gap = Math.min(4, room); tiled = true; } else tileBlocked = true;
    }
    const gw = f.w * cols + gap * (cols - 1), gh = f.h;
    let sc, cx, cy;
    if (s.size === 'real') {
      sc = Math.min(full, (p.w - SIDE_MIN * 2) / gw, (p.h - 1) / gh);
      cx = p.w / 2 + (cl - cr) / 2;
      cy = p.h / 2 + (ct - cb) / 2;
    } else {
      const aw = p.w - cl - cr - 2, ah = p.h - ct - cb - 2;
      sc = Math.min(full, aw / gw, ah / gh);
      cx = cl + 1 + aw / 2;
      cy = ct + 1 + ah / 2;
    }
    const x0 = cx - (gw * sc) / 2, y0 = cy - (gh * sc) / 2, each = s.arrange === 'each' || tiled;
    const slots = [];
    for (let i = 0; i < cols; i++) {
      slots.push({ i, x: x0 + i * (f.w + gap) * sc, y: y0, card: each ? i : Math.floor(i / 2), side: each || i % 2 ? 'doodle' : 'plain' });
    }
    return { f, p, sc, pr, cut, gap, each, tiled, tileBlocked, slots, cards: each ? slots.length : slots.length / 2 };
  }
  /** 1 枚ごとに別の写真か(並べ方が「別々の写真」か、敷き詰めているとき) */
  const isEach = (s) => layout(s).each;

  /* ================================================================ 書体(英字と和文を組にして重ねる。英字は英字の書体、かなと漢字は和文の書体で出る) */
  // 英字は 2 組: サイン(直筆のサインらしい続け字)と、手書き(メモや落書きらしい字)。どちらも男女を問わず使える字を選ぶ(ユーザーの希望)
  const LATIN_SIGN = {
    dafoe: 'Mr Dafoe', herr: 'Herr Von Muellerhoff', msaint: 'Mrs Saint Delafield', madi: 'Ms Madi', sugiyama: 'Dr Sugiyama',
    yellowtail: 'Yellowtail', kristi: 'Kristi', meddon: 'Meddon', cedarville: 'Cedarville Cursive', sacramento: 'Sacramento', apple: 'Homemade Apple'
  };
  const LATIN_NOTE = {
    caveat: 'Caveat', marker: 'Permanent Marker', rocksalt: 'Rock Salt', gochi: 'Gochi Hand',
    shadows: 'Shadows Into Light', reenie: 'Reenie Beanie', nothing: 'Nothing You Could Do', grace: 'Covered By Your Grace'
  };
  const LATIN = Object.assign({}, LATIN_SIGN, LATIN_NOTE);
  const JP = { yomogi: 'Yomogi', hachi: 'Hachi Maru Pop', kurenaido: 'Zen Kurenaido', yusei: 'Yusei Magic', klee: 'Klee One' };
  const DATE_FONT = 'DotGothic16';
  const fontOf = (o, px) => `500 ${px}px "${LATIN[o.latin] || LATIN.caveat}", "${JP[o.jp] || JP.yomogi}", sans-serif`;

  /* ================================================================ ペン(本物のチェキに描くペンを模す。太さは mm で [最小, 最大, 初め]) */
  const PENS = {
    posca: { label: 'ポスカ', w: [0.6, 3.2, 1.4], colors: ['#ffffff', '#1d1d22', '#ff4f9a', '#ff3b3b', '#ff9a1f', '#ffe14d', '#38c96b', '#2e8bff', '#9b5cff', '#8b5a3c'] },
    gel: { label: 'ゲルペン', w: [0.3, 1.2, 0.55], colors: ['#ff8fc4', '#ffc4de', '#9ad7ff', '#c4b2ff', '#a8ecc0', '#fff09a', '#d4af37', '#c3c6ce', '#1d1d22'] },
    glitter: { label: 'ラメ', w: [0.6, 2.6, 1.1], colors: ['#ff5fa8', '#e2b53c', '#c9ccd4', '#6f9dff', '#b07cff', '#4fcf9a', '#ff8a3d'] },
    neon: { label: 'ネオン', w: [0.5, 2.4, 1], colors: ['#ff3fa4', '#2ef2ff', '#b6ff3a', '#fff23a', '#b45cff', '#ff7a1a', '#3a7bff'] },
    white: { label: '白ペン', w: [0.3, 1.6, 0.7], colors: null },
    hl: { label: '蛍光ペン', w: [1.5, 5, 3], colors: ['#fff23a', '#ff6fb5', '#7dff6a', '#5fd7ff', '#ffa64d'] },
    eraser: { label: '消しゴム', w: [1, 8, 3], colors: null }
  };
  const penColor = (s, tool) => (tool === 'white' ? '#ffffff' : safeHex(s.pen.colors[tool], (PENS[tool].colors || ['#000000'])[0]));

  /* ================================================================ 効果・フチ・文字の選択肢 */
  const TONES = [['none', 'なし'], ['warm', 'ウォーム'], ['cool', 'クール']];
  const LEAK_SIDES = [['left', '左'], ['right', '右'], ['top', '上'], ['bottom', '下']];
  const DATE_FMTS = [['y2', "'26 11 02"], ['dot', '2026.11.02'], ['mdy', "11 02 '26"]];
  // 用紙の地(フチの外)の色。初めは LINE の初期画像の地に近い薄い灰色にして、白いフチとの境目を見やすくする(切りやすいように)
  const SHEET_COLORS = ['#dfe2e6', '#ffffff', '#ece6da', '#d9e3ee', '#ecdde5', '#3a3a40'];
  const sheetColor = (s) => safeHex(s.sheet, SHEET_COLORS[0]);
  const FRAME_COLORS = ['#ffffff', '#f6f0e3', '#1f1d22', '#ffd6e3', '#d9f0e6', '#d8e8fb', '#e6dcfa', '#fff1b8'];
  const PATTERNS = [['none', 'なし'], ['dots', 'ドット'], ['gingham', 'ギンガム'], ['stripe', 'ストライプ'], ['paper', '紙の質感']];
  const PAT_COLORS = ['#f4a7c0', '#9fc8f0', '#a8d8b9', '#c6b3ef', '#f3c969', '#ff7a7a', '#333338'];
  const TEXT_COLORS = ['#ffffff', '#1d1d22', '#ff4f9a', '#ff3b3b', '#ff9a1f', '#f2c400', '#2fb865', '#2e8bff', '#8a5cf5'];
  const STICKER_COLORS = ['#ff5f9e', '#ff4560', '#ff9a3c', '#ffc93c', '#5fcf8a', '#5fb6ff', '#8a7cff', '#c9a7ff', '#2a2830', '#ffffff'];
  const ONS = [['both', '2 枚とも'], ['doodle', '落書きだけ']];
  const SIZE = { text: [2, 18], sign: [2, 9], sticker: [3, 60] };

  /* ================================================================ ステッカー(独自に描いた SVG。白いふちで切り抜いたシールに見せる) */
  const poly = (pts) => 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
  const around = (n, rFn, cy) => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; const r = rFn(i); return [50 + r * Math.cos(a), (cy || 50) + r * Math.sin(a)]; });
  const HEART_D = 'M50 88C24 71 9 56 9 37c0-13 10-24 23-24 8 0 14 4 18 11 4-7 10-11 18-11 13 0 23 11 23 24 0 19-15 34-41 51z';
  const STAR_D = poly(around(10, (i) => (i % 2 ? 21 : 46), 54));
  const SPARK_D = 'M46 8C49 37 59 47 88 50C59 53 49 63 46 92C43 63 33 53 4 50C33 47 43 37 46 8Z';
  const SPARK2_D = 'M82 4c1 9 4 12 13 13c-9 1-12 4-13 13c-1-9-4-12-13-13c9-1 12-4 13-13z';
  const RIB = ['M46 46C34 28 12 22 8 38c-4 16 16 24 38 18z', 'M54 46C66 28 88 22 92 38c4 16-16 24-38 18z', 'M45 55 30 86l9-3 6 9 8-35z', 'M55 55l15 31-9-3-6 9-8-35z'];
  const BUB_D = 'M18 16h64a12 12 0 0 1 12 12v32a12 12 0 0 1-12 12H48L30 88l5-16H18A12 12 0 0 1 6 60V28a12 12 0 0 1 12-12z';
  const PAD_D = 'M50 46c15 0 28 13 28 26 0 10-8 16-16 14-5-1-8-3-12-3s-7 2-12 3c-8 2-16-4-16-14 0-13 13-26 28-26z';
  const TOES = [[22, 40, -20], [39, 22, -8], [61, 22, 8], [78, 40, 20]].map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="9" ry="11.5" transform="rotate(${a} ${x} ${y})"/>`).join('');
  const CROWN_D = 'M14 72 16 30l18 18 16-30 16 30 18-18 2 42z';
  const PETALS = around(5, () => 23).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17"/>`).join('');
  const CLOUD_D = 'M28 78a18 18 0 0 1-4-35 22 22 0 0 1 42-10 17 17 0 0 1 17 26 14 14 0 0 1-5 19z';
  // 棒の下の端は符頭の右の先の中に入れる(符頭と棒が離れて見えないように)
  const NOTE_HEADS = '<ellipse cx="28" cy="76" rx="12" ry="9" transform="rotate(-20 28 76)"/><ellipse cx="70" cy="68" rx="12" ry="9" transform="rotate(-20 70 68)"/>';
  const NOTE_D = 'M33 73V22L81 10v55h-6V20.5L39 29.5V73z';
  const CAT_D = 'M18 42 14 10l26 16c6-2 14-2 20 0l26-16-4 32c6 7 9 15 9 23 0 17-18 29-41 29s-41-12-41-29c0-8 3-16 9-23z';
  // shape = 白いふちにする外形(色の指定なし)、art = 色をつけた絵。c = 主の色、dk = ふちの線、lt = 明るい色
  const STICKERS = {
    heart: { label: 'ハート', c: '#ff5f9e', shape: `<path d="${HEART_D}"/>`,
      art: (c, dk) => `<path d="${HEART_D}" fill="${c}" stroke="${dk}" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 34c1-8 7-13 14-12" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" opacity=".85"/><circle cx="21" cy="45" r="3.2" fill="#fff" opacity=".85"/>` },
    star: { label: '星', c: '#ffc93c', shape: `<path d="${STAR_D}"/>`,
      art: (c, dk) => `<path d="${STAR_D}" fill="${c}" stroke="${dk}" stroke-width="3" stroke-linejoin="round"/><path d="M41 38l5-12" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>` },
    sparkle: { label: 'きらきら', c: '#ffd84a', shape: `<path d="${SPARK_D}"/><path d="${SPARK2_D}"/>`,
      art: (c, dk, lt) => `<path d="${SPARK_D}" fill="${c}" stroke="${dk}" stroke-width="2.5" stroke-linejoin="round"/><path d="${SPARK2_D}" fill="${lt}" stroke="${dk}" stroke-width="2" stroke-linejoin="round"/><path d="M46 24c1 9 3 15 7 19" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>` },
    ribbon: { label: 'リボン', c: '#ff7eb3', shape: RIB.map((d) => `<path d="${d}"/>`).join('') + '<rect x="40" y="38" width="20" height="20" rx="7"/>',
      art: (c, dk, lt) => RIB.map((d) => `<path d="${d}" fill="${c}" stroke="${dk}" stroke-width="2.5" stroke-linejoin="round"/>`).join('') +
        `<path d="M42 46C33 35 19 31 15 39M58 46c9-11 23-15 27-7" fill="none" stroke="${lt}" stroke-width="3.5" stroke-linecap="round"/><rect x="40" y="38" width="20" height="20" rx="7" fill="${mix(c, '#000000', 0.12)}" stroke="${dk}" stroke-width="2.5"/>` },
    bubble: { label: '吹き出し', c: '#ff6fa8', shape: `<path d="${BUB_D}"/>`,
      art: (c) => `<path d="${BUB_D}" fill="#fff" stroke="${c}" stroke-width="4" stroke-linejoin="round"/><g transform="translate(35 29) scale(.3)"><path d="${HEART_D}" fill="${c}"/></g>` },
    paw: { label: '肉球', c: '#f29bb5', shape: TOES + `<path d="${PAD_D}"/>`,
      art: (c, dk) => `<g fill="${c}" stroke="${dk}" stroke-width="2.5">${TOES}<path d="${PAD_D}"/></g><path d="M36 64c3-6 8-9 14-9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>` },
    crown: { label: '王冠', c: '#f5c542', shape: `<path d="${CROWN_D}"/><rect x="14" y="70" width="72" height="14" rx="3"/><circle cx="16" cy="28" r="6"/><circle cx="50" cy="16" r="6"/><circle cx="84" cy="28" r="6"/>`,
      art: (c, dk) => `<path d="${CROWN_D}" fill="${c}" stroke="${dk}" stroke-width="2.5" stroke-linejoin="round"/><rect x="14" y="70" width="72" height="14" rx="3" fill="${mix(c, '#000000', 0.12)}" stroke="${dk}" stroke-width="2.5"/>` +
        `<g stroke="${dk}" stroke-width="2"><circle cx="16" cy="28" r="6" fill="${c}"/><circle cx="50" cy="16" r="6" fill="${c}"/><circle cx="84" cy="28" r="6" fill="${c}"/><circle cx="32" cy="77" r="3.5" fill="#5fb6ff"/><circle cx="50" cy="77" r="4.5" fill="#ff5f9e"/><circle cx="68" cy="77" r="3.5" fill="#5fb6ff"/></g>` },
    flower: { label: '花', c: '#ff9ec4', shape: PETALS + '<circle cx="50" cy="50" r="12"/>',
      art: (c, dk) => `<g fill="${c}" stroke="${dk}" stroke-width="2.2">${PETALS}</g><circle cx="50" cy="50" r="12" fill="#ffd54a" stroke="#e0a800" stroke-width="2.2"/><circle cx="46" cy="46" r="3.5" fill="#fff" opacity=".8"/>` },
    cloud: { label: '雲', c: '#9fd3ff', shape: `<path d="${CLOUD_D}"/>`,
      art: (c, dk) => `<path d="${CLOUD_D}" fill="${c}" stroke="${dk}" stroke-width="2.5" stroke-linejoin="round"/><path d="M30 46c2-7 8-11 15-10" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity=".8"/>` +
        '<circle cx="42" cy="60" r="3" fill="#3a3550"/><circle cx="62" cy="60" r="3" fill="#3a3550"/><path d="M48 65q4 4 8 0" fill="none" stroke="#3a3550" stroke-width="2.2" stroke-linecap="round"/><circle cx="35" cy="66" r="3.5" fill="#ff9ec4" opacity=".7"/><circle cx="69" cy="66" r="3.5" fill="#ff9ec4" opacity=".7"/>' },
    note: { label: '音符', c: '#8a7cff', shape: NOTE_HEADS + `<path d="${NOTE_D}"/>`,
      // 輪郭は外側だけに引く(先に太い線で全体をなぞり、上から塗る。つなぎ目に線が入らない)
      art: (c, dk) => `<g fill="${dk}" stroke="${dk}" stroke-width="4.4" stroke-linejoin="round"><path d="${NOTE_D}"/>${NOTE_HEADS}</g><g fill="${c}"><path d="${NOTE_D}"/>${NOTE_HEADS}</g>` +
        '<g fill="#fff" opacity=".75"><ellipse cx="23" cy="73" rx="4" ry="2.4" transform="rotate(-20 23 73)"/><ellipse cx="65" cy="65" rx="4" ry="2.4" transform="rotate(-20 65 65)"/></g>' },
    cherry: { label: 'さくらんぼ', c: '#ff4560', shape: '<circle cx="32" cy="70" r="16"/><circle cx="68" cy="74" r="16"/><path d="M32 56C36 38 46 24 58 14M68 58C66 42 62 28 58 14" fill="none"/><path d="M58 14c10-9 26-8 32 2-10 7-24 7-32-2z"/>',
      art: (c, dk) => '<path d="M32 56C36 38 46 24 58 14M68 58C66 42 62 28 58 14" fill="none" stroke="#4f8a3c" stroke-width="3.5" stroke-linecap="round"/><path d="M58 14c10-9 26-8 32 2-10 7-24 7-32-2z" fill="#6cc24a" stroke="#3f7d2c" stroke-width="2"/>' +
        `<g fill="${c}" stroke="${dk}" stroke-width="2.5"><circle cx="32" cy="70" r="16"/><circle cx="68" cy="74" r="16"/></g><g fill="#fff" opacity=".8"><circle cx="25" cy="64" r="3.5"/><circle cx="61" cy="68" r="3.5"/></g>` },
    cat: { label: '黒猫', c: '#2a2830', shape: `<path d="${CAT_D}"/>`,
      art: (c, dk, lt) => `<path d="${CAT_D}" fill="${c}" stroke="${dk}" stroke-width="2.5" stroke-linejoin="round"/><path d="M22 20l3 16 10-6zM78 20l-3 16-10-6z" fill="#f6a6bd"/>` +
        `<g fill="#ffd23f"><ellipse cx="35" cy="60" rx="8" ry="9"/><ellipse cx="65" cy="60" rx="8" ry="9"/></g><g fill="${c}"><ellipse cx="35" cy="61" rx="2.6" ry="7"/><ellipse cx="65" cy="61" rx="2.6" ry="7"/></g><g fill="#fff"><circle cx="37.5" cy="56.5" r="1.8"/><circle cx="67.5" cy="56.5" r="1.8"/></g>` +
        `<path d="M46 70h8l-4 5z" fill="#f6a6bd"/><path d="M50 75q-4 5-9 2M50 75q4 5 9 2M10 66l16 2M12 75l15-2M90 66l-16 2M88 75l-15-2" fill="none" stroke="${lt}" stroke-width="1.8" stroke-linecap="round"/>` }
  };
  function stickerSvg(id, color) {
    const st = STICKERS[id] || STICKERS.heart;
    const c = safeHex(color, st.c), dk = mix(c, '#000000', lum(c) < 0.05 ? 0.5 : 0.28), lt = mix(c, '#ffffff', 0.55);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 116 116" width="600" height="600"><g fill="#fff" stroke="#fff" stroke-width="13" stroke-linejoin="round" stroke-linecap="round">${st.shape}</g>${st.art(c, dk, lt)}</svg>`;
  }

  /* ================================================================ 状態 */
  function heartPts(cx, cy, w) {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      const x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      pts.push(r2(cx + (x * w) / 32), r2(cy + (y * w) / 32));
    }
    return pts;
  }
  /** 一筆書きの星(角が丸まりすぎないように、辺の途中にも点を置く) */
  function starPts(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 4 / 5, b = a + Math.PI * 4 / 5;
      for (let j = 0; j < 8; j++) pts.push(r2(cx + r * (Math.cos(a) + (Math.cos(b) - Math.cos(a)) * j / 8)), r2(cy + r * (Math.sin(a) + (Math.sin(b) - Math.sin(a)) * j / 8)));
    }
    pts.push(r2(cx), r2(cy - r));
    return pts;
  }
  function defaults() {
    const today = todayIso();
    const w = {};
    Object.keys(PENS).forEach((k) => { w[k] = PENS[k].w[2]; });
    return {
      film: 'mini', corner: 'square', paper: 'L', size: 'fit', arrange: 'pair', tile: false, cards: [],
      sheet: SHEET_COLORS[0], marks: true, format: 'jpeg', stickerShadow: true,
      photo: null,
      adj: { bright: 0, contrast: 0, sat: 0, temp: 0, tint: 0, high: 0, shadow: 0 },
      fx: { tone: 'warm', toneAmt: 30, fade: 18, grain: 30, vignette: 30, leak: 0, leakSide: 'right', date: true, dateVal: today, dateFmt: 'y2' },
      frame: { color: '#ffffff', pattern: 'none', patColor: '#f4a7c0', image: '' },
      objects: [
        { id: U.uid(), kind: 'text', text: 'Thank you!', latin: 'caveat', jp: 'hachi', size: 7, color: '#ff4f9a', edge: 'none', edgeColor: '#ffffff', x: 27, y: 77.5, rot: -0.04, on: 'both' },
        { id: U.uid(), kind: 'sign', msg: 'また来てね！', name: 'Akari', date: isoToDot(today), latin: 'dafoe', jp: 'yomogi', size: 3.6, color: '#ffffff', edge: 'color', edgeColor: '#ff6fa8', x: 30, y: 51, rot: -0.06, on: 'doodle' },
        { id: U.uid(), kind: 'sticker', ref: 'cat', color: '#2a2830', x: 11.5, y: 59.5, size: 11, rot: -0.16, on: 'doodle' },
        { id: U.uid(), kind: 'sticker', ref: 'sparkle', color: '#ffd84a', x: 44, y: 29, size: 7, rot: 0.12, on: 'doodle' }
      ],
      strokes: [
        { id: U.uid(), pen: 'posca', color: '#ff4f9a', w: 1.1, both: false, pts: heartPts(13.5, 16, 10) },
        { id: U.uid(), pen: 'glitter', color: '#e2b53c', w: 1.1, both: false, pts: starPts(39, 16, 5) }
      ],
      assets: {},
      pen: { tool: 'posca', both: false, w, colors: { posca: '#ff4f9a', gel: '#ff8fc4', glitter: '#e2b53c', neon: '#ff3fa4', hl: '#fff23a' } }
    };
  }
  function migrate(st) {
    const d = defaults();
    st = st || {};
    const s = Object.assign(d, st);
    s.fx = Object.assign(defaults().fx, st.fx || {});
    s.frame = Object.assign(defaults().frame, st.frame || {});
    const p0 = defaults().pen;
    s.pen = Object.assign(p0, st.pen || {});
    s.pen.w = Object.assign(defaults().pen.w, (st.pen && st.pen.w) || {});
    s.pen.colors = Object.assign(defaults().pen.colors, (st.pen && st.pen.colors) || {});
    if (!PENS[s.pen.tool]) s.pen.tool = 'posca';
    if (!FILMS[s.film]) s.film = 'mini';
    if (!PAPERS[s.paper]) s.paper = 'L';
    if (s.size !== 'real') s.size = 'fit';
    if (s.corner !== 'round') s.corner = 'square';
    if (s.arrange !== 'each') s.arrange = 'pair';
    s.tile = !!s.tile;
    if (!s.assets || typeof s.assets !== 'object') s.assets = {};
    // カードの形をそろえる。選べなくなった書体は、サインは Mr Dafoe、文字は Caveat に置き換える
    const fixCard = (c) => {
      if (!Array.isArray(c.objects)) c.objects = [];
      if (!Array.isArray(c.strokes)) c.strokes = [];
      if (!c.photo || !c.photo.src) c.photo = null;
      c.objects = c.objects.filter((o) => o && ['text', 'sign', 'sticker'].includes(o.kind));
      c.objects.forEach((o) => {
        if (o.kind === 'sticker') return;
        if (!LATIN[o.latin]) o.latin = o.kind === 'sign' ? 'dafoe' : 'caveat';
        if (!JP[o.jp]) o.jp = 'yomogi';
      });
      c.strokes = c.strokes.filter((x) => x && PENS[x.pen] && Array.isArray(x.pts) && x.pts.length >= 2);
      return c;
    };
    fixCard(s);
    s.cards = (Array.isArray(s.cards) ? s.cards : []).filter((c) => c && typeof c === 'object').map((c) => fixCard({ photo: c.photo, objects: c.objects, strokes: c.strokes }));
    s.adj = Object.assign(defaults().adj, st.adj || {});
    return s;
  }

  /* ================================================================ 画像と書体の読み込み */
  const imgs = new Map();   // src → { img, ok, p }
  function loadImg(src) {
    let r = imgs.get(src);
    if (!r) {
      r = { img: new Image(), ok: false };
      r.p = new Promise((resolve, reject) => {
        r.img.onload = () => { r.ok = true; baseVer++; requestPaint(); resolve(r.img); };
        r.img.onerror = () => { imgs.delete(src); reject(new Error('画像を読み込めませんでした')); };
      });
      r.img.src = src;
      imgs.set(src, r);
    }
    return r.p;
  }
  /** 読み込み済みなら画像、まだなら読み込みを始めて null(読めたら描き直す) */
  function getImg(src) {
    if (!src) return null;
    const r = imgs.get(src);
    if (r && r.ok) return r.img;
    if (!r) loadImg(src).catch(() => {});
    return null;
  }
  // canvas は書体を自分では取り寄せないので、使う字ごとに document.fonts.load で取り寄せ、届いたら描き直す
  const fontReq = new Set();
  function needFont(font, text, onload) {
    if (!document.fonts || !text) return;
    const key = font + '|' + text;
    if (fontReq.has(key)) return;
    fontReq.add(key);
    document.fonts.load(font, text).then(onload, () => {});
  }
  const svgUrls = new Map();
  function stickerSrc(o) {
    if (String(o.ref).startsWith('img:')) return ed.state.assets[o.ref.slice(4)] || '';
    const key = o.ref + '|' + o.color;
    if (!svgUrls.has(key)) svgUrls.set(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stickerSvg(o.ref, o.color)));
    return svgUrls.get(key);
  }

  /* ================================================================ 質感(粒子と紙。mm あたりの細かさを決めて 1 度だけ作り、どの解像度でも同じ大きさで敷く) */
  const GRAIN_MM = 0.07, PAPER_MM = 0.1;
  let grainTex = null, paperTex = null;
  function grain() {
    if (grainTex) return grainTex;
    const n = Math.ceil(64 / GRAIN_MM);
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n), r = rng(1107);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = clamp(128 + (r() + r() + r() - 1.5) * 92, 0, 255);
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return (grainTex = c);
  }
  function paper() {
    if (paperTex) return paperTex;
    const c = document.createElement('canvas');
    c.width = Math.ceil(76 / PAPER_MM);
    c.height = Math.ceil(90 / PAPER_MM);
    const g = c.getContext('2d'), r = rng(2024);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(120,100,80,${(0.05 + r() * 0.13).toFixed(3)})`;
      g.beginPath();
      g.arc(r() * c.width, r() * c.height, 0.3 + r() * 1.1, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 0.7;
    for (let i = 0; i < 520; i++) {
      const x = r() * c.width, y = r() * c.height, a = r() * Math.PI * 2, len = 8 + r() * 34;
      g.strokeStyle = `rgba(140,118,96,${(0.08 + r() * 0.12).toFixed(3)})`;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.6) * len / 2, y + Math.sin(a + 0.6) * len / 2, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    return (paperTex = c);
  }

  /* ================================================================ 描く: フチと写真(2 枚で共通。原点はフィルムの左上、k = 1 mm の画素数) */
  function drawBase(g, s, f, k, devE) {
    drawFrame(g, s, f, k);
    drawPhotoPart(g, s, f, k, devE);
  }
  /** 写真の窓(写真・補正・効果・日付と、窓のふちの影)。PSD では 1 枚のレイヤーにする */
  function drawPhotoPart(g, s, f, k, devE) {
    const [wx, wy, ww, wh] = f.win;
    g.save();
    g.translate(wx * k, wy * k);
    g.beginPath();
    g.rect(0, 0, ww * k, wh * k);
    g.clip();
    drawPhoto(g, s, ww, wh, k, devE);
    g.restore();
    // 写真が少し沈んで見えるように、窓のふちに細い影
    g.strokeStyle = 'rgba(0,0,0,.18)';
    g.lineWidth = Math.max(1, 0.12 * k);
    g.strokeRect(wx * k, wy * k, ww * k, wh * k);
  }
  function coverDraw(g, img, W, H) {
    const A = img.naturalWidth / img.naturalHeight, R = W / H;
    const dw = A > R ? H * A : W, dh = A > R ? H : W / A;
    g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  function drawFrame(g, s, f, k) {
    const fr = s.frame, W = f.w * k, H = f.h * k;
    g.save();
    g.fillStyle = safeHex(fr.color, '#ffffff');
    g.fillRect(0, 0, W, H);
    const img = fr.image ? getImg(fr.image) : null;
    if (img) { coverDraw(g, img, W, H); g.restore(); return; }
    const pc = safeHex(fr.patColor, '#f4a7c0');
    if (fr.pattern === 'dots') {
      const sp = 4.2, rr = 0.8;
      g.fillStyle = pc;
      g.beginPath();
      for (let row = 0, y = 1.4; y < f.h + sp; row++, y += sp * 0.866) {
        for (let x = row % 2 ? sp / 2 : 0; x < f.w + sp; x += sp) { g.moveTo((x + rr) * k, y * k); g.arc(x * k, y * k, rr * k, 0, Math.PI * 2); }
      }
      g.fill();
    } else if (fr.pattern === 'gingham') {
      const b = 3;
      g.fillStyle = pc;
      g.globalAlpha = 0.32;
      for (let x = 0; x < f.w; x += b * 2) g.fillRect(x * k, 0, b * k, H);
      for (let y = 0; y < f.h; y += b * 2) g.fillRect(0, y * k, W, b * k);
    } else if (fr.pattern === 'stripe') {
      const sp = 3.2, bw = 1.4;
      g.fillStyle = pc;
      g.globalAlpha = 0.5;
      g.beginPath();
      for (let x = -f.h; x < f.w + f.h; x += sp) {
        g.moveTo(x * k, 0); g.lineTo((x + bw) * k, 0); g.lineTo((x + bw - f.h) * k, H); g.lineTo((x - f.h) * k, H); g.closePath();
      }
      g.fill();
    } else if (fr.pattern === 'paper') {
      g.globalCompositeOperation = 'multiply';
      g.drawImage(paper(), 0, 0, f.w / PAPER_MM, f.h / PAPER_MM, 0, 0, W, H);
    }
    g.restore();
  }
  function photoRect(p, W, H) {
    const A = p.w / p.h, R = W / H, z = p.zoom || 1;
    const dw = Math.max(1, A / R) * z * W, dh = Math.max(R / A, 1) * z * H;
    return [(W - dw) / 2 + (p.x || 0) * W, (H - dh) / 2 + (p.y || 0) * H, dw, dh];
  }
  function clampPhoto(p, R) {
    const A = p.w / p.h, z = p.zoom || 1;
    const mx = (Math.max(1, A / R) * z - 1) / 2, my = (Math.max(R / A, 1) * z - 1) / 2;
    p.x = clamp(p.x || 0, -mx, mx);
    p.y = clamp(p.y || 0, -my, my);
  }
  function drawPhoto(g, s, ww, wh, k, devE) {
    const W = ww * k, H = wh * k;
    const p = s.photo, img = p && p.src ? getImg(p.src) : null;
    if (!img) {
      // 写真がないときは、淡い灰色の地だけ(案内の字は画面の上に HTML で重ねる)
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#e4e7ec');
      gr.addColorStop(1, '#d3d8df');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      return;
    }
    g.imageSmoothingQuality = 'high';
    const [dx, dy, dw, dh] = photoRect(p, W, H);
    g.drawImage(img, dx, dy, dw, dh);
    adjustPhoto(g, s.adj || {}, W, H);
    applyFx(g, s.fx, W, H, ww, wh, k);
    if (s.fx.date) drawDate(g, s.fx, W, H, k);
    if (devE < 1) {
      // 現像の演出(画面だけ): 乳白の膜が薄れ、色がだんだん濃くなる
      g.save();
      g.globalCompositeOperation = 'saturation';
      g.globalAlpha = (1 - devE) * 0.85;
      g.fillStyle = '#808080';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = Math.pow(1 - devE, 1.25);
      g.fillStyle = '#dfe6e2';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  }
  /**
   * 写真の色の補正(フィルムの癖の前にかける)。どれも -100〜100。
   * 明るさは中間の明るさを上げ下げし(白と黒は飛ばさない)、ハイライト・シャドウは明るい所・暗い所だけを動かす。
   * g は窓の左上へ移した変換で、画素は今の変換の位置から読む
   */
  function adjustPhoto(g, adj, W, H) {
    const v = (key) => clamp((Number(adj[key]) || 0) / 100, -1, 1);
    const b = v('bright'), c = v('contrast'), sa = v('sat'), te = v('temp'), ti = v('tint'), hi = v('high'), sh = v('shadow');
    if (!b && !c && !sa && !te && !ti && !hi && !sh) return;
    const T = g.getTransform(), x0 = Math.round(T.e), y0 = Math.round(T.f);
    const w = Math.round(W), hh = Math.round(H);
    if (w < 1 || hh < 1) return;
    const im = g.getImageData(x0, y0, w, hh), d = im.data;
    const gamma = Math.pow(2, -b * 0.9), cf = c >= 0 ? 1 + c * 1.1 : 1 + c * 0.7;
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) lut[i] = clamp((Math.pow(i / 255, gamma) - 0.5) * cf + 0.5, 0, 1);
    for (let i = 0; i < d.length; i += 4) {
      let r = lut[d[i]], gg = lut[d[i + 1]], bl = lut[d[i + 2]];
      const L = 0.2126 * r + 0.7152 * gg + 0.0722 * bl;
      const lift = sh * 0.38 * (1 - L) * (1 - L) + hi * 0.38 * L * L;
      r += lift + te * 0.07 + ti * 0.03;
      gg += lift - ti * 0.06;
      bl += lift - te * 0.07 + ti * 0.03;
      if (sa) {
        const L2 = 0.2126 * r + 0.7152 * gg + 0.0722 * bl, f = 1 + sa;
        r = L2 + (r - L2) * f; gg = L2 + (gg - L2) * f; bl = L2 + (bl - L2) * f;
      }
      d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = bl * 255;   // Uint8ClampedArray が丸めて 0〜255 に収める
    }
    g.putImageData(im, x0, y0);
  }
  /** フィルムの癖。どれも 0〜100 の強さ */
  function applyFx(g, fx, W, H, ww, wh, k) {
    const a = (v) => clamp((Number(v) || 0) / 100, 0, 1);
    g.save();
    if (fx.tone !== 'none' && a(fx.toneAmt)) {
      const t = a(fx.toneAmt), warm = fx.tone === 'warm';
      g.globalCompositeOperation = 'soft-light';
      g.globalAlpha = t * 0.85;
      g.fillStyle = warm ? '#ff8a2a' : '#2a86ff';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = t * 0.18;
      g.fillStyle = warm ? '#ffd8a0' : '#b9d6ff';
      g.fillRect(0, 0, W, H);
    }
    if (a(fx.fade)) {
      const t = a(fx.fade);
      g.globalCompositeOperation = 'lighten';
      g.globalAlpha = 1;
      g.fillStyle = `rgb(${Math.round(84 * t)},${Math.round(78 * t)},${Math.round(72 * t)})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'saturation';
      g.globalAlpha = 0.4 * t;
      g.fillStyle = '#808080';
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.14 * t;
      g.fillStyle = '#f3ece0';
      g.fillRect(0, 0, W, H);
    }
    if (a(fx.leak)) {
      const t = a(fx.leak), side = fx.leakSide || 'right';
      const at = { right: [W * 1.06, H * 0.32], left: [-W * 0.06, H * 0.68], top: [W * 0.3, -H * 0.06], bottom: [W * 0.7, H * 1.06] }[side];
      const R = Math.max(W, H) * 0.78;
      const gr = g.createRadialGradient(at[0], at[1], 0, at[0], at[1], R);
      gr.addColorStop(0, `rgba(255,236,170,${0.95 * t})`);
      gr.addColorStop(0.22, `rgba(255,140,44,${0.85 * t})`);
      gr.addColorStop(0.55, `rgba(232,44,34,${0.42 * t})`);
      gr.addColorStop(1, 'rgba(232,44,34,0)');
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = 1;
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    }
    if (a(fx.vignette)) {
      // 窓の形に合わせた楕円で、四隅へ向かって暗くする
      const t = a(fx.vignette), v = Math.round(255 * (1 - 0.78 * t));
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = 1;
      g.translate(W / 2, H / 2);
      g.scale(W / 2, H / 2);
      const gr = g.createRadialGradient(0, 0, 0.42, 0, 0, 1.42);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, `rgb(${v},${Math.max(0, v - 4)},${Math.max(0, v - 8)})`);
      g.fillStyle = gr;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    }
    if (a(fx.grain)) {
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = a(fx.grain) * 0.9;
      g.drawImage(grain(), 0, 0, ww / GRAIN_MM, wh / GRAIN_MM, 0, 0, W, H);
    }
    g.restore();
  }
  function dateStamp(fx) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fx.dateVal || '') || /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayIso());
    const [, y, mo, d] = m;
    if (fx.dateFmt === 'dot') return `${y}.${mo}.${d}`;
    if (fx.dateFmt === 'mdy') return `${mo} ${d} '${y.slice(2)}`;
    return `'${y.slice(2)} ${mo} ${d}`;
  }
  /** 日付の写し込み(オレンジに光るドットの字) */
  function drawDate(g, fx, W, H, k) {
    const t = dateStamp(fx), font = `${(2.5 * k).toFixed(2)}px "${DATE_FONT}", monospace`;
    needFont(`40px "${DATE_FONT}"`, t, () => { baseVer++; requestPaint(); });
    g.save();
    g.font = font;
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.globalCompositeOperation = 'screen';
    g.shadowColor = 'rgba(255,78,8,.95)';
    g.shadowBlur = 0.8 * k;
    g.fillStyle = '#ff7618';
    g.fillText(t, W - 2.6 * k, H - 2.4 * k);
    g.shadowBlur = 0;
    g.globalAlpha = 0.45;
    g.fillStyle = '#ffb262';
    g.fillText(t, W - 2.6 * k, H - 2.4 * k);
    g.restore();
  }

  /* ================================================================ 描く: 文字・サイン・ステッカー(位置はフィルムの左上からの mm、x・y は中心) */
  const LH = 1.2;
  const mctx = document.createElement('canvas').getContext('2d');
  function textLines(o) {
    if (o.kind === 'sign') return [[o.msg, 1], [o.name, 1.4], [o.date, 0.62]].filter((l) => String(l[0] || '').trim());
    return String(o.text || '').split('\n').map((t) => [t, 1]);
  }
  function measureText(o) {
    const lines = textLines(o).map(([t, m]) => { mctx.font = fontOf(o, o.size * m * 10); return { t, m, w: mctx.measureText(t).width / 10 }; });
    const w = Math.max(o.size * 0.6, ...lines.map((l) => l.w));
    const hh = lines.reduce((sum, l) => sum + o.size * l.m * LH, 0) || o.size * LH;
    return { lines, w, h: hh };
  }
  /* ---------- ネオン(紙は光らないので、明るい芯・濃い色の管・色のにじみ・明るい地では暗い床、の対比で光って見せる) ---------- */
  /** 今の変換で (x, y) のまわりの地の明るさ(0〜1)。描く前に測る */
  // PSD のレイヤーを 1 枚ずつ描くときは、描く先が透明なので、下に重なる絵(groundSrc)の明るさを測る
  let groundSrc = null;
  function groundLum(g, x, y) {
    try {
      const p = g.getTransform().transformPoint({ x, y }), r = 2;
      const d = (groundSrc || g).getImageData(Math.round(p.x) - r, Math.round(p.y) - r, r * 2 + 1, r * 2 + 1).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
      return n ? sum / n : 1;
    } catch (e) { return 1; }
  }
  /**
   * 影だけを描く。本体は遠くへずらして描き、影のずれで元の場所へ戻す
   * (影のずれは変換を受けないので、本体は今の変換の逆向きにずらす)
   */
  function shadowOnly(g, draw, color, blur) {
    const OFF = 20000, inv = g.getTransform().inverse();
    const a = inv.transformPoint({ x: 0, y: 0 }), b = inv.transformPoint({ x: -OFF, y: 0 });
    g.save();
    g.translate(b.x - a.x, b.y - a.y);
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.shadowOffsetX = OFF;
    g.shadowOffsetY = 0;
    draw();
    g.restore();
  }
  /**
   * ネオンの字(px = 字の大きさの画素)。床 → 外のにじみ → 内のにじみ → 管 → 芯 の順に重ねる。
   * 芯は字の中を白に寄せた色で塗りつぶし(ユーザーの希望)、縁には字の色を細く戻して管の輪郭を残す
   */
  function neonText(g, t, cy, px, col, under, script, k) {
    // 管 = 字の外側に出る色の縁。太らせると細い続け字の輪がつぶれるので細く、にじみは字の形のままぼかす
    const lw = g.measureText(t).width;
    const L = ([-0.3, 0, 0.3].reduce((sum, f) => sum + groundLum(g, lw * f, cy), 0)) / 3;
    // 明るい地では白い芯が地に溶けるので、色の縁を太く、にじみと床を濃くして芯を浮かせる
    const light = L > 0.5;
    const T = (script ? Math.max(px * 0.035, 0.2 * k) : Math.max(px * 0.06, 0.35 * k)) * (light ? 1.7 : 1);
    const shape = () => { g.fillText(t, 0, cy); if (under) { under(); g.stroke(); } };
    g.save();
    g.lineWidth = T;
    g.fillStyle = g.strokeStyle = col;
    if (light) {
      // 床は選んだ色を深くした色で薄く敷く(黒に近い影は選んだ色より目立ってしまう)。明るい色は沈むので少しだけ濃く
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = lum(col) > 0.5 ? 0.35 : 0.25;
      shadowOnly(g, shape, mix(col, '#000000', 0.4), px * 0.3);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = L < 0.35 ? 'screen' : 'source-over';
    g.shadowColor = col;
    g.globalAlpha = light ? 1 : 0.75;
    g.shadowBlur = px * 0.35;
    shape();
    if (light) shape();
    g.globalAlpha = 1;
    g.shadowBlur = px * 0.1;
    shape();
    g.globalCompositeOperation = 'source-over';
    g.shadowColor = 'transparent';
    // 管: 字の輪郭に色の縁を引く(半分は字の外へ出る)
    g.strokeText(t, 0, cy);
    if (under) { under(); g.lineWidth = T * 1.6; g.stroke(); g.lineWidth = T; }
    // 芯: 字の中をほぼ白で塗りつぶし、白くにじませて熱く見せる
    const core = mix(col, '#ffffff', 0.92);
    g.fillStyle = g.strokeStyle = core;
    g.shadowColor = 'rgba(255,255,255,.85)';
    g.shadowBlur = Math.max(1, px * 0.035);
    g.fillText(t, 0, cy);
    if (under) { under(); g.lineWidth = Math.max(T * 0.7, 0.2 * k); g.stroke(); }
    g.restore();
  }
  function drawText(g, o, k, hits) {
    const M = measureText(o);
    needFont(fontOf(o, 40), M.lines.map((l) => l.t).join(''), requestPaint);
    if (hits) hits.set(o.id, { cx: o.x, cy: o.y, w: M.w, h: M.h, rot: o.rot || 0 });
    const col = safeHex(o.color, '#1d1d22');
    const edge = o.edge === 'white' ? '#ffffff' : o.edge === 'color' ? safeHex(o.edgeColor, '#ffffff') : '';
    g.save();
    g.translate(o.x * k, o.y * k);
    g.rotate(o.rot || 0);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.miterLimit = 2;
    let y = -M.h / 2;
    for (const l of M.lines) {
      const px = o.size * l.m * k, cy = (y + o.size * l.m * LH / 2) * k;
      g.font = fontOf(o, px);
      // サインの名前には、さっと引いた下線を添える
      const under = o.kind === 'sign' && l.m > 1.2 && l.w > 0 ? () => {
        const hw = (l.w / 2) * k, by = cy + px * 0.42;
        g.beginPath();
        g.moveTo(-hw * 0.95, by + px * 0.06);
        g.quadraticCurveTo(0, by - px * 0.12, hw * 1.08, by - px * 0.08);
      } : null;
      if (edge) {
        g.strokeStyle = edge;
        g.lineWidth = px * 0.24;
        g.strokeText(l.t, 0, cy);
        if (under) { under(); g.lineWidth = px * 0.06 + px * 0.2; g.stroke(); }
      }
      if (o.edge === 'neon') neonText(g, l.t, cy, px, col, under, !!LATIN_SIGN[o.latin], k);
      else {
        g.fillStyle = col;
        g.fillText(l.t, 0, cy);
        if (under) { under(); g.strokeStyle = col; g.lineWidth = Math.max(1, px * 0.06); g.stroke(); }
      }
      y += o.size * l.m * LH;
    }
    g.restore();
  }
  function stickerRatio(o) {
    if (!String(o.ref).startsWith('img:')) return 1;
    return o.ar || 1;
  }
  function drawSticker(g, o, k, hits, shadow) {
    const w = o.size, hh = o.size / stickerRatio(o);
    if (hits) hits.set(o.id, { cx: o.x, cy: o.y, w, h: hh, rot: o.rot || 0 });
    const img = getImg(stickerSrc(o));
    if (!img) return;
    g.save();
    g.translate(o.x * k, o.y * k);
    g.rotate(o.rot || 0);
    if (shadow) {
      g.shadowColor = 'rgba(0,0,0,.26)';
      g.shadowBlur = 0.7 * k;
      g.shadowOffsetY = 0.3 * k;
    }
    g.drawImage(img, (-w / 2) * k, (-hh / 2) * k, w * k, hh * k);
    g.restore();
  }
  const showsOn = (o, side) => side === 'doodle' || o.on === 'both';
  function drawObjects(g, s, side, k, hits) {
    s.objects.forEach((o) => {
      if (!showsOn(o, side)) return;
      if (o.kind === 'sticker') drawSticker(g, o, k, hits, s.stickerShadow);
      else drawText(g, o, k, hits);
    });
  }

  /* ================================================================ 描く: 落書きの線(点の並び。描くたびに今の解像度で引き直す) */
  // 点の中点を通る 2 次曲線でなめらかにつなぐ。pts は [x, y, x, y, …] の mm
  function tracePath(g, pts, k) {
    const n = pts.length / 2;
    g.beginPath();
    g.moveTo(pts[0] * k, pts[1] * k);
    if (n === 1) { g.lineTo(pts[0] * k + 0.01, pts[1] * k); return; }
    for (let i = 1; i < n - 1; i++) {
      const x = pts[i * 2] * k, y = pts[i * 2 + 1] * k;
      g.quadraticCurveTo(x, y, (x + pts[i * 2 + 2] * k) / 2, (y + pts[i * 2 + 3] * k) / 2);
    }
    g.lineTo(pts[(n - 1) * 2] * k, pts[(n - 1) * 2 + 1] * k);
  }
  /** ラメの粒。線に沿って 0.16 mm ごとに、太さの中へ散らす */
  function sparkles(g, st, k) {
    const r = rng(hashStr(st.id)), pts = st.pts, w = st.w;
    const lt = mix(st.color, '#ffffff', 0.6);
    const dot = (x, y) => {
      for (let j = 0; j < 2; j++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.5, q = r();
        g.fillStyle = q < 0.14 ? '#ffffff' : q < 0.58 ? lt : st.color;
        g.globalAlpha = 0.65 + r() * 0.35;
        g.beginPath();
        g.arc((x + Math.cos(a) * d) * k, (y + Math.sin(a) * d) * k, (0.04 + r() * 0.09) * k, 0, Math.PI * 2);
        g.fill();
      }
    };
    const step = 0.16;
    let carry = 0;
    dot(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], dx = pts[i] - x0, dy = pts[i + 1] - y0, len = Math.hypot(dx, dy);
      let t = step - carry;
      while (t <= len) { dot(x0 + dx * t / len, y0 + dy * t / len); t += step; }
      carry = len - (t - step);
    }
    g.globalAlpha = 1;
  }
  /** 線の下の写真やフチの明るさ(線に沿って 8 か所ほどを測った平均。ground はフチと写真だけを描いた canvas) */
  function strokeGround(st, ground, k) {
    const gg = ground.getContext('2d'), n = st.pts.length / 2, step = Math.max(1, Math.floor(n / 8));
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i += step) {
      const x = Math.round(st.pts[i * 2] * k), y = Math.round(st.pts[i * 2 + 1] * k);
      if (x < 0 || y < 0 || x >= ground.width || y >= ground.height) continue;
      const d = gg.getImageData(x, y, 1, 1).data;
      sum += (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
      cnt++;
    }
    return cnt ? sum / cnt : 1;
  }
  function drawStroke(g, st, k, tmp, ground) {
    const w = st.w * k;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (st.pen === 'eraser') {
      g.globalCompositeOperation = 'destination-out';
      tracePath(g, st.pts, k);
      g.lineWidth = w;
      g.stroke();
    } else if (st.pen === 'posca') {
      // 塗料のたまりで、ふちだけほんの少し濃い
      tracePath(g, st.pts, k);
      g.strokeStyle = mix(st.color, '#000000', 0.14);
      g.lineWidth = w;
      g.stroke();
      g.strokeStyle = st.color;
      g.lineWidth = w * 0.8;
      g.stroke();
    } else if (st.pen === 'gel' || st.pen === 'white') {
      tracePath(g, st.pts, k);
      if (st.pen === 'white') { g.shadowColor = 'rgba(0,0,0,.24)'; g.shadowBlur = Math.max(1, w * 0.6); }
      g.strokeStyle = st.pen === 'white' ? '#ffffff' : st.color;
      g.lineWidth = w;
      g.stroke();
      if (st.pen === 'gel') {
        // ぷっくりした艶
        g.shadowColor = 'transparent';
        g.translate(-w * 0.16, -w * 0.16);
        tracePath(g, st.pts, k);
        g.strokeStyle = 'rgba(255,255,255,.6)';
        g.lineWidth = w * 0.28;
        g.stroke();
      }
    } else if (st.pen === 'neon') {
      // 光る管: 床(明るい地だけ) → 外のにじみ → 内のにじみ → 管 → 芯。線は別の層に描くので、床は乗算でなく暗い影を重ねる
      // 明るい地では白い芯が溶けるので、管を太く、にじみと床を濃くする
      const path = () => tracePath(g, st.pts, k);
      const light = !!ground && strokeGround(st, ground, k) > 0.5;
      if (light) {
        // 床は選んだ色を深くした色で薄く(黒に近い影は選んだ色より目立ってしまう)
        g.globalAlpha = lum(st.color) > 0.5 ? 0.3 : 0.22;
        g.lineWidth = w * 1.3;
        g.strokeStyle = '#000';
        shadowOnly(g, () => { path(); g.stroke(); }, mix(st.color, '#000000', 0.4), w * 1.3);
        g.globalAlpha = 1;
      }
      path();
      g.strokeStyle = st.color;
      g.shadowColor = st.color;
      g.lineWidth = w * (light ? 1.25 : 1);
      g.globalAlpha = light ? 0.95 : 0.55;
      g.shadowBlur = w * 2;
      g.stroke();
      if (light) g.stroke();
      g.globalAlpha = 1;
      g.shadowBlur = w * 0.6;
      g.stroke();
      g.shadowColor = 'transparent';
      g.stroke();
      g.strokeStyle = mix(st.color, '#ffffff', 0.92);
      g.shadowColor = 'rgba(255,255,255,.85)';
      g.shadowBlur = Math.max(1, w * 0.25);
      g.lineWidth = w * 0.45;
      g.stroke();
    } else if (st.pen === 'glitter') {
      tracePath(g, st.pts, k);
      g.globalAlpha = 0.55;
      g.strokeStyle = st.color;
      g.lineWidth = w;
      g.stroke();
      g.globalAlpha = 1;
      sparkles(g, st, k);
    } else if (st.pen === 'hl') {
      // 1 本の中で重なっても濃くならないように、別の canvas に引いてから半透明で重ねる
      const t = tmp.getContext('2d');
      t.clearRect(0, 0, tmp.width, tmp.height);
      t.save();
      t.lineCap = 'butt';
      t.lineJoin = 'round';
      tracePath(t, st.pts, k);
      t.strokeStyle = st.color;
      t.lineWidth = w;
      t.stroke();
      t.restore();
      g.globalAlpha = 0.45;
      g.drawImage(tmp, 0, 0);
    }
    g.restore();
  }
  // 消しゴムは両方の 1 枚に効く(「2 枚とも」の線も消せるように)
  const strokeOn = (st, side) => side === 'doodle' || st.both || st.pen === 'eraser';
  function sized(c, w, hh) {
    if (!c) c = document.createElement('canvas');
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    return c;
  }
  function renderLayer(c, s, side, k, ground) {
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const tmp = sized(cache.tmp, c.width, c.height);
    cache.tmp = tmp;
    s.strokes.forEach((st) => { if (strokeOn(st, side)) drawStroke(g, st, k, tmp, ground); });
  }

  /* ================================================================ 用紙(切り取りの目印と、書き出し) */
  function drawMarks(g, s, L, k) {
    const f = L.f, sc = L.sc, P = L.p;
    // 目印も点線の内に引く(入る余地が 0.8 mm ないところには引かない)。実寸のときはフチも点線にかかるので、用紙の端まで
    const [mt, mr, mb, ml] = s.size === 'real' ? [0, 0, 0, 0] : L.cut;
    const tick = (x1, y1, x2, y2) => {
      const ax = clamp(x2, ml, P.w - mr), ay = clamp(y2, mt, P.h - mb);
      if (Math.hypot(ax - x1, ay - y1) < 0.8 || x1 < ml || x1 > P.w - mr || y1 < mt || y1 > P.h - mb) return;
      g.moveTo(x1 * k, y1 * k);
      g.lineTo(ax * k, ay * k);
    };
    g.save();
    g.strokeStyle = lum(sheetColor(s)) > 0.4 ? '#6f7178' : '#c9cbd0';
    g.lineWidth = Math.max(1, 0.12 * k);
    // 隣の 1 枚との間の目印は、間の半分までにとどめる(間が 4 mm のときに両側の目印がぶつからないように)
    const gs = L.gap * sc, ia = Math.min(1, gs * 0.12), ib = Math.min(3.4, gs / 2 - 0.25);
    L.slots.forEach(({ i, x, y }) => {
      const w = f.w * sc, hh = f.h * sc, left = i > 0, right = i < L.slots.length - 1;
      g.beginPath();
      [y, y + hh].forEach((yy) => {
        if (left) tick(x - ia, yy, x - ib, yy); else tick(x - 1, yy, x - 3.4, yy);
        if (right) tick(x + w + ia, yy, x + w + ib, yy); else tick(x + w + 1, yy, x + w + 3.4, yy);
      });
      [x, x + w].forEach((xx) => { tick(xx, y - 1, xx, y - 3.4); tick(xx, y + hh + 1, xx, y + hh + 3.4); });
      g.stroke();
      // フチが用紙の地の色に近いときは、切る線がわかるように外形を細くなぞる
      if (!s.frame.image && Math.abs(lum(safeHex(s.frame.color, '#ffffff')) - lum(sheetColor(s))) < 0.12) {
        g.save();
        g.strokeStyle = 'rgba(0,0,0,.16)';
        g.lineWidth = Math.max(1, 0.08 * k);
        g.beginPath();
        g.roundRect(x * k, y * k, w * k, hh * k, filmR(s) * sc * k);
        g.stroke();
        g.restore();
      }
    });
    g.restore();
  }
  /** 1 枚を描く(書き出し用。画面のための覚えは使わない) */
  function drawChekiTo(g, s, side, f, k) {
    const w = Math.ceil(f.w * k), hh = Math.ceil(f.h * k);
    const base = sized(null, w, hh), lay = sized(null, w, hh);
    drawBase(base.getContext('2d'), s, f, k, 1);
    renderLayer(lay, s, side, k, base);
    g.save();
    g.beginPath();
    g.roundRect(0, 0, f.w * k, f.h * k, filmR(s) * k);
    g.clip();
    g.drawImage(base, 0, 0);
    drawObjects(g, s, side, k, null);
    g.drawImage(lay, 0, 0);
    g.restore();
  }
  /** 書き出す前に、書体と画像がそろうのを待つ */
  async function ready() {
    const s = ed.state, L = layout(s), jobs = [], srcs = [s.frame.image];
    for (let i = 0; i < L.cards; i++) {
      const v = cardView(s, i);
      if (document.fonts) {
        v.objects.forEach((o) => { if (o.kind !== 'sticker') jobs.push(document.fonts.load(fontOf(o, 40), textLines(o).map((l) => l[0]).join('') || 'a')); });
        if (s.fx.date && v.photo) jobs.push(document.fonts.load(`40px "${DATE_FONT}"`, dateStamp(s.fx)));
      }
      srcs.push(v.photo && v.photo.src);
      v.objects.forEach((o) => { if (o.kind === 'sticker') srcs.push(stickerSrc(o)); });
    }
    srcs.filter(Boolean).forEach((src) => jobs.push(loadImg(src)));
    await Promise.all(jobs.map((p) => Promise.resolve(p).catch(() => null)));
  }
  async function sheetCanvas(k) {
    await ready();
    const s = ed.state, L = layout(s);
    const c = sized(null, Math.round(L.p.w * k), Math.round(L.p.h * k)), g = c.getContext('2d');
    g.fillStyle = sheetColor(s);
    g.fillRect(0, 0, c.width, c.height);
    L.slots.forEach((sl) => {
      g.save();
      g.translate(sl.x * k, sl.y * k);
      drawChekiTo(g, cardView(s, sl.card), sl.side, L.f, k * L.sc);
      g.restore();
    });
    if (s.marks) drawMarks(g, s, L, k);
    return c;
  }
  /** 選んでいるカードの 1 枚(side = plain そのまま / doodle 落書き) */
  async function chekiCanvas(side, k) {
    await ready();
    const s = ed.state, f = film(s);
    const c = sized(null, Math.round(f.w * k), Math.round(f.h * k));
    drawChekiTo(c.getContext('2d'), cardView(s, view.card), side, f, k);
    return c;
  }

  /* ================================================================ PSD(1 枚ごとのグループに、フチ・写真・文字やステッカー・線をレイヤーで分ける) */
  // PSD の書き出しは ag-psd(MIT)を jsDelivr から、使うときに読み込む
  const PSD_URL = 'https://cdn.jsdelivr.net/npm/ag-psd@34.1.0/dist/bundle.js';
  let psdPromise = null;
  function loadPsdLib() {
    if (window.agPsd) return Promise.resolve(window.agPsd);
    if (!psdPromise) {
      psdPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = PSD_URL;
        sc.onload = () => (window.agPsd ? resolve(window.agPsd) : reject(new Error('PSD を作る部品を読み込めませんでした')));
        sc.onerror = () => { psdPromise = null; reject(new Error('PSD を作る部品を読み込めませんでした。通信を確かめてください')); };
        document.head.append(sc);
      });
    }
    return psdPromise;
  }
  const objLabel = (o) => (o.kind === 'sticker'
    ? `ステッカー（${String(o.ref).startsWith('img:') ? '自分の画像' : (STICKERS[o.ref] || {}).label || ''}）`
    : o.kind === 'sign' ? `サイン「${String(o.name || o.msg || '').trim()}」` : `文字「${String(o.text || '').split('\n')[0].trim().slice(0, 16)}」`);
  async function psdBlob() {
    await ready();
    const lib = await loadPsdLib();
    const s = ed.state, L = layout(s), f = L.f, k = EXPORT_K, kk = k * L.sc;
    const W = Math.round(L.p.w * k), H = Math.round(L.p.h * k), cw = Math.ceil(f.w * kk), ch = Math.ceil(f.h * kk);
    // 1 枚の大きさの透明な canvas に、フチの角の形で切り抜いて描く
    const clipped = (draw) => {
      const c = sized(null, cw, ch), g = c.getContext('2d');
      g.save();
      g.beginPath();
      g.roundRect(0, 0, f.w * kk, f.h * kk, filmR(s) * kk);
      g.clip();
      draw(g);
      g.restore();
      return c;
    };
    const paper = sized(null, W, H), pg = paper.getContext('2d');
    pg.fillStyle = sheetColor(s);
    pg.fillRect(0, 0, W, H);
    const children = [{ name: '用紙の地', canvas: paper, top: 0, left: 0 }];
    L.slots.forEach((sl) => {
      const v = cardView(s, sl.card), at = (name, canvas) => ({ name, canvas, top: Math.round(sl.y * k), left: Math.round(sl.x * k) });
      const frame = clipped((g) => drawFrame(g, v, f, kk));
      const photo = clipped((g) => drawPhotoPart(g, v, f, kk, 1));
      const base = sized(null, cw, ch), bg = base.getContext('2d');
      bg.drawImage(frame, 0, 0);
      bg.drawImage(photo, 0, 0);
      // ネオンの字は下の明るさで描き方を変えるので、下から順に重ねた絵(under)を作りながら 1 つずつ描く
      const under = sized(null, cw, ch), ug = under.getContext('2d');
      ug.drawImage(base, 0, 0);
      const items = [];
      v.objects.forEach((o) => {
        if (!showsOn(o, sl.side)) return;
        groundSrc = ug;
        const c = clipped((g) => (o.kind === 'sticker' ? drawSticker(g, o, kk, null, s.stickerShadow) : drawText(g, o, kk, null)));
        groundSrc = null;
        ug.drawImage(c, 0, 0);
        items.push(at(objLabel(o), c));
      });
      const lines = sized(null, cw, ch);
      renderLayer(lines, v, sl.side, kk, base);
      const name = L.each ? `${sl.i + 1} 枚目` : `${L.cards > 1 ? `${sl.card + 1}・` : ''}${sl.side === 'plain' ? 'そのまま' : '落書き'}`;
      children.push({ name, opened: true, children: [at('フチ', frame), at('写真', photo), ...items, at('落書きの線', clipped((g) => g.drawImage(lines, 0, 0)))] });
    });
    if (s.marks) {
      const m = sized(null, W, H);
      drawMarks(m.getContext('2d'), s, L, k);
      children.push({ name: '切り取りの目印', canvas: m, top: 0, left: 0 });
    }
    const res = { horizontalResolution: EXPORT_DPI, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches', verticalResolution: EXPORT_DPI, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' };
    const buf = lib.writePsd({ width: W, height: H, canvas: await sheetCanvas(k), imageResources: { resolutionInfo: res }, children },
      { trimImageData: true, generateThumbnail: true, noBackground: true });
    return new Blob([buf], { type: 'image/vnd.adobe.photoshop' });
  }

  /* ================================================================ 試し刷り(お店でどれだけ拡大され、どこが切れるかを測る画像) */
  const TEST_SQ = 40;   // 中央の四角の 1 辺(mm)
  function testSheetCanvas(paperId) {
    const p = PAPERS[paperId], k = EXPORT_K, mm = (v) => v * k;
    const c = sized(null, Math.round(p.w * k), Math.round(p.h * k)), g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = g.fillStyle = '#1d1d22';
    g.lineWidth = Math.max(1, mm(0.12));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `600 ${mm(1.5)}px system-ui, sans-serif`;
    // 端から内へ 0〜10 mm の目盛りを、辺ごとに 3 か所。いちばん外に見えている数字が、その辺で切れた幅
    // 1 mm ごとに地の色を変えた帯と目盛り。数字は詰まらないように、目盛りの両側へ交互に置く
    const ruler = (x, y, dx, dy) => {
      const ax = -dy, ay = dx;
      for (let i = 0; i < 10; i++) {
        const bx = x + dx * i, by = y + dy * i;
        const x1 = bx - ax * 1.2, y1 = by - ay * 1.2, x2 = bx + dx + ax * 1.2, y2 = by + dy + ay * 1.2;
        g.fillStyle = i % 2 ? '#ffffff' : '#dcdce2';
        g.fillRect(mm(Math.min(x1, x2)), mm(Math.min(y1, y2)), mm(Math.abs(x2 - x1)), mm(Math.abs(y2 - y1)));
      }
      g.fillStyle = '#1d1d22';
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const len = i % 5 ? 1.2 : 1.9, px = x + dx * i, py = y + dy * i;
        g.moveTo(mm(px - ax * len), mm(py - ay * len));
        g.lineTo(mm(px + ax * len), mm(py + ay * len));
      }
      g.stroke();
      for (let i = 1; i <= 10; i++) {
        const side = i % 2 ? -1 : 1;
        g.fillText(String(i), mm(x + dx * i + ax * 3.1 * side), mm(y + dy * i + ay * 3.1 * side));
      }
    };
    [0.2, 0.5, 0.8].forEach((t) => { ruler(p.w * t, 0, 0, 1); ruler(p.w * t, p.h, 0, -1); ruler(0, p.h * t, 1, 0); ruler(p.w, p.h * t, -1, 0); });
    // 中央の四角(定規で 1 辺を測ると、刷ったときの拡大がわかる)
    const sx = p.w * 0.32 - TEST_SQ / 2, sy = p.h * 0.58 - TEST_SQ / 2;
    g.lineWidth = Math.max(1, mm(0.15));
    g.strokeRect(mm(sx), mm(sy), mm(TEST_SQ), mm(TEST_SQ));
    g.beginPath();
    for (let i = 10; i < TEST_SQ; i += 10) {
      g.moveTo(mm(sx + i), mm(sy)); g.lineTo(mm(sx + i), mm(sy + 1.5));
      g.moveTo(mm(sx + i), mm(sy + TEST_SQ)); g.lineTo(mm(sx + i), mm(sy + TEST_SQ - 1.5));
      g.moveTo(mm(sx), mm(sy + i)); g.lineTo(mm(sx + 1.5), mm(sy + i));
      g.moveTo(mm(sx + TEST_SQ), mm(sy + i)); g.lineTo(mm(sx + TEST_SQ - 1.5), mm(sy + i));
    }
    g.moveTo(mm(sx + TEST_SQ / 2 - 3), mm(sy + TEST_SQ / 2)); g.lineTo(mm(sx + TEST_SQ / 2 + 3), mm(sy + TEST_SQ / 2));
    g.moveTo(mm(sx + TEST_SQ / 2), mm(sy + TEST_SQ / 2 - 3)); g.lineTo(mm(sx + TEST_SQ / 2), mm(sy + TEST_SQ / 2 + 3));
    g.stroke();
    g.font = `600 ${mm(2.6)}px system-ui, sans-serif`;
    g.fillText(`${TEST_SQ} mm`, mm(sx + TEST_SQ / 2), mm(sy + TEST_SQ / 2 + 6));
    // 説明
    g.textAlign = 'left';
    g.font = `700 ${mm(2.4)}px system-ui, sans-serif`;
    g.fillText(`usersnap の試し刷り（${p.label} ${p.size}）`, mm(14), mm(14));
    g.font = `500 ${mm(1.8)}px system-ui, sans-serif`;
    g.fillText('1. 四辺の目盛りで、いちばん外に見えている数字を読みます。その辺で切れた幅（mm）のめやすです。', mm(14), mm(18.2));
    g.fillText(`2. 中央の四角の 1 辺を定規で測ります。画像では ${TEST_SQ} mm です。`, mm(14), mm(21.4));
    // 色の見え方: 灰色の 11 段と、ネオンのペン(白い地・暗い地)
    const x0 = p.w * 0.6, x1 = p.w - 15, cw = (x1 - x0) / 11, y0 = p.h * 0.34;
    for (let i = 0; i <= 10; i++) { const v = Math.round(255 * (1 - i / 10)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(mm(x0 + cw * i), mm(y0), mm(cw), mm(5)); }
    g.strokeStyle = '#9a9aa0';
    g.lineWidth = Math.max(1, mm(0.08));
    g.strokeRect(mm(x0), mm(y0), mm(cw * 11), mm(5));
    const dark = y0 + 17;
    g.fillStyle = '#1f1d22';
    g.fillRect(mm(x0), mm(dark), mm(x1 - x0), mm(10));
    const neon = PENS.neon.colors, nw = (x1 - x0) / neon.length;
    neon.forEach((col, i) => {
      const x = x0 + nw * (i + 0.5);
      [[y0 + 8.5, y0 + 14], [dark + 2.2, dark + 7.8]].forEach(([ya, yb], j) => drawStroke(g, { id: 't' + i + j, pen: 'neon', color: col, w: 1, both: false, pts: [x, ya, x, yb] }, k, null, c));
    });
    return c;
  }

  /* ================================================================ Ed(保存・ファイル) */
  // 描くのは canvas なので、Ed の描き直し(render)と縮小は使わない。mount は画面に出さない
  const cfg = { app: 'usersnap', version: 1, width: 1, defaults, migrate, render: () => h('div'), mount: h('div') };
  const ed = Ed.create(cfg);
  let baseVer = 0, strokeVer = 0;
  const baseSet = ed.set;
  ed.set = (p, v) => { baseSet(p, v); baseVer++; requestPaint(); };
  // ファイルから読み込んだとき・最初に戻したとき
  ed.rerender = () => {
    view.sel = null;
    hist.undo.length = 0;
    hist.redo.length = 0;
    baseVer++;
    strokeVer++;
    renderTools();
    renderPanel();
    fitStage();
  };
  const touch = () => { ed.dirty(); requestPaint(); };

  /* ================================================================ 作業台 */
  // card = 選んでいるカード(写真・文字・線を直す相手)、slot = 選んだ物の枠を出す置き場所
  const view = { pxmm: 4, mode: 'move', sel: null, card: 0, slot: 1, real: readJson(VIEW_KEY) === 'real' };
  const cache = { bases: {}, baseKeys: {}, layers: {}, layerKey: {}, work: {}, tmp: null };
  const hits = new Map();   // カードの番号 → (物の id → 当たりの範囲 { cx, cy, w, h, rot }(フィルムの mm))
  const hitsOf = (c) => { if (!hits.has(c)) hits.set(c, new Map()); return hits.get(c); };
  const cur = () => cardAt(ed.state, view.card) || ed.state;
  let live = null;          // 描いている途中の線(card つき)
  let dev = null;           // 現像の演出 { t0, cards }
  const DEV_MS = 3600;
  const paperEl = $('paper'), cv = $('sheet'), mount = $('mount'), stage = $('stage');
  let raf = 0;
  function requestPaint() { if (!raf) raf = requestAnimationFrame(paint); }
  function devAmount(c) {
    if (!dev || !dev.cards.has(c)) return 1;
    const t = (performance.now() - dev.t0) / DEV_MS;
    if (t >= 1) { dev = null; baseVer++; return 1; }
    return t * t * (3 - 2 * t);
  }
  function layerFor(sl, v, w, hh, kk) {
    // ネオンの線は下の明るさで床を敷くか決めるので、写真やフチが変わったときも描き直す
    const key = [strokeVer, w, hh, kk, sl.card, sl.side, v.strokes.some((x) => x.pen === 'neon') ? baseVer : 0].join('|');
    let c = cache.layers[sl.i];
    if (!c || cache.layerKey[sl.i] !== key) {
      c = cache.layers[sl.i] = sized(c, w, hh);
      renderLayer(c, v, sl.side, kk, cache.bases[sl.card]);
      cache.layerKey[sl.i] = key;
    }
    if (live && live.card === sl.card && strokeOn(live, sl.side)) {
      const wk = cache.work[sl.i] = sized(cache.work[sl.i], w, hh), wg = wk.getContext('2d');
      wg.clearRect(0, 0, w, hh);
      wg.drawImage(c, 0, 0);
      cache.tmp = sized(cache.tmp, w, hh);
      drawStroke(wg, live, kk, cache.tmp, cache.bases[sl.card]);
      return wk;
    }
    return c;
  }
  function paint() {
    raf = 0;
    const s = ed.state, L = layout(s), f = L.f;
    const k = cv.width / L.p.w, kk = k * L.sc;
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = sheetColor(s);
    g.fillRect(0, 0, cv.width, cv.height);
    const bw = Math.ceil(f.w * kk), bh = Math.ceil(f.h * kk);
    let anim = false;
    // フチと写真はカードごとに 1 度だけ描き、そのカードの置き場所で使い回す
    for (let c = 0; c < L.cards; c++) {
      const e = devAmount(c), key = [baseVer, bw, bh, kk, s.film].join('|');
      if (e < 1) anim = true;
      if (!cache.bases[c] || cache.baseKeys[c] !== key || e < 1) {
        const b = cache.bases[c] = sized(cache.bases[c], bw, bh), bg = b.getContext('2d');
        bg.setTransform(1, 0, 0, 1, 0, 0);
        bg.clearRect(0, 0, bw, bh);
        drawBase(bg, cardView(s, c), f, kk, e);
        cache.baseKeys[c] = e < 1 ? '' : key;
      }
    }
    hits.clear();
    L.slots.forEach((sl) => {
      const v = cardView(s, sl.card);
      g.save();
      g.translate(sl.x * k, sl.y * k);
      g.beginPath();
      g.roundRect(0, 0, f.w * kk, f.h * kk, filmR(s) * kk);
      g.clip();
      g.drawImage(cache.bases[sl.card], 0, 0);
      drawObjects(g, v, sl.side, kk, hitsOf(sl.card));
      g.drawImage(layerFor(sl, v, bw, bh, kk), 0, 0);
      g.restore();
    });
    if (s.marks) drawMarks(g, s, L, k);
    placeOverlay(L);
    if (anim) requestPaint();
  }

  /* ---------- 用紙の大きさ(作業台に収まる最大。狭い画面では幅で決める) ---------- */
  const PAD = { x: 18, y: 66 };
  function fitStage() {
    const s = ed.state, L = layout(s);
    // 並べ方で要るカードをそろえ、選んでいるカードが並びの外に出たら 1 枚目へ
    const before = s.cards.length;
    ensureCards(s, L.cards);
    if (s.cards.length !== before) ed.dirty();
    if (view.card >= L.cards) { view.card = 0; view.sel = null; }
    const narrow = matchMedia('(max-width: 920px)').matches;
    const aw = mount.clientWidth - PAD.x * 2;
    const ah = narrow ? window.innerHeight * 0.7 : mount.clientHeight - PAD.y;
    // 実寸で見るときは、画面の 1 mm に合わせた大きさ(作業台からはみ出すときは中をスクロールする)
    const pxmm = view.real ? mmPx() : Math.max(1, Math.min(aw / L.p.w, ah / L.p.h));
    stage.classList.toggle('is-real', view.real);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(L.p.w * pxmm), hh = Math.floor(L.p.h * pxmm);
    view.pxmm = w / L.p.w;
    paperEl.style.width = w + 'px';
    paperEl.style.height = hh + 'px';
    const cw = Math.round(w * dpr), ch = Math.round(hh * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const ps = printedScale(L);
    plabel.textContent = `${L.p.label}（${L.p.size}）・${ps > 0.995 ? '実寸' : Math.round(ps * 100) + '%'}${L.pr.measured ? '・試し刷りに合わせ済み' : ''}`;
    paint();
  }
  new ResizeObserver(() => fitStage()).observe(mount);

  /* ---------- 画面だけの重ね(切れる範囲の点線・写真の案内・1 枚ごとの名前・選んだ物の枠) ---------- */
  const cutEl = $('cut'), selEl = $('sel'), selBar = $('selbar'), handle = $('selHandle');
  const plabel = h('span.snp-plabel');
  const legend = h('span.snp-legend', h('i'), '点線の外は刷ると切れることがあります');
  const empties = [], caps = [];
  paperEl.append(plabel, legend);
  function placeOverlay(L) {
    const s = ed.state, px = view.pxmm, f = L.f, sc = L.sc, [wx, wy, ww, wh] = f.win, each = L.each;
    cutEl.style.inset = L.cut.map((v) => v * px + 'px').join(' ');
    while (empties.length < L.slots.length) {
      const e = h('div.snp-empty', icon('image', 22), h('b', '写真を入れる'), h('small', '押して選ぶか、ここへドラッグ')), c = h('span.snp-cap');
      empties.push(e);
      caps.push(c);
      paperEl.append(e, c);
    }
    empties.forEach((e, i) => { if (i >= L.slots.length) { e.hidden = true; caps[i].hidden = true; } });
    L.slots.forEach((sl) => {
      const v = cardView(s, sl.card), el = empties[sl.i], cap = caps[sl.i];
      el.hidden = !!(v.photo && v.photo.src);
      Object.assign(el.style, { left: (sl.x + wx * sc) * px + 'px', top: (sl.y + wy * sc) * px + 'px', width: ww * sc * px + 'px', height: wh * sc * px + 'px' });
      const name = each ? `${sl.i + 1} 枚目` : sl.side === 'plain' ? 'そのまま' : '落書き';
      cap.hidden = false;
      cap.textContent = !each && L.cards > 1 ? `${sl.card + 1}・${name}` : name;
      cap.classList.toggle('is-cur', L.cards > 1 && sl.card === view.card);
      Object.assign(cap.style, { left: (sl.x + (f.w * sc) / 2) * px + 'px', top: (sl.y + f.h * sc) * px + 5 + 'px' });
    });
    placeSel(L);
  }
  const selObj = () => (view.sel ? cur().objects.find((o) => o.id === view.sel) || null : null);
  function placeSel(L) {
    const o = selObj(), b = o && hitsOf(view.card).get(o.id);
    if (!o || !b || view.mode !== 'move' || live) { selEl.hidden = true; selBar.hidden = true; return; }
    let sl = L.slots[view.slot];
    if (!sl || sl.card !== view.card || !showsOn(o, sl.side)) sl = L.slots.find((x) => x.card === view.card && showsOn(o, x.side));
    if (!sl) { selEl.hidden = true; selBar.hidden = true; return; }
    const px = view.pxmm, sc = L.sc;
    const cx = (sl.x + b.cx * sc) * px, cy = (sl.y + b.cy * sc) * px;
    const w = b.w * sc * px + 14, hh = b.h * sc * px + 12;
    Object.assign(selEl.style, { left: cx + 'px', top: cy + 'px', width: w + 'px', height: hh + 'px', transform: `translate(-50%,-50%) rotate(${b.rot}rad)` });
    selEl.hidden = false;
    // 操作の帯は枠の上に置く(上が狭いときは下)
    const r = Math.hypot(w, hh) / 2;
    const below = cy - r < 46;
    Object.assign(selBar.style, { left: clamp(cx, 90, paperEl.clientWidth - 90) + 'px', top: (below ? cy + r + 8 : cy - r - 8) + 'px', transform: below ? 'translateX(-50%)' : 'translate(-50%,-100%)' });
    selBar.hidden = false;
    renderSelBar(o);
  }
  let selBarFor = '';
  function renderSelBar(o) {
    const each = isEach(ed.state), key = o.id + '|' + o.on + '|' + each;
    if (selBarFor === key) return;
    selBarFor = key;
    const b = (label, ic, fn, o2) => h('button', Object.assign({ type: 'button', onclick: fn }, o2 || {}), ic && icon(ic, 14), label);
    selBar.replaceChildren(
      !each && b('左にも出す', null, () => setOn(o, o.on === 'both' ? 'doodle' : 'both'), { 'aria-pressed': String(o.on === 'both'), title: '「そのまま」の 1 枚にも出すかどうかを切り替えます' }),
      b('前へ', 'up', () => toFront(o), { title: 'いちばん前に出します' }),
      o.kind !== 'sign' && b('複製', 'copy', () => duplicate(o)),
      b('削除', 'trash', () => removeObj(o), { class: 'danger' }));
  }

  /* ---------- 選んでいるカード ---------- */
  function setCard(c) {
    if (view.card === c) return;
    view.card = c;
    view.sel = null;
    selBarFor = '';
    renderPanel();
    requestPaint();
  }

  /* ---------- 物の操作 ---------- */
  function select(o, slot, panel) {
    const id = o ? o.id : null;
    if (slot != null) view.slot = slot;
    if (view.sel === id) { requestPaint(); return; }
    view.sel = id;
    selBarFor = '';
    if (panel !== false) {
      renderPanel();
      const ed0 = o && sideBody.querySelector('.snp-editor');
      if (ed0 && matchMedia('(min-width: 921px)').matches) ed0.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    requestPaint();
  }
  function setOn(o, on) { remember(); o.on = on; selBarFor = ''; touch(); renderPanel(); }
  function toFront(o) { remember(); const a = cur().objects; a.splice(a.indexOf(o), 1); a.push(o); touch(); }
  function duplicate(o) {
    remember();
    const c = Object.assign({}, o, { id: U.uid(), x: o.x + 3, y: o.y + 3 });
    cur().objects.push(c);
    select(c);
    touch();
  }
  function removeObj(o) {
    remember();
    const a = cur().objects;
    a.splice(a.indexOf(o), 1);
    view.sel = null;
    touch();
    renderPanel();
  }
  /** p = toLocal の結果。その置き場所に見えている物のうち、いちばん上のもの */
  function hitTest(p) {
    const c = cardAt(ed.state, p.card), hs = hitsOf(p.card);
    if (!c) return null;
    for (let i = c.objects.length - 1; i >= 0; i--) {
      const o = c.objects[i], b = hs.get(o.id);
      if (!b || !showsOn(o, p.side)) continue;
      const dx = p.x - b.cx, dy = p.y - b.cy, co = Math.cos(-b.rot), sn = Math.sin(-b.rot);
      const lx = dx * co - dy * sn, ly = dx * sn + dy * co;
      if (Math.abs(lx) <= b.w / 2 + 1 && Math.abs(ly) <= b.h / 2 + 1) return o;
    }
    return null;
  }

  /* ---------- 元に戻す・やり直す(どのカードの物と線も。線は描いたあと書き換えないので、並びの写しで足りる) ---------- */
  const hist = { undo: [], redo: [] };
  const snapCard = (c) => ({ objects: JSON.parse(JSON.stringify(c.objects)), strokes: c.strokes.slice() });
  const snap = () => ({ main: snapCard(ed.state), cards: ed.state.cards.map(snapCard) });
  function remember() {
    hist.undo.push(snap());
    if (hist.undo.length > 80) hist.undo.shift();
    hist.redo.length = 0;
    syncHist();
  }
  function restore(d) {
    const s = ed.state;
    s.objects = d.main.objects;
    s.strokes = d.main.strokes;
    d.cards.forEach((c, i) => { if (s.cards[i]) { s.cards[i].objects = c.objects; s.cards[i].strokes = c.strokes; } });
    strokeVer++;
    if (!selObj()) view.sel = null;
    selBarFor = '';
    touch();
    renderPanel();
    syncHist();
  }
  function undo() { if (!hist.undo.length) return; hist.redo.push(snap()); restore(hist.undo.pop()); }
  function redo() { if (!hist.redo.length) return; hist.undo.push(snap()); restore(hist.redo.pop()); }

  /* ---------- 指・マウス ---------- */
  /** 画面の位置 → 置き場所とフィルムの mm。force で置き場所を決められる(ドラッグの途中で別の 1 枚へ移らないように) */
  function toLocal(e, force) {
    const r = cv.getBoundingClientRect(), L = layout(ed.state), f = L.f;
    const mx = ((e.clientX - r.left) / r.width) * L.p.w, my = ((e.clientY - r.top) / r.height) * L.p.h;
    let sl = force != null ? L.slots[force] : null;
    if (!sl) {
      // 指の下の 1 枚(間にいるときは近いほう)
      let best = Infinity;
      L.slots.forEach((x) => {
        const d = Math.max(Math.abs(mx - (x.x + (f.w * L.sc) / 2)) / (f.w * L.sc), Math.abs(my - (x.y + (f.h * L.sc) / 2)) / (f.h * L.sc));
        if (d < best) { best = d; sl = x; }
      });
    }
    return { slot: sl.i, card: sl.card, side: sl.side, x: (mx - sl.x) / L.sc, y: (my - sl.y) / L.sc, L };
  }
  const inWin = (p) => { const [wx, wy, ww, wh] = p.L.f.win; return p.x >= wx && p.x <= wx + ww && p.y >= wy && p.y <= wy + wh; };
  let gest = null;
  let warnedPlain = false;
  cv.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const s = ed.state, p = toLocal(e);
    setCard(p.card);
    if (view.mode === 'pen') {
      if (p.side !== 'doodle') {
        if (!warnedPlain) U.toast('落書きは右の 1 枚に描きます');
        warnedPlain = true;
        return;
      }
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
      const tool = s.pen.tool;
      live = { id: U.uid(), pen: tool, color: penColor(s, tool), w: s.pen.w[tool], both: !!s.pen.both && tool !== 'eraser' && !p.L.each, pts: [r2(p.x), r2(p.y)], card: p.card };
      gest = { type: 'draw', id: e.pointerId, slot: p.slot };
      requestPaint();
      return;
    }
    const o = hitTest(p), c = cur();
    if (o) {
      e.preventDefault();
      select(o, p.slot);
      remember();
      gest = { type: 'obj', id: e.pointerId, slot: p.slot, o, sx: p.x, sy: p.y, x0: o.x, y0: o.y, moved: false };
    } else {
      select(null);
      if (inWin(p) && c.photo && c.photo.src) {
        const [, , ww, wh] = p.L.f.win;
        gest = { type: 'photo', id: e.pointerId, slot: p.slot, photo: c.photo, sx: p.x, sy: p.y, x0: c.photo.x || 0, y0: c.photo.y || 0, ww, wh };
      } else if (inWin(p)) gest = { type: 'pick', id: e.pointerId, cx: e.clientX, cy: e.clientY };
      else return;
    }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!gest || e.pointerId !== gest.id) return;
    if (gest.type === 'draw') {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach((ev) => {
        const p = toLocal(ev, gest.slot), n = live.pts.length;
        if (Math.hypot(p.x - live.pts[n - 2], p.y - live.pts[n - 1]) >= 0.08) live.pts.push(r2(p.x), r2(p.y));
      });
      requestPaint();
    } else if (gest.type === 'obj') {
      const p = toLocal(e, gest.slot), f = p.L.f;
      if (!gest.moved && Math.hypot(p.x - gest.sx, p.y - gest.sy) < 0.6) return;
      gest.moved = true;
      gest.o.x = r2(clamp(gest.x0 + p.x - gest.sx, -4, f.w + 4));
      gest.o.y = r2(clamp(gest.y0 + p.y - gest.sy, -4, f.h + 4));
      requestPaint();
    } else if (gest.type === 'photo') {
      const p = toLocal(e, gest.slot), ph = gest.photo;
      ph.x = gest.x0 + (p.x - gest.sx) / gest.ww;
      ph.y = gest.y0 + (p.y - gest.sy) / gest.wh;
      clampPhoto(ph, gest.ww / gest.wh);
      baseVer++;
      requestPaint();
    } else if (gest.type === 'pick' && Math.hypot(e.clientX - gest.cx, e.clientY - gest.cy) > 6) gest = null;
  });
  function endGest(e, cancel) {
    if (!gest || e.pointerId !== gest.id) return;
    const g0 = gest;
    gest = null;
    if (g0.type === 'draw') {
      const st = live, card = st && cardAt(ed.state, st.card);
      live = null;
      if (!cancel && st && card) {
        remember();
        delete st.card;
        card.strokes.push(st);
        strokeVer++;
        ed.dirty();
      }
      requestPaint();
    } else if (g0.type === 'obj') {
      if (!g0.moved) { hist.undo.pop(); syncHist(); } else ed.dirty();
    } else if (g0.type === 'photo') { ed.dirty(); syncPhotoInputs(); }
    else if (g0.type === 'pick' && !cancel) photoIn.click();
  }
  cv.addEventListener('pointerup', (e) => endGest(e, false));
  cv.addEventListener('pointercancel', (e) => endGest(e, true));
  cv.addEventListener('dblclick', (e) => {
    const p = toLocal(e), o = view.mode === 'move' && hitTest(p);
    if (!o || o.kind === 'sticker') return;
    const box = sideBody.querySelector('.snp-editor textarea, .snp-editor input[type=text]');
    if (box) box.focus();
  });
  cv.addEventListener('wheel', (e) => {
    const p = toLocal(e), o = selObj();
    if (view.mode === 'move' && o && p.card === view.card && hitTest(p) === o) {
      e.preventDefault();
      o.size = r2(clamp(o.size * Math.exp(-e.deltaY * 0.0015), ...SIZE[o.kind]));
      touch();
      return;
    }
    const c = cardAt(ed.state, p.card), ph = c && c.photo;
    if (!ph || !ph.src || !inWin(p)) return;
    e.preventDefault();
    setCard(p.card);
    ph.zoom = clamp((ph.zoom || 1) * Math.exp(-e.deltaY * 0.0015), 1, 6);
    const [, , ww, wh] = p.L.f.win;
    clampPhoto(ph, ww / wh);
    baseVer++;
    touch();
    syncPhotoInputs();
  }, { passive: false });

  /* ---------- 枠の角の丸: 大きさと向き ---------- */
  let rs = null;
  handle.addEventListener('pointerdown', (e) => {
    const o = selObj();
    if (!o) return;
    e.preventDefault();
    e.stopPropagation();
    const r = selEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    remember();
    rs = { id: e.pointerId, o, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, size0: o.size, rot0: o.rot || 0 };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
  });
  handle.addEventListener('pointermove', (e) => {
    if (!rs || e.pointerId !== rs.id) return;
    let rot = rs.rot0 + Math.atan2(e.clientY - rs.cy, e.clientX - rs.cx) - rs.a0;
    const deg = (((rot * 180) / Math.PI) % 360 + 540) % 360 - 180;
    if (Math.abs(deg) < 4) rot = 0;   // まっすぐの近くでは吸いつける
    rs.o.rot = Math.round(rot * 1000) / 1000;
    rs.o.size = r2(clamp(rs.size0 * Math.hypot(e.clientX - rs.cx, e.clientY - rs.cy) / rs.d0, ...SIZE[rs.o.kind]));
    requestPaint();
  });
  const endRs = (e) => { if (!rs || e.pointerId !== rs.id) return; rs = null; ed.dirty(); syncSizeInputs(); };
  handle.addEventListener('pointerup', endRs);
  handle.addEventListener('pointercancel', endRs);
  function syncSizeInputs() {
    const o = selObj(), el = o && sideBody.querySelector('.snp-editor input[data-size]');
    if (el) { el.value = o.size; el.dispatchEvent(new Event('sync')); }
  }

  /* ---------- キー・貼り付け・ドラッグで写真 ---------- */
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,select,[contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (mod && key === 'y') { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selObj()) { e.preventDefault(); removeObj(selObj()); }
    else if (e.key === 'Escape' && selObj()) select(null);
  });
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('input,textarea,[contenteditable]')) return;
    const f = U.imageFromPaste(e);
    if (f) { e.preventDefault(); setPhotos([f]); }
  });
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('is-over'); });
  stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('is-over'); });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('is-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length) setPhotos(e.dataTransfer.files);
  });
  const photoIn = $('photoIn');
  photoIn.addEventListener('change', () => { const fs = Array.from(photoIn.files); photoIn.value = ''; if (fs.length) setPhotos(fs); });
  function startDev(cards) { dev = { t0: performance.now(), cards: new Set(cards) }; requestPaint(); }
  /** カード c に写真を入れる(古い写真の画像の覚えは捨てる) */
  function putPhoto(p, c) {
    const card = cardAt(ed.state, c);
    if (!card) return;
    const old = card.photo;
    if (old && old.src && old.src !== p.src) imgs.delete(old.src);
    card.photo = p;
    baseVer++;
  }
  /**
   * 写真を、選んでいるカードから順に入れる(複数を選べる)。
   * 並びに入りきらない分は入れずに知らせる
   */
  async function setPhotos(files) {
    const list = Array.from(files || []).filter((f) => f && f.type && f.type.startsWith('image/'));
    if (!list.length) return U.toast('画像ファイルを選んでください', 'error');
    const s = ed.state, L = layout(s);
    ensureCards(s, L.cards);
    const room = L.cards - view.card, done = [];
    for (const f of list.slice(0, room)) {
      try {
        // 刷ったときに粗くならないよう、長い辺 2400px まで残す
        const src = await U.fileToDataUrl(f, 2400, 'image/jpeg');
        const img = await loadImg(src);
        const c = view.card + done.length;
        putPhoto({ src, w: img.naturalWidth, h: img.naturalHeight, x: 0, y: 0, zoom: 1 }, c);
        done.push(c);
      } catch (err) { U.toast('画像を読み込めませんでした', 'error'); }
    }
    if (!done.length) return;
    ed.dirty();
    renderPanel();
    startDev(done);
    if (list.length > room) {
      const more = s.paper === '2L' && !L.tiled ? '2L 判に 3 枚を並べるか、並べ方を「別々の写真」にすると、もっと入ります。'
        : !L.each ? '並べ方を「別々の写真」にすると、もっと入ります。' : '';
      U.toast(`${list.length} 枚のうち ${done.length} 枚を入れました。${more}`);
    } else if (done.length > 1) U.toast(`${done.length} 枚の写真を ${view.card + 1} 枚目から順に入れました`);
  }
  async function fromProf() {
    const r = await Ed.pickUserprof();
    if (!r) return;
    const name = ((r.user.partners || [])[0] || '').trim();
    const sign = cur().objects.find((o) => o.kind === 'sign');
    if (name && sign) { remember(); sign.name = name; }
    if (r.image) {
      await loadImg(r.image.src).catch(() => null);
      putPhoto(r.image, view.card);
      startDev([view.card]);
    }
    renderPanel();
    touch();
    const got = [r.image && '写真', name && sign && `サインの名前（${name}）`].filter(Boolean);
    U.toast(got.length ? `${got.join('と')}を読み込みました` : 'この user には画像と相手の名前がありません');
  }

  /* ================================================================ 道具の帯(作業台の上) */
  const toolsEl = $('tools'), penbar = $('penbar'), tipEl = $('tip');
  const WAVE = 'M3 15c3-6 6-6 9 0s6 6 9 0';
  function penSvg(tool, c) {
    const sv = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
    switch (tool) {
      case 'posca': return sv(`<path d="${WAVE}" fill="none" stroke="${c}" stroke-width="4.6" stroke-linecap="round"/>`);
      case 'gel': return sv(`<path d="${WAVE}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/><path d="${WAVE}" transform="translate(-.5 -.7)" fill="none" stroke="rgba(255,255,255,.75)" stroke-width=".8" stroke-linecap="round"/>`);
      case 'glitter': return sv(`<path d="${WAVE}" fill="none" stroke="${c}" stroke-width="3.8" stroke-linecap="round" stroke-opacity=".5"/>` +
        [[4, 13], [6.5, 11.4], [9, 11], [11.4, 13.6], [13.4, 17], [16, 18.8], [18.6, 17.4], [20.6, 14.6]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 0.8 : 1.1}" fill="${i % 2 ? '#fff' : mix(c, '#ffffff', 0.5)}"/>`).join(''));
      case 'neon': return sv(`<path d="${WAVE}" fill="none" stroke="${c}" stroke-width="5.4" stroke-linecap="round" stroke-opacity=".3"/><path d="${WAVE}" fill="none" stroke="${c}" stroke-width="2.8" stroke-linecap="round"/><path d="${WAVE}" fill="none" stroke="${mix(c, '#ffffff', 0.7)}" stroke-width="1.1" stroke-linecap="round"/>`);
      case 'white': return sv(`<path d="${WAVE}" fill="none" stroke="#7d7884" stroke-width="4" stroke-linecap="round"/><path d="${WAVE}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`);
      case 'hl': return sv(`<path d="M3 13.5h18" stroke="${c}" stroke-width="7" stroke-opacity=".7"/>`);
      case 'eraser': return sv('<path d="M4.5 15.5 13 7l6.5 6.5-6 6h-5z" fill="#f2b8c6" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 11.5l6.5 6.5" stroke="currentColor" stroke-width="1.3"/>');
      default: return sv('<path d="M7 4l11 6.5-5 1.6L10.3 17z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>');
    }
  }
  /* ---------- 実寸で見る(画面の 1 mm はカードで合わせて、このブラウザに残す) ---------- */
  const CARD_MM = [85.6, 53.98];
  /** 画面の 1 mm が CSS の何 px か。合わせた値がなければ CSS の決まり(96 px = 1 インチ)。ブラウザの拡大を変えたら、その分を直す */
  function mmPx() {
    const v = readJson(MM_KEY), dpr = window.devicePixelRatio || 1;
    return v && v.mmpx > 1 ? (v.mmpx * (v.dpr || dpr)) / dpr : 96 / 25.4;
  }
  function setReal(on) {
    view.real = on;
    writeJson(VIEW_KEY, on ? 'real' : 'fit');
    renderTools();
    fitStage();
  }
  function calibrateScreen() {
    let v = mmPx();
    const card = h('div.snp-card', h('span', 'カードをここに重ねます'));
    const out = h('output');
    const show = () => {
      card.style.width = CARD_MM[0] * v + 'px';
      card.style.height = CARD_MM[1] * v + 'px';
      card.style.borderRadius = 3.18 * v + 'px';
      out.textContent = `1 mm = ${v.toFixed(2)} px`;
      slider.value = v;
    };
    const slider = h('input', { type: 'range', min: 2, max: 8, step: 0.005, value: v, 'aria-label': '画面の 1 mm の大きさ', oninput: (e) => { v = Number(e.target.value); show(); } });
    const nudge = (d) => { v = clamp(v + d, 2, 8); show(); };
    const ctl = U.openDialog({
      title: '画面の実寸を合わせる', wide: true,
      content: h('div.modal-body',
        h('p.modal-lead', 'クレジットカードやポイントカードなど、大きさの決まったカード（85.6×54 mm）を画面に当てて、点線の枠がカードとぴったり重なるように合わせます。合わせた値は、このブラウザに残ります。'),
        h('div.snp-card-wrap', card),
        h('div.snp-row',
          h('button.btn.btn-outline.btn-sm', { type: 'button', 'aria-label': '小さくする', onclick: () => nudge(-0.02) }, icon('minus', 15)),
          slider,
          h('button.btn.btn-outline.btn-sm', { type: 'button', 'aria-label': '大きくする', onclick: () => nudge(0.02) }, icon('plus', 15)),
          out),
        h('div.modal-foot',
          h('button.btn.btn-ghost', { type: 'button', onclick: () => { try { localStorage.removeItem(MM_KEY); } catch (e) { /* 使えない環境 */ } ctl.close(); fitStage(); } }, '最初の値に戻す'),
          h('button.btn.btn-primary', { type: 'button', onclick: () => { writeJson(MM_KEY, { mmpx: v, dpr: window.devicePixelRatio || 1 }); ctl.close(); fitStage(); } }, 'この大きさにする')))
    });
    show();
  }
  function setMode(mode) {
    if (mode !== 'move') { ed.state.pen.tool = mode; ed.dirty(); }
    view.mode = mode === 'move' ? 'move' : 'pen';
    stage.classList.toggle('mode-pen', view.mode === 'pen');
    renderTools();
    requestPaint();
  }
  const undoBtn = h('button.snp-tbtn', { type: 'button', title: '元に戻す（Ctrl+Z）', 'aria-label': '元に戻す', onclick: undo }, icon('undo', 15));
  const redoBtn = h('button.snp-tbtn', { type: 'button', title: 'やり直す（Ctrl+Y）', 'aria-label': 'やり直す', onclick: redo }, icon('redo', 15));
  const clearBtn = h('button.snp-tbtn', {
    type: 'button', title: 'ペンで描いた線をすべて消します。「元に戻す」で戻せます',
    onclick: () => {
      if (!cur().strokes.length) return;
      remember();
      cur().strokes = [];
      strokeVer++;
      touch();
      U.toast('線をすべて消しました。「元に戻す」で戻せます');
    }
  }, icon('trash', 15), h('span', '線を消す'));
  function syncHist() {
    undoBtn.disabled = !hist.undo.length;
    redoBtn.disabled = !hist.redo.length;
  }
  function renderTools() {
    const s = ed.state, cur = view.mode === 'move' ? 'move' : s.pen.tool;
    const modeBtn = (id, label, title) => h('button.snp-mode', { type: 'button', 'aria-pressed': String(cur === id), title, onclick: () => setMode(id) },
      svgNode(penSvg(id, id === 'move' ? '' : penColor(s, id))), h('span', label));
    toolsEl.replaceChildren(
      h('div.snp-modes', { role: 'group', 'aria-label': '道具' },
        modeBtn('move', '動かす', '文字・ステッカー・写真を動かします'),
        Object.entries(PENS).map(([id, p]) => modeBtn(id, p.label, `${p.label}で右の 1 枚に描きます`))),
      h('div.snp-hist', undoBtn, redoBtn, clearBtn),
      h('div.snp-viewsw', { role: 'group', 'aria-label': '見え方' },
        h('button.snp-tbtn', { type: 'button', 'aria-pressed': String(!view.real), onclick: () => setReal(false) }, '画面に合わせる'),
        h('button.snp-tbtn', { type: 'button', 'aria-pressed': String(view.real), title: '刷り上がりと同じ大きさで画面に出します', onclick: () => setReal(true) }, '実寸で見る'),
        view.real && h('button.snp-tbtn', { type: 'button', title: 'カードを画面に当てて、画面の 1 mm を合わせます', onclick: calibrateScreen }, icon('edit', 14), '画面の実寸を合わせる')));
    syncHist();
    renderPenbar();
    tipEl.textContent = view.mode === 'move'
      ? `文字やステッカーはドラッグで動かし、枠の角の丸で大きさと向きを変えます。写真はドラッグで位置が、${U.isTouch() ? '設定の欄の「大きさ」' : 'ホイール'}で大きさが変わります。`
      : s.pen.tool === 'eraser'
        ? '消しゴムはペンの線だけを消します。文字やステッカーは「動かす」で選んで削除します。'
        : isEach(s) ? 'どの 1 枚にも描けます。描いた線は、その 1 枚だけに入ります。'
          : '右の 1 枚に描きます。「左にも描く」を入れると、そのままの 1 枚にも同じ線が入ります。';
    keepTogether(stage);
  }
  function renderPenbar() {
    const s = ed.state;
    penbar.hidden = view.mode !== 'pen';
    if (penbar.hidden) { penbar.replaceChildren(); return; }
    const tool = s.pen.tool, P = PENS[tool];
    const kids = [];
    if (P.colors) {
      const cur = penColor(s, tool);
      kids.push(h('div.snp-pcolors', { role: 'group', 'aria-label': 'ペンの色' },
        P.colors.map((c) => h('button.snp-pc', { type: 'button', title: c.toUpperCase(), 'aria-label': `色 ${c.toUpperCase()}`, 'aria-pressed': String(c === cur), style: { '--sw': c }, onclick: () => { s.pen.colors[tool] = c; ed.dirty(); renderTools(); } })),
        h('button.snp-pc.own', {
          type: 'button', title: 'ほかの色を選びます。写真からスポイトで拾うこともできます', 'aria-label': 'ほかの色を選ぶ', 'aria-pressed': String(!P.colors.includes(cur)), style: { '--sw': cur },
          onclick: async () => { const v = await Ed.pickColor({ value: cur, title: `${P.label}の色`, sources: photoSources() }); if (v) { s.pen.colors[tool] = v; ed.dirty(); renderTools(); } }
        }, icon('plus', 12))));
    }
    const out = h('output', s.pen.w[tool].toFixed(1) + ' mm');
    kids.push(h('label.snp-pw', h('span', '太さ'),
      h('input', { type: 'range', min: P.w[0], max: P.w[1], step: 0.05, value: s.pen.w[tool], 'aria-label': '線の太さ', oninput: (e) => { s.pen.w[tool] = Number(e.target.value); out.textContent = s.pen.w[tool].toFixed(1) + ' mm'; ed.dirty(); } }),
      out));
    if (tool !== 'eraser' && !isEach(s)) {
      kids.push(h('label.snp-both', h('input', { type: 'checkbox', checked: s.pen.both, onchange: (e) => { s.pen.both = e.target.checked; ed.dirty(); } }), '左にも描く'));
    }
    penbar.replaceChildren(...kids);
  }
  const photoSources = () => (cur().photo && cur().photo.src ? [{ src: cur().photo.src, label: '写真' }] : []);

  /* ================================================================ 設定の欄 */
  const side = $('side');
  const sideTop = h('div.snp-side-top', ed.statusEl, h('span.kit-spacer'), ed.fileMenu({ resetLabel: '最初に戻す', resetHint: '作った内容と写真をすべて消して、見本の状態に戻します' }));
  const sideBody = h('div.snp-side-body');
  const actions = h('div.snp-actions');
  side.append(sideTop, sideBody, actions);

  const sec = (title, ...kids) => h('section.snp-sec', h('h2', title), ...kids);
  const field = (label, control, hint) => h('div.field', h('label', label, hint && h('small', hint)), control);
  function seg(label, opts, cur, onPick) {
    const box = h('div.seg', { role: 'group', 'aria-label': label });
    opts.forEach(([v, t]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(v === cur) }, t);
      b.addEventListener('click', () => { box.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(v); });
      box.append(b);
    });
    return box;
  }
  function range(label, min, max, step, value, unit, onInput, attrs) {
    const fmt = (v) => (unit === 'mm' ? Number(v).toFixed(1) + ' mm' : String(v));
    const out = h('output', fmt(value));
    const inp = h('input', Object.assign({ type: 'range', min, max, step, value, 'aria-label': label, oninput: (e) => { out.textContent = fmt(e.target.value); onInput(Number(e.target.value)); } }, attrs || {}));
    inp.addEventListener('sync', () => { out.textContent = fmt(inp.value); });
    return h('div.snp-range', inp, out);
  }
  function swatches(list, cur, onPick, own) {
    const box = h('div.snp-swatches');
    list.forEach((c) => box.append(h('button.snp-sw', {
      type: 'button', title: c.toUpperCase(), 'aria-label': `色 ${c.toUpperCase()}`, 'aria-pressed': String(c === cur), style: { '--sw': c },
      onclick: () => { box.querySelectorAll('.snp-sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === c))); onPick(c); }
    })));
    box.querySelectorAll('.snp-sw').forEach((b, i) => { b.dataset.c = list[i]; });
    if (own) {
      box.append(h('button.snp-sw.own', {
        type: 'button', title: 'ほかの色を選びます。写真からスポイトで拾うこともできます', 'aria-label': 'ほかの色を選ぶ', 'aria-pressed': String(!list.includes(cur)), style: { '--sw': cur },
        onclick: async () => { const v = await Ed.pickColor({ value: cur, title: own, sources: photoSources() }); if (v) { onPick(v); renderPanel(); } }
      }, icon('plus', 12)));
    }
    return box;
  }

  function renderPanel() {
    const s = ed.state;
    sideBody.replaceChildren(secPhoto(s), secAdjust(s), secFx(s), secFrame(s), secText(), secSign(), secStickers(s), secPrint(s));
    syncPhotoInputs();
    renderActions();
    keepTogether(document.querySelector('.snp-app'));
  }
  /**
   * 数字や英字と、かな・漢字の間の空白では折り返さない(「1 枚」「L 判」が行をまたいで分かれないように)。
   * 画面の文の空白を、折り返さない空白に置き換える
   */
  const NB_RE = /(?<=[0-9A-Za-z%）)]) (?=[^\u0000-\u007f])|(?<=[^\u0000-\u007f]) (?=[0-9A-Za-z(（])/g;
  function keepTogether(root) {
    if (!root) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (n.parentElement && n.parentElement.closest('textarea,input,[contenteditable]')) continue;
      if (NB_RE.test(n.nodeValue)) { NB_RE.lastIndex = 0; n.nodeValue = n.nodeValue.replace(NB_RE, ' '); }
      NB_RE.lastIndex = 0;
    }
  }

  /* ---------- 写真 ---------- */
  /* ---------- 写真の位置(大きさに合わせて、動かせる幅の中で -100〜100) ---------- */
  function photoRoom(ph, axis) {
    const [, , ww, wh] = film(ed.state).win, R = ww / wh, A = ph.w / ph.h, z = ph.zoom || 1;
    return axis === 'x' ? (Math.max(1, A / R) * z - 1) / 2 : (Math.max(R / A, 1) * z - 1) / 2;
  }
  function movePhoto(axis, v) {
    const ph = cur().photo;
    if (!ph) return;
    ph[axis] = (v / 100) * photoRoom(ph, axis);
    baseVer++;
    touch();
  }
  /** 欄の大きさ・位置のつまみを、いまの写真に合わせる(作業台で動かしたあとにも呼ぶ) */
  function syncPhotoInputs() {
    const ph = cur().photo;
    if (!ph) return;
    const z = sideBody.querySelector('#photoZoom');
    if (z) { z.value = ph.zoom || 1; z.dispatchEvent(new Event('sync')); }
    sideBody.querySelectorAll('input[data-pos]').forEach((el) => {
      const axis = el.dataset.pos, m = photoRoom(ph, axis);
      el.disabled = m <= 0.0005;
      el.value = m > 0.0005 ? Math.round(clamp((ph[axis] || 0) / m, -1, 1) * 100) : 0;
      el.dispatchEvent(new Event('sync'));
    });
  }
  function secPhoto(s) {
    const L = layout(s), c = cur(), ph = c.photo, has = !!(ph && ph.src);
    const R = () => { const [, , ww, wh] = film(s).win; return ww / wh; };
    // カードが 2 枚以上のときは、押して選ぶ小さな見本を並べる(選んだカードの写真・文字・線を直す)
    const cards = L.cards > 1 && h('div.snp-cards', { role: 'group', 'aria-label': '直すカード' },
      Array.from({ length: L.cards }, (_, i) => {
        const v = cardAt(s, i), src = v && v.photo && v.photo.src;
        return h('button.snp-cardbtn', { type: 'button', 'aria-pressed': String(i === view.card), title: `${i + 1} 枚目を直す`, onclick: () => setCard(i) },
          src ? h('img', { src, alt: '' }) : icon('image', 16), h('span', String(i + 1)));
      }));
    const hint = L.cards === 1 ? '2 枚には同じ写真が入ります。'
      : L.each ? '1 枚ごとに別の写真が入ります。上の見本を押すと、その 1 枚の写真や文字を直せます。'
        : '組ごとに、そのままと落書きの 2 枚へ同じ写真が入ります。上の見本を押すと、その組の写真や文字を直せます。';
    return sec('写真',
      cards,
      h('div.snp-row',
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => photoIn.click() }, icon('image', 16), has ? '写真を選び直す' : '写真を選ぶ'),
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: fromProf }, icon('book', 16), 'userprof から読み込む'),
        has && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { c.photo = null; baseVer++; touch(); renderPanel(); } }, '外す')),
      has && field('大きさ', h('div.snp-row',
        range('写真の大きさ', 1, 4, 0.01, ph.zoom || 1, '', (v) => { ph.zoom = v; clampPhoto(ph, R()); baseVer++; touch(); syncPhotoInputs(); }, { id: 'photoZoom' }),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { Object.assign(ph, { x: 0, y: 0, zoom: 1 }); baseVer++; touch(); renderPanel(); } }, icon('refresh', 15), '戻す'))),
      has && h('div.grid-2',
        field('左右', range('写真の左右の位置', -100, 100, 1, 0, '', (v) => movePhoto('x', v), { 'data-pos': 'x' })),
        field('上下', range('写真の上下の位置', -100, 100, 1, 0, '', (v) => movePhoto('y', v), { 'data-pos': 'y' }))),
      has && h('div.snp-row', h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => startDev([view.card]) }, icon('sparkle', 15), '現像をもう一度見る')),
      h('p.hint', `${hint}写真は何枚かまとめて選ぶこともでき、選んでいる 1 枚から順に入ります。作業台の写真をドラッグすると位置が、ホイールを回すと大きさが変わります。写真を入れたときの現像の演出は画面だけで、保存する画像には入りません。`));
  }

  /* ---------- 写真の色(補正) ---------- */
  const ADJ = [['bright', '明るさ'], ['contrast', 'コントラスト'], ['sat', '彩度'], ['temp', '色温度'], ['tint', '色かぶり'], ['high', 'ハイライト'], ['shadow', 'シャドウ']];
  function secAdjust(s) {
    const a = s.adj;
    return sec('写真の色',
      h('div.grid-2', ADJ.map(([key, label]) => field(label, range(label, -100, 100, 1, a[key] || 0, '', (v) => ed.set('adj.' + key, v))))),
      h('div.snp-row', h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { ed.set('adj', defaults().adj); renderPanel(); } }, icon('refresh', 15), 'すべて戻す')),
      h('p.hint', '色温度は左へ動かすと青く、右へ動かすと黄色くなります。色かぶりは左で緑に、右で赤紫に寄ります。どれもすべての写真に同じようにかかります。'));
  }

  /* ---------- 写真の効果 ---------- */
  function secFx(s) {
    const fx = s.fx;
    const slider = (key, label) => field(label, range(label, 0, 100, 1, fx[key], '', (v) => ed.set('fx.' + key, v)));
    const date = h('input', { type: 'date', value: fx.dateVal || todayIso(), 'aria-label': '写し込む日付', onchange: (e) => { if (e.target.value) ed.set('fx.dateVal', e.target.value); } });
    return sec('写真の効果',
      field('色味', h('div.snp-col',
        seg('色味', TONES, fx.tone, (v) => { ed.set('fx.tone', v); renderPanel(); }),
        fx.tone !== 'none' && range('色味の強さ', 0, 100, 1, fx.toneAmt, '', (v) => ed.set('fx.toneAmt', v)))),
      h('div.grid-2', slider('fade', 'フェード'), slider('grain', 'グレイン')),
      h('div.grid-2', slider('vignette', 'ビネット'), slider('leak', 'ライトリーク')),
      field('ライトリークの向き', seg('ライトリークの向き', LEAK_SIDES, fx.leakSide, (v) => ed.set('fx.leakSide', v))),
      h('label.check', h('input', { type: 'checkbox', checked: fx.date, onchange: (e) => { ed.set('fx.date', e.target.checked); renderPanel(); } }), '日付を写し込む'),
      fx.date && h('div.snp-col', h('div.snp-row', date, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { date.value = todayIso(); ed.set('fx.dateVal', date.value); } }, '今日にする')),
        seg('日付の書き方', DATE_FMTS, fx.dateFmt, (v) => ed.set('fx.dateFmt', v))),
      h('p.hint', '効果はすべての写真に同じようにかかります。フェードは黒を浅くし、グレインはフィルムの粒を足します。ビネットは四隅を暗くし、ライトリークは端から光が差しこんだように見せます。'));
  }

  /* ---------- フチ ---------- */
  function switchFilm(v) {
    const s = ed.state, d = (FILMS[v].w - film(s).w) / 2;
    if (!d) return;
    // 形を変えても中身が真ん中に残るよう、物と線を横にずらす
    remember();
    const [, , ww, wh] = FILMS[v].win;
    [s, ...s.cards].forEach((c) => {
      c.objects.forEach((o) => { o.x = r2(o.x + d); });
      c.strokes = c.strokes.map((st) => Object.assign({}, st, { pts: st.pts.map((v2, i) => (i % 2 ? v2 : r2(v2 + d))) }));
      if (c.photo) clampPhoto(c.photo, ww / wh);
    });
    strokeVer++;
    ed.set('film', v);
    renderPanel();
    fitStage();
  }
  function secFrame(s) {
    const fr = s.frame, L = layout(s);
    const imgIn = h('input', { type: 'file', accept: 'image/*', hidden: true });
    imgIn.addEventListener('change', async () => {
      const f = imgIn.files[0];
      imgIn.value = '';
      if (!f) return;
      try { const src = await U.fileToDataUrl(f, 1800, 'image/jpeg'); await loadImg(src); ed.set('frame.image', src); renderPanel(); } catch (err) { U.toast('画像を読み込めませんでした', 'error'); }
    });
    return sec('フチ',
      h('div.grid-2',
        field('形', seg('形', Object.entries(FILMS).map(([k, f]) => [k, `${f.label}（${f.size}）`]), s.film, switchFilm)),
        field('角', seg('角', [['square', '角'], ['round', '角丸']], s.corner, (v) => ed.set('corner', v)))),
      printedScale(layout(Object.assign({}, s, { size: 'real' }))) < 0.995 && h('p.snp-note', `${L.p.label}に 2 枚を並べると、実寸では入りきりません。刷り上がりで ${Math.round(printedScale(L) * 100)}% の大きさに縮めて並べています。実寸で刷るなら、下の「保存」で用紙を 2L 判にしてください。`),
      fr.image
        ? h('div.snp-row', imgIn,
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => imgIn.click() }, icon('image', 16), '画像を選び直す'),
          h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { ed.set('frame.image', ''); renderPanel(); } }, '画像を外す'))
        : [
          field('色', swatches(FRAME_COLORS, safeHex(fr.color, '#ffffff'), (c) => ed.set('frame.color', c), 'フチの色')),
          field('柄', seg('柄', PATTERNS, fr.pattern, (v) => { ed.set('frame.pattern', v); renderPanel(); })),
          ['dots', 'gingham', 'stripe'].includes(fr.pattern) && field('柄の色', swatches(PAT_COLORS, safeHex(fr.patColor, '#f4a7c0'), (c) => ed.set('frame.patColor', c), '柄の色')),
          h('div.snp-row', imgIn, h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => imgIn.click() }, icon('image', 16), '自分の画像をフチにする'))
        ]);
  }

  /* ---------- 文字とサインの見た目(共通) ---------- */
  function styleFields(o) {
    // 組(サイン・手書き)をまたいで、押した 1 つだけを選んだ状態にする
    const fontBtns = (table, key, sample, label, cls) => h('div.snp-fonts' + (cls ? '.' + cls : ''), { role: 'group', 'aria-label': label },
      Object.entries(table).map(([id, fam]) => h('button', {
        type: 'button', 'aria-pressed': String(o[key] === id), title: fam,
        onclick: (e) => { o[key] = id; e.currentTarget.closest('.field').querySelectorAll('.snp-fonts button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); touch(); }
      }, h('b', { style: { fontFamily: `"${fam}"` } }, sample), h('small', fam))));
    const signSample = (o.kind === 'sign' && String(o.name || '').trim()) || 'Akari';
    const edgeSeg = seg('縁取り', [['none', 'なし'], ['white', '白'], ['color', '色'], ['neon', 'ネオン']], o.edge || 'none', (v) => { o.edge = v; touch(); renderPanel(); });
    return [
      field('英字の書体', h('div.snp-col',
        h('p.snp-fgroup', 'サイン'), fontBtns(LATIN_SIGN, 'latin', signSample, '英字の書体: サイン', 'sign'),
        h('p.snp-fgroup', '手書き'), fontBtns(LATIN_NOTE, 'latin', 'Hello', '英字の書体: 手書き'))),
      field('和文の書体', fontBtns(JP, 'jp', 'あいう', '和文の書体', 'jp')),
      field('大きさ', range('字の大きさ', ...SIZE[o.kind], 0.1, o.size, 'mm', (v) => { o.size = v; touch(); }, { 'data-size': '' })),
      field('色', swatches(TEXT_COLORS, safeHex(o.color, '#1d1d22'), (c) => { o.color = c; touch(); }, '字の色')),
      field('縁取り', h('div.snp-col', edgeSeg,
        o.edge === 'color' && swatches(TEXT_COLORS, safeHex(o.edgeColor, '#ffffff'), (c) => { o.edgeColor = c; touch(); }, '縁取りの色')))
    ];
  }
  function placeFields(o) {
    return h('div.snp-row.snp-place',
      !isEach(ed.state) && seg('出す所', ONS, o.on, (v) => setOn(o, v)),
      h('span.kit-spacer'),
      o.kind !== 'sign' && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => duplicate(o) }, icon('copy', 15), '複製'),
      h('button.btn.btn-ghost.btn-sm.snp-danger', { type: 'button', onclick: () => removeObj(o) }, icon('trash', 15), '削除'));
  }
  const objChip = (o, label) => h('button', { type: 'button', 'aria-pressed': String(view.sel === o.id), onclick: () => select(o) }, label);
  function ensureMove() { if (view.mode !== 'move') setMode('move'); }

  /* ---------- 文字 ---------- */
  function addText() {
    const s = ed.state, f = film(s), [, wy, , wh] = f.win;
    remember();
    const o = { id: U.uid(), kind: 'text', text: 'Hello!', latin: 'caveat', jp: 'hachi', size: 6, color: '#1d1d22', edge: 'none', edgeColor: '#ffffff', x: r2(f.w / 2), y: r2((wy + wh + f.h) / 2), rot: 0, on: 'both' };
    cur().objects.push(o);
    ensureMove();
    select(o);
    touch();
    const ta = sideBody.querySelector('.snp-editor textarea');
    if (ta) { ta.focus(); ta.select(); }
  }
  function secText() {
    const texts = cur().objects.filter((o) => o.kind === 'text');
    const o = selObj();
    let editor;
    if (o && o.kind === 'text') {
      const ta = h('textarea', { rows: 2, 'aria-label': '文字', placeholder: '文字を入れます。改行もできます', oninput: (e) => { o.text = e.target.value; touch(); chip.textContent = chipLabel(o); } });
      ta.value = o.text || '';
      editor = h('div.snp-editor', field('文字', ta), ...styleFields(o), placeFields(o));
    } else editor = h('p.hint', '作業台の文字を押すか、上の一覧から選ぶと、ここで書き換えられます。');
    const chipLabel = (x) => (String(x.text || '').split('\n')[0].trim() || '（空）').slice(0, 14);
    let chip = null;
    const chips = h('div.snp-chips', texts.map((x) => { const c = objChip(x, chipLabel(x)); if (o === x) chip = c; return c; }),
      h('button.snp-chip-add', { type: 'button', onclick: addText }, icon('plus', 13), '文字を足す'));
    return sec('文字', chips, editor);
  }

  /* ---------- サイン ---------- */
  function addSign() {
    const s = ed.state, f = film(s), [wx, wy, ww, wh] = f.win;
    remember();
    const o = { id: U.uid(), kind: 'sign', msg: 'また来てね！', name: 'Akari', date: isoToDot(todayIso()), latin: 'dafoe', jp: 'yomogi', size: 3.6, color: '#ffffff', edge: 'color', edgeColor: '#ff6fa8', x: r2(wx + ww * 0.58), y: r2(wy + wh * 0.72), rot: -0.06, on: 'doodle' };
    cur().objects.push(o);
    ensureMove();
    select(o);
    touch();
  }
  function secSign() {
    const o = cur().objects.find((x) => x.kind === 'sign');
    if (!o) {
      return sec('サイン',
        h('p.hint', '相手からのサインをひとこと・名前・日付の 3 段で入れます。'),
        h('div.snp-row', h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: addSign }, icon('plus', 15), 'サインを入れる')));
    }
    const inp = (key, label, ph) => h('input', { type: 'text', value: o[key] || '', placeholder: ph, 'aria-label': label, onfocus: () => select(o, null, false), oninput: (e) => { o[key] = e.target.value; touch(); } });
    const dateIn = inp('date', '日付', '2026.11.02');
    const open = view.sel === o.id;
    return sec('サイン',
      h('div.grid-2', field('ひとこと', inp('msg', 'ひとこと', 'また来てね！')), field('名前', inp('name', '名前', 'Akari'))),
      field('日付', h('div.snp-row', dateIn, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { o.date = isoToDot(todayIso()); dateIn.value = o.date; touch(); } }, '今日にする'))),
      open ? h('div.snp-editor', ...styleFields(o), placeFields(o))
        : h('div.snp-row', h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => select(o) }, icon('edit', 15), '書体・色・置き場所を変える')),
      h('p.hint', '名前の下にはさっと引いた線が入ります。空欄の段は詰めて出します。'));
  }

  /* ---------- ステッカー ---------- */
  function addSticker(ref, extra) {
    const s = ed.state, f = film(s), [wx, wy, ww, wh] = f.win;
    remember();
    const o = Object.assign({ id: U.uid(), kind: 'sticker', ref, color: (STICKERS[ref] || {}).c || '', x: r2(wx + ww * (0.25 + Math.random() * 0.5)), y: r2(wy + wh * (0.2 + Math.random() * 0.6)), size: 10, rot: r2((Math.random() - 0.5) * 0.5), on: 'doodle' }, extra || {});
    cur().objects.push(o);
    ensureMove();
    select(o);
    touch();
  }
  function secStickers(s) {
    const own = h('input', { type: 'file', accept: 'image/png,image/webp,image/gif,image/*', hidden: true });
    own.addEventListener('change', async () => {
      const f = own.files[0];
      own.value = '';
      if (!f) return;
      try {
        const src = await U.fileToDataUrl(f, 900, 'image/png');
        const img = await loadImg(src);
        const id = U.uid();
        s.assets[id] = src;
        addSticker('img:' + id, { color: '', size: 14, ar: img.naturalWidth / img.naturalHeight });
      } catch (err) { U.toast('画像を読み込めませんでした', 'error'); }
    });
    const grid = h('div.snp-stickers', Object.entries(STICKERS).map(([id, st]) => h('button', { type: 'button', title: st.label, 'aria-label': `${st.label}を貼る`, onclick: () => addSticker(id) }, svgNode(stickerSvg(id, st.c)))));
    const o = selObj();
    let editor = null;
    if (o && o.kind === 'sticker') {
      const builtIn = !String(o.ref).startsWith('img:');
      editor = h('div.snp-editor',
        h('p.snp-ed-title', builtIn ? `選んでいるステッカー: ${STICKERS[o.ref].label}` : '選んでいるステッカー: 自分の画像'),
        builtIn && field('色', swatches(STICKER_COLORS, safeHex(o.color, STICKERS[o.ref].c), (c) => { o.color = c; touch(); }, 'ステッカーの色')),
        field('大きさ', range('ステッカーの大きさ', ...SIZE.sticker, 0.5, o.size, 'mm', (v) => { o.size = v; touch(); }, { 'data-size': '' })),
        placeFields(o));
    }
    return sec('ステッカー',
      grid,
      h('div.snp-row', own,
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => own.click() }, icon('upload', 15), '自分の画像を貼る'),
        h('label.check', h('input', { type: 'checkbox', checked: s.stickerShadow, onchange: (e) => { s.stickerShadow = e.target.checked; touch(); } }), '影をつける')),
      editor || h('p.hint', 'ステッカーは落書きの 1 枚だけに貼ります。そのままの 1 枚にも貼るときは、ステッカーを選んで「左にも出す」を押します。背景が透明な PNG なら、自分の画像も形どおりに貼れます。'));
  }

  /* ---------- 保存 ---------- */
  /** 2 枚の大きさの説明(点線の内に収めたか、実寸か) */
  // 刷り上がりでの大きさ(測った拡大を掛けた割合)
  const printedScale = (L) => L.sc * L.pr.scale;
  function sizeHint(s, L) {
    const pct = Math.round(printedScale(L) * 100), full = 1 / L.pr.scale - 0.001;
    const fix = L.pr.measured ? `試し刷りで測った値に合わせてあります。このお店では、刷ると ${r2(L.pr.scale * 100)}% に拡大されます。` : '';
    if (s.size !== 'real') {
      return L.sc < full ? `点線の内に収まるよう、${L.slots.length} 枚を刷り上がりで ${pct}% の大きさに並べています。刷ったときに端が${L.pr.measured ? '' : '数ミリ'}切れても、フチが欠けにくい大きさです。${fix}`
        : `${L.p.label}なら、${L.slots.length} 枚とも実寸のまま点線の内に収まります。${fix}`;
    }
    if (L.sc < full) return `${L.p.label}には実寸の ${L.slots.length} 枚が入りきらないので、刷り上がりで ${pct}% の大きさに縮めて並べています。${fix}`;
    const top = Math.min(...L.slots.map((x) => x.y)), bottom = Math.max(...L.slots.map((x) => x.y + L.f.h * L.sc));
    const room = Math.min(top - L.cut[0], L.p.h - bottom - L.cut[2]);
    return room < 0 ? `実寸で並べます。フチが点線より外にかかるので、刷るとフチの端が少し欠けることがあります。${fix}` : `実寸で並べます。${fix}`;
  }
  function secPrint(s) {
    const L = layout(s);
    // 並べ方・用紙・敷き詰めを変えたら、要るカードをそろえて並べ直す
    const relayout = () => { view.sel = null; selBarFor = ''; fitStage(); renderPanel(); renderTools(); };
    const arrangeHint = L.tiled ? '3 枚を並べるときは、1 枚ごとに別の写真が入り、どれにも落書きできます。'
      : s.arrange === 'each' ? '1 枚ごとに別の写真を入れて、どれにも落書きできます。'
        : '同じ写真で、そのままの 1 枚と落書きした 1 枚を組にして並べます。';
    return sec('保存',
      field('用紙', seg('用紙', Object.entries(PAPERS).map(([k, p]) => [k, `${p.label}（${p.size}）`]), s.paper, (v) => { ed.set('paper', v); relayout(); })),
      s.paper === '2L' && s.film === 'mini' && h('label.check', h('input', { type: 'checkbox', checked: s.tile, onchange: (e) => { ed.set('tile', e.target.checked); relayout(); } }), '2L 判に 3 枚を実寸で並べる'),
      L.tileBlocked && h('p.snp-note', '試し刷りで測った切れる幅が大きいので、3 枚を実寸のまま点線の内に並べられません。いまは 2 枚で並べています。'),
      !L.tiled && field('並べ方', seg('並べ方', [['pair', 'そのままと落書き'], ['each', '別々の写真']], s.arrange, (v) => { ed.set('arrange', v); relayout(); })),
      h('p.hint', `${arrangeHint}いまは ${L.slots.length} 枚を並べています。`),
      field('大きさ', seg('大きさ', [['fit', '点線の内に収める'], ['real', '実寸']], s.size, (v) => { ed.set('size', v); renderPanel(); fitStage(); })),
      h('p.hint', sizeHint(s, L)),
      field('用紙の地の色', swatches(SHEET_COLORS, sheetColor(s), (c) => ed.set('sheet', c), '用紙の地の色')),
      h('p.hint', 'フチの外の地に色をつけておくと、白いフチとの境目が見えて切りやすくなります。'),
      h('label.check', h('input', { type: 'checkbox', checked: s.marks, onchange: (e) => ed.set('marks', e.target.checked) }), '切り取りの目印を入れる'),
      field('形式', seg('形式', [['jpeg', 'JPEG'], ['png', 'PNG']], s.format, (v) => { ed.set('format', v); renderActions(); })),
      h('p.hint', `${Math.round(L.p.w * EXPORT_K)}×${Math.round(L.p.h * EXPORT_K)} px（${EXPORT_DPI} dpi）の画像になります。セブン‐イレブンのネットプリントは JPEG だけを受け付けます。ローソンやファミリーマートなどのネットワークプリントは、JPEG と PNG のどちらでも刷れます。`),
      h('p.hint', 'どちらのお店も用紙のふちまで刷るので、四方が数ミリ切れ、わずかに大きく刷られます。作業台の点線より外は切れることがあります。'),
      h('p.hint', 'レイヤーに分けた PSD には、1 枚ごとのグループの中に、フチ・写真・文字やステッカー・落書きの線を分けて入れます。Photoshop などで続きを直せます。PSD を作る部品は、保存するときに通信で読み込みます。'),
      secCalib(s));
  }
  /** お店の刷り方に合わせる(試し刷りを測って、拡大と切れる幅を入れる) */
  function secCalib(s) {
    const pr = printProfile(s.paper), paper = PAPERS[s.paper];
    const num = (v, label, min, max) => h('input.snp-num', { type: 'number', min, max, step: 0.5, value: v, 'aria-label': label });
    const sideIn = num(r2(TEST_SQ * pr.scale), '中央の四角の 1 辺', 30, 50);
    const names = ['上', '右', '下', '左'];
    const cutIns = pr.cut.map((v, i) => num(v, `${names[i]}で切れた幅`, 0, 12));
    const testBtn = busyBtn(h('button.btn.btn-outline.btn-sm', { type: 'button' }, icon('download', 15), `試し刷り用の画像を保存（${paper.label}）`), async () => {
      await saveCanvas(testSheetCanvas(s.paper), 'image/jpeg', `usersnap-test-${s.paper}.jpg`);
    });
    const apply = () => {
      const side = Number(sideIn.value), cut = cutIns.map((el) => Number(el.value));
      const scale = side / TEST_SQ;
      if (!(scale > 0.9 && scale < 1.15)) return U.toast(`中央の四角は ${TEST_SQ * 0.9}〜${r2(TEST_SQ * 1.15)} mm の間で入れてください`, 'error');
      if (cut.some((v) => !(v >= 0 && v <= 12))) return U.toast('切れた幅は 0〜12 mm の間で入れてください', 'error');
      savePrintProfile(s.paper, { scale: r2(scale * 1000) / 1000, cut });
      baseVer++;
      renderPanel();
      fitStage();
      U.toast(`${paper.label}の刷り方を、測った値に合わせました`);
    };
    const reset = () => { savePrintProfile(s.paper, null); baseVer++; renderPanel(); fitStage(); U.toast('見込みの値に戻しました'); };
    return h('details.snp-calib', { open: false },
      h('summary', icon('sparkle', 15), 'お店の刷り方に合わせる', pr.measured && h('span.snp-badge', '合わせ済み')),
      h('div.snp-col',
        h('p.hint', `お店ごとに、刷ったときの拡大と切れる幅は少しずつ違います。一度だけ試し刷りをして測ると、実寸で刷ったときの大きさと、点線の位置を合わせられます。測った値は用紙ごとに、このブラウザに残ります。`),
        h('div.snp-row', testBtn),
        h('p.hint', `刷ったら、中央の四角の 1 辺を定規で測ります。画像では ${TEST_SQ} mm の四角です。四辺の目盛りでは、いちばん外に見えている数字を読みます。`),
        field('中央の四角の 1 辺（mm）', sideIn),
        field('切れた幅（mm）', h('div.snp-cuts', cutIns.map((el, i) => h('label', h('span', names[i]), el)))),
        h('div.snp-row',
          h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: apply }, icon('check', 15), 'この値を使う'),
          pr.measured && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: reset }, icon('refresh', 15), '見込みの値に戻す'))));
  }
  function busyBtn(btn, fn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await fn(); } catch (e) { console.error(e); U.toast(e.message || '画像にできませんでした', 'error'); }
      finally { btn.disabled = false; }
    });
    return btn;
  }
  const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB');
  async function saveCanvas(c, type, name) {
    const blob = await new Promise((resolve) => c.toBlob(resolve, type, 0.95));
    if (!blob) throw new Error('画像を作れませんでした');
    await U.saveImage(blob, name);
    return blob;
  }
  function renderActions() {
    const s = ed.state, png = s.format === 'png';
    const main = busyBtn(h('button.btn.btn-primary', { type: 'button' }, icon('download', 17), `用紙 1 枚を ${png ? 'PNG' : 'JPEG'} で保存`), async () => {
      const c = await sheetCanvas(EXPORT_K);
      const blob = await saveCanvas(c, png ? 'image/png' : 'image/jpeg', `usersnap-${s.paper}-${U.stamp()}.${png ? 'png' : 'jpg'}`);
      U.toast(`保存しました（${c.width}×${c.height} px・${fmtSize(blob.size)}）` + (blob.size > 10 * 1048576 ? '。10 MB を超えたので、形式を JPEG にして保存し直してください' : ''));
    });
    const one = (sd, label) => busyBtn(h('button.btn.btn-outline.btn-sm', { type: 'button' }, label), async () => {
      const c = await chekiCanvas(sd, EXPORT_K);
      await saveCanvas(c, 'image/png', `usersnap-${view.card + 1}-${sd}-${U.stamp()}.png`);
    });
    // 1 枚ずつは、選んでいるカードの分(別々の写真なら、その 1 枚)
    const L = layout(s), many = L.cards > 1;
    const psd = busyBtn(h('button.btn.btn-outline.btn-sm', { type: 'button', title: '1 枚ごとに、フチ・写真・文字やステッカー・線をレイヤーに分けて保存します' }, icon('file', 15), 'レイヤーに分けて PSD で保存'), async () => {
      const blob = await psdBlob();
      await U.saveImage(blob, `usersnap-${s.paper}-${U.stamp()}.psd`);
      U.toast(`PSD で保存しました（${fmtSize(blob.size)}）`);
    });
    actions.replaceChildren(main, L.each
      ? h('div.snp-ones', h('span', `${many ? `${view.card + 1} 枚目を ` : ''}PNG で:`), one('doodle', '保存'))
      : h('div.snp-ones', h('span', `${many ? `${view.card + 1} 組目を ` : ''}1 枚ずつ PNG で:`), one('plain', 'そのまま'), one('doodle', '落書き')),
      h('div.snp-ones', psd));
    keepTogether(actions);
  }

  /* ================================================================ 始め */
  Kit.mountBar('usersnap');
  $('help').append(Ed.help('usersnap', [
    '写真を選ぶと、左右の 2 枚に同じ写真が入ります。左はそのままの 1 枚、右は落書きする 1 枚です。',
    '右の 1 枚には作業台の上の帯でペンを選んで描きます。ペンはポスカ・ゲルペン・ラメ・ネオン・白ペン・蛍光ペンの 6 種類です。',
    '文字は 2 枚の両方に、サインとステッカーは右の 1 枚だけに入ります。サインやステッカーを選んで「左にも出す」を押すと、左にも出せます。',
    '保存した画像はコンビニのネットプリントの L 判にそのまま刷れます。2 枚のまわりの目印に沿って切ると、1 枚ずつのチェキ風プリントになります。',
    '2L 判には、mini を 1 枚ずつ実寸のまま 3 枚並べられます。並べ方を「別々の写真」にすると、1 枚ごとに別の写真を入れられます。写真は何枚かまとめて選べます。'
  ]));
  document.body.append(Kit.footer());
  (async () => {
    await ed.load();   // 読み終える前に組むと、見本の中身で保存を上書きしてしまうので先に読む
    renderTools();
    renderPanel();
    fitStage();
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => requestPaint());
  })();
})();
