/* userid — ID カードメーカー(見本)。
   載せる項目は自由に足し引きでき、ひな形を選ぶと項目と見た目がひととおり入る(名前・写真・自分で書いた所属名は残す)。
   カードは HTML で組み、所属マーク・地紋・コード・印は SVG で描く。保存は Ed(IndexedDB の userkit-editor、キー userid) */
(function () {
  'use strict';
  const { h, icon } = U;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeHex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : d);
  const svgNode = (str) => { const d = document.createElement('div'); d.innerHTML = str; return d.firstElementChild; };
  let uidSeq = 0;   // SVG の中の id(textPath・pattern)が重ならないように

  // 注記(2026-11-02 に yomiyasu で推敲した文)
  const NOTE = 'このカードは創作のために作ったもので、実在の人物の身分や団体への所属を証明するものではありません。';

  /* ================================================================ 項目の種類 */
  const TYPES = {
    text: { label: '文字', wide: false, make: () => ({ label: '項目', value: '' }) },
    long: { label: '長い文', wide: true, make: () => ({ label: 'メモ', value: '' }) },
    tags: { label: 'タグ', wide: true, make: () => ({ label: '好きなもの', value: '' }) },
    meter: { label: '段階', wide: false, make: () => ({ label: 'レベル', level: 3 }) },
    number: { label: '番号', wide: false, make: () => ({ label: '番号', value: '0000-0000' }) },
    sign: { label: '署名', wide: false, make: () => ({ label: '署名', value: '' }) },
    stamp: { label: '印', wide: false, make: () => ({ label: '印', value: '' }) },
    code: { label: 'コード', wide: true, make: () => ({ label: '', style: 'bar', value: '' }) }
  };
  const newItem = (type, side, o) => Object.assign({ id: U.uid(), type, side: side || 'f', wide: TYPES[type].wide }, TYPES[type].make(), o || {});
  // ひな形の項目の書き方: it(種類, 項目の名前, 中身(段階なら 0〜5), ほかの値)
  const it = (type, label, value, o) => Object.assign({ type, label }, type === 'meter' ? { level: value } : { value: value || '' }, o || {});

  /* ================================================================ ひな形 */
  const PRESETS = [
    {
      id: 'staff', label: '社員証', desc: '会社・お店', org: '株式会社 夜明け文具', title: '社員証', titleEn: 'STAFF IDENTIFICATION',
      look: { orient: 'v', look: 'band', base: 'white', color: '#24407a', font: 'sans', pattern: 'guilloche', photoPos: 'left', photoShape: 'rect', hold: 'strap' },
      emblem: { on: true, shape: 'circle', symbol: 'initial', deco: 'double', fill: 'solid' },
      front: [it('text', '部署', '企画開発部'), it('text', '役職', '主任'), it('text', '入社日', '2023.04.01'), it('number', '社員番号', '2304-0117'), it('code', '', '', { style: 'bar' })],
      back: [it('text', '有効期限', '2027.03.31'), it('long', 'お願い', 'このカードを拾われた方は、下記の連絡先までお届けください。'), it('text', '連絡先', '総務部 03-0000-0000'), it('sign', '署名', '')]
    },
    {
      id: 'student', label: '学生証', desc: '学校', org: '星見坂学園大学', title: '学生証', titleEn: 'STUDENT IDENTIFICATION',
      look: { orient: 'h', look: 'form', base: 'cream', color: '#1f5d4a', font: 'serif', pattern: 'waves', photoPos: 'left', photoShape: 'rect', hold: 'reel' },
      emblem: { on: true, shape: 'shield', symbol: 'book', deco: 'double', fill: 'line' },
      front: [it('text', '学部・学科', '文学部 日本文学科', { wide: true }), it('text', '学年', '2 年'), it('number', '学籍番号', 'S24-0314'), it('text', '生年月日', '2005.03.14'), it('stamp', '発行者印', '学長之印')],
      back: [it('text', '有効期限', '2027.03.31'), it('text', '通学区間', '星見坂 ― 学園前'), it('long', '注意', 'この証は常に持ち歩き、求められたら見せてください。'), it('code', '', '', { style: 'dots', wide: false })]
    },
    {
      id: 'intro', label: '自己紹介', desc: 'はじめましての名刺がわり', org: '', title: 'はじめまして', titleEn: 'HELLO, MY NAME IS',
      look: { orient: 'v', look: 'soft', base: 'white', color: '#d0507a', font: 'round', pattern: 'dots', photoPos: 'center', photoShape: 'circle', hold: 'none' },
      emblem: { on: false, shape: 'none', symbol: 'spark', deco: 'line', fill: 'line' },
      front: [it('text', '呼び名', 'あかり'), it('text', '誕生日', '3月14日'), it('tags', '好きなもの', '雨の音、古書店、ミルクティー'), it('tags', '苦手なもの', '早起き、雷'), it('meter', '人見知り', 4), it('meter', '夜ふかし', 5)],
      back: [it('long', '自己紹介', '人見知りだけど、話しはじめると長いです。夜の散歩と、知らない町の本屋さんが好き。'), it('text', '最近のお気に入り', '万年筆のインク集め', { wide: true }), it('code', '', '', { style: 'ring' })]
    },
    {
      id: 'agent', label: '隊員証', desc: '組織・チーム', org: '第七観測局', title: '隊員証', titleEn: 'OPERATIVE ID',
      look: { orient: 'v', look: 'night', base: 'dark', color: '#3fd0c0', font: 'sans', pattern: 'grid', photoPos: 'left', photoShape: 'rect', hold: 'reel' },
      emblem: { on: true, shape: 'hex', symbol: 'eye', deco: 'line', fill: 'line' },
      front: [it('text', 'コードネーム', 'LANTERN', { wide: true }), it('text', '所属班', '夜間観測班'), it('text', '階級', 'B'), it('meter', '感応', 4), it('meter', '制御', 2), it('number', '隊員番号', '07-N-4412'), it('code', '', '', { style: 'bar' })],
      back: [it('long', '任務', '夜間区域の観測と記録。異常を見つけたら、すぐに本部へ知らせる。'), it('text', '有効期限', '2026.12.31'), it('sign', '署名', '')]
    },
    {
      id: 'member', label: '会員証', desc: 'お店・ファンクラブ', org: '月曜喫茶 友の会', title: '会員証', titleEn: 'MEMBERSHIP CARD',
      look: { orient: 'h', look: 'crest', base: 'white', color: '#9a6a1f', font: 'serif', pattern: 'guilloche', photoPos: 'right', photoShape: 'round', hold: 'none' },
      emblem: { on: true, shape: 'rosette', symbol: 'moon', deco: 'ring', fill: 'line' },
      front: [it('number', '会員番号', 'No. 0042'), it('text', 'ランク', 'GOLD'), it('text', '入会日', '2024.11.02'), it('text', '好きな一杯', '深煎りブレンド')],
      back: [it('long', '特典', 'ブレンドを一杯サービス。お誕生月はケーキもおつけします。'), it('text', '有効期限', '2027.11.01'), it('code', '', '', { style: 'ring', wide: false })]
    },
    { id: 'blank', label: 'まっさら', desc: '項目なしから作る' }
  ];

  /* ================================================================ 見た目の選択肢 */
  const LOOKS = [
    ['band', '帯', '上に色の帯を敷き、はっきりした見た目にします。'],
    ['form', '罫', '書類のような線で項目を区切ります。'],
    ['crest', '透かし', '所属マークを大きく薄く敷き、名前を大きく出します。'],
    ['night', '夜', '暗い地に細い線と角の印を入れます。'],
    ['soft', 'やわらか', '淡い地に項目を丸い枠で並べます。']
  ];
  const BASES = [['white', '白'], ['cream', '生成り'], ['dark', '黒']];
  const FONTS = [['sans', 'ゴシック'], ['serif', '明朝'], ['round', '丸ゴシック']];
  const FONT_CSS = {
    sans: '"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", system-ui, sans-serif',
    serif: '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif',
    round: '"Zen Maru Gothic", "Noto Sans JP", system-ui, sans-serif'
  };
  const PATTERNS = [['none', 'なし'], ['guilloche', '紋様'], ['waves', '波'], ['dots', '点'], ['grid', '方眼'], ['lines', '斜線']];
  const POSITIONS = [['left', '左'], ['center', '中央'], ['right', '右']];
  const PHOTO_SHAPES = [['rect', '角'], ['round', '角丸'], ['circle', '丸']];
  const HOLDS = [['none', 'なし'], ['strap', 'ストラップ'], ['reel', 'リール']];
  const SWATCHES = ['#24407a', '#2d63c8', '#1f5d4a', '#3fd0c0', '#8e2a3a', '#d0507a', '#6d5dfc', '#9a6a1f', '#2b2b30'];
  const DECOS = [['line', '線'], ['double', '二重'], ['dots', '点線'], ['ring', '文字の輪']];
  const CODE_STYLES = [['bar', 'バー'], ['ring', '輪'], ['dots', '点']];

  /* ================================================================ 状態 */
  function blankState() {
    return {
      preset: 'staff', orient: 'v', look: 'band', base: 'white', color: '#24407a', font: 'sans',
      pattern: 'guilloche', seed: 7, photoPos: 'left', photoShape: 'rect', hold: 'strap',
      org: '', title: '', titleEn: '', name: '朝霧 灯', nameSub: 'AKARI ASAGIRI', photo: null,
      emblem: { on: true, mode: 'make', shape: 'circle', symbol: 'initial', deco: 'double', fill: 'solid', text: '', ring: '', image: '' },
      items: [], back: true, note: true, noteText: NOTE, view: 'one', touched: false, exportSide: 'f'
    };
  }
  function applyPreset(s, p) {
    const samples = PRESETS.map((x) => x.org).filter(Boolean);
    s.preset = p.id;
    s.touched = false;
    if (p.id === 'blank') { s.items = []; s.title = 'ID カード'; s.titleEn = 'IDENTIFICATION'; return s; }
    Object.assign(s, p.look);
    s.title = p.title;
    s.titleEn = p.titleEn;
    if (!s.org || samples.includes(s.org)) s.org = p.org;   // 自分で書いた所属名は残す
    Object.assign(s.emblem, p.emblem);
    if (s.emblem.mode === 'image' && !s.emblem.image) s.emblem.mode = 'make';
    s.items = p.front.map((x) => newItem(x.type, 'f', x)).concat(p.back.map((x) => newItem(x.type, 'b', x)));
    s.back = true;
    return s;
  }
  const defaults = () => applyPreset(blankState(), PRESETS[0]);
  function migrate(st) {
    const s = Object.assign(blankState(), st || {});
    s.emblem = Object.assign(blankState().emblem, (st && st.emblem) || {});
    if (!Array.isArray(s.items)) s.items = [];
    s.items = s.items.filter((x) => x && TYPES[x.type]).map((x) => Object.assign({ id: U.uid(), side: 'f', wide: TYPES[x.type].wide }, TYPES[x.type].make(), x));
    return s;
  }

  /* ================================================================ 色 */
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return toHex(...x.map((v, i) => v * (1 - t) + y[i] * t)); };
  const lum = (hex) => {
    const [r, g, b] = rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** カードの CSS 変数。--c は帯などの面、--acc は線と小さな字(地の色で読めるように明暗を寄せる) */
  function palette(s) {
    const c = safeHex(s.color, '#24407a');
    const dark = s.base === 'dark';
    let [paper, ink, sub] = { white: ['#ffffff', '#1c1e24', '#6a6f7a'], cream: ['#f6f0e3', '#2b261f', '#7b7262'], dark: ['#14161b', '#eceff4', '#9aa1ad'] }[s.base] || ['#ffffff', '#1c1e24', '#6a6f7a'];
    let acc = c;
    if (dark && lum(c) < 0.2) acc = mix(c, '#ffffff', 0.5);
    if (!dark && lum(c) > 0.5) acc = mix(c, '#000000', 0.4);
    if (s.look === 'soft') paper = mix(paper, c, dark ? 0.14 : 0.1);
    return {
      '--c': c, '--c-ink': lum(c) > 0.45 ? '#15161a' : '#ffffff', '--acc': acc,
      '--paper': paper, '--ink': ink, '--sub': sub, '--rule': mix(paper, ink, 0.16),
      '--tint': mix(paper, c, dark ? 0.22 : 0.1), '--paper2': dark ? mix(paper, '#ffffff', 0.07) : mix(paper, '#ffffff', 0.75),
      '--f-main': FONT_CSS[s.font] || FONT_CSS.sans
    };
  }

  /* ================================================================ 乱数(地紋・コードは文字や種から毎回同じ形を作る) */
  function hashStr(str) { let x = 2166136261; for (const ch of String(str)) { x ^= ch.codePointAt(0); x = Math.imul(x, 16777619); } return x >>> 0; }
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* ================================================================ 所属マーク(SVG。100×100 の中に外形・飾り・記号) */
  const poly = (pts) => 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
  const around = (n, rFn, rot) => Array.from({ length: n }, (_, i) => { const a = (rot || -90) * Math.PI / 180 + i * 2 * Math.PI / n; const r = rFn(i); return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; });
  const SHAPES = {
    circle: { label: '円', d: 'M50 4a46 46 0 1 1 0 92a46 46 0 1 1 0-92z' },
    shield: { label: '盾', d: 'M50 4 88 15v30c0 26-17 43-38 51C29 88 12 71 12 45V15z' },
    hex: { label: '六角', d: poly(around(6, () => 47)) },
    diamond: { label: '菱', d: 'M50 3 97 50 50 97 3 50z' },
    rosette: { label: '星章', d: poly(around(48, (i) => (i % 2 ? 43 : 47))) },
    square: { label: '角丸', d: 'M24 5h52a19 19 0 0 1 19 19v52a19 19 0 0 1-19 19H24A19 19 0 0 1 5 76V24A19 19 0 0 1 24 5z' },
    none: { label: 'なし', d: '' }
  };
  const starD = poly(around(10, (i) => (i % 2 ? 10.5 : 25)));
  const gearD = (() => {
    const pts = [];
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 4;
      [[-0.27, 19], [-0.15, 26], [0.15, 26], [0.27, 19]].forEach(([da, r]) => pts.push([50 + r * Math.cos(a + da), 50 + r * Math.sin(a + da)]));
    }
    return poly(pts);
  })();
  // 記号。f = 記号の色、b = くり抜きの色
  const SYMBOLS = {
    initial: { label: '頭文字' },
    star: { label: '星', svg: (f) => `<path d="${starD}" fill="${f}"/>` },
    moon: { label: '月', svg: (f) => `<path d="M58 26a25 25 0 1 0 0 48a26 26 0 0 1 0-48z" fill="${f}"/>` },
    sun: { label: '太陽', svg: (f) => `<circle cx="50" cy="50" r="11" fill="${f}"/><g stroke="${f}" stroke-width="4" stroke-linecap="round">${around(8, () => 0).map((_, i) => { const a = i * Math.PI / 4; return `<path d="M${(50 + 17 * Math.cos(a)).toFixed(1)} ${(50 + 17 * Math.sin(a)).toFixed(1)}L${(50 + 25 * Math.cos(a)).toFixed(1)} ${(50 + 25 * Math.sin(a)).toFixed(1)}"/>`; }).join('')}</g>` },
    spark: { label: '光', svg: (f) => `<path d="M50 22q4 24 28 28q-24 4-28 28q-4-24-28-28q24-4 28-28z" fill="${f}"/>` },
    key: { label: '鍵', svg: (f) => `<circle cx="38" cy="40" r="11" fill="none" stroke="${f}" stroke-width="6"/><path d="M46 48 70 72M61 63l-6 6M67 69l-5 5" fill="none" stroke="${f}" stroke-width="6" stroke-linecap="round"/>` },
    leaf: { label: '葉', svg: (f, b) => `<path d="M50 22c17 10 20 40 0 56c-20-16-17-46 0-56z" fill="${f}"/><path d="M50 33v40" stroke="${b}" stroke-width="2.4" stroke-linecap="round"/>` },
    flower: { label: '花', svg: (f, b) => around(5, () => 12).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="${f}"/>`).join('') + `<circle cx="50" cy="50" r="5.5" fill="${b}"/>` },
    crown: { label: '王冠', svg: (f) => `<path d="M27 66 29 36l12 13 9-19 9 19 12-13 2 30z" fill="${f}"/><rect x="27" y="69" width="46" height="6" rx="2" fill="${f}"/>` },
    book: { label: '本', svg: (f, b) => `<path d="M50 36c-8-6-17-7-25-4v36c8-3 17-2 25 4zM50 36c8-6 17-7 25-4v36c-8-3-17-2-25 4z" fill="${f}"/><path d="M50 37v34" stroke="${b}" stroke-width="2"/>` },
    gear: { label: '歯車', svg: (f, b) => `<path d="${gearD}" fill="${f}"/><circle cx="50" cy="50" r="8" fill="${b}"/>` },
    bolt: { label: '稲妻', svg: (f) => `<path d="M55 22 33 54h15l-5 24 24-34H52l6-22z" fill="${f}"/>` },
    eye: { label: '目', svg: (f, b) => `<path d="M22 50c14-20 42-20 56 0c-14 20-42 20-56 0z" fill="${f}"/><circle cx="50" cy="50" r="9" fill="${b}"/><circle cx="50" cy="50" r="4" fill="${f}"/>` },
    wave: { label: '波', svg: (f) => `<path d="M24 42q6.5-8 13 0t13 0 13 0 13 0M24 58q6.5-8 13 0t13 0 13 0 13 0" fill="none" stroke="${f}" stroke-width="5" stroke-linecap="round"/>` },
    heart: { label: 'ハート', svg: (f) => `<path d="M50 74C30 60 23 49 27 40c4-9 16-10 23-1c7-9 19-8 23 1c4 9-3 20-23 34z" fill="${f}"/>` }
  };
  /** 頭文字の初期値: 所属名から「株式会社」などを外した 1 字目(英字だけなら単語の頭文字 2 つ) */
  function autoInitial(s) {
    const o = (s.org || s.title || '').replace(/株式会社|有限会社|合同会社|一般社団法人|学校法人|[（(]株[)）]|私立|公立|国立|県立|市立/g, '').trim();
    if (o && !/[^\x00-\x7F]/.test(o)) {
      const w = o.match(/[A-Za-z0-9]+/g) || [];
      return w.slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'ID';
    }
    return Array.from(o.replace(/\s/g, ''))[0] || 'ID';
  }
  const autoRing = (s) => [s.org || s.title, s.titleEn].filter(Boolean).join(' ・ ');
  /** 所属マークの SVG。col = { fg: 線と記号, bg: くり抜く色 } */
  function emblemSvg(s, e, col) {
    const sh = SHAPES[e.shape] || SHAPES.circle;
    const solid = e.fill === 'solid' && !!sh.d;
    const symFg = solid ? col.bg : col.fg, symBg = solid ? col.fg : col.bg;
    const inner = (sw, extra) => `<path d="${sh.d}" transform="translate(50 50) scale(.84) translate(-50 -50)" fill="none" stroke="${symFg}" stroke-width="${sw}" stroke-linejoin="round" ${extra || ''}/>`;
    let out = '';
    if (sh.d) {
      out += `<path d="${sh.d}" fill="${solid ? col.fg : 'none'}" stroke="${col.fg}" stroke-width="3.4" stroke-linejoin="round"/>`;
      if (e.deco === 'double') out += inner(1.5);
      if (e.deco === 'dots') out += inner(2.6, 'stroke-dasharray="0 5.5" stroke-linecap="round"');
    }
    let k = sh.d ? 0.92 : 1.3;
    if (e.deco === 'ring') {
      const id = 'uidr' + (++uidSeq), r = 35.5;
      const text = (e.ring || autoRing(s)).slice(0, 40) || 'IDENTIFICATION';
      out += `<defs><path id="${id}" d="M50 ${50 - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0-${2 * r}"/></defs>` +
        `<circle cx="50" cy="50" r="30.5" fill="none" stroke="${symFg}" stroke-width="1.2"/>` +
        `<text font-size="8.4" font-weight="700" fill="${symFg}"><textPath href="#${id}" textLength="${(2 * Math.PI * r * 0.97).toFixed(1)}" lengthAdjust="spacing">${esc(text)}</textPath></text>`;
      k = 0.6;
    }
    let sym;
    if (e.symbol === '_') sym = '';   // 外形だけを見せる(設定の欄の見本)
    else if (e.symbol === 'initial' || !SYMBOLS[e.symbol]) {
      const t = Array.from((e.text || autoInitial(s)).trim()).slice(0, 3).join('') || 'ID';
      const fs = [0, 46, 34, 25][Array.from(t).length] || 25;
      sym = `<text x="50" y="50" dy=".36em" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${symFg}">${esc(t)}</text>`;
    } else sym = SYMBOLS[e.symbol].svg(symFg, symBg);
    out += `<g transform="translate(50 50) scale(${k}) translate(-50 -50)">${sym}</g>`;
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${out}</svg>`;
  }
  function emblemNode(s, col, cls) {
    const e = s.emblem;
    if (e.mode === 'image' && e.image) return h('div.id-emb.is-img' + (cls ? '.' + cls : ''), h('img', { src: e.image, alt: '' }));
    const n = h('div.id-emb' + (cls ? '.' + cls : ''));
    n.append(svgNode(emblemSvg(s, e, col)));
    return n;
  }

  /* ================================================================ 地紋 */
  function patternSvg(kind, w, hh, seed, color) {
    if (!kind || kind === 'none') return null;
    const r = rng(seed * 7919 + 13);
    const wrap = (body, defs) => svgNode(`<svg class="id-bg" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" aria-hidden="true">${defs || ''}${body}</svg>`);
    if (kind === 'guilloche') {
      // 波打つ輪を少しずつずらして重ねる(紙幣の地紋のような細い線)
      const cx = w * (0.55 + r() * 0.35), cy = hh * (0.15 + r() * 0.55), R = Math.hypot(w, hh) * 0.5;
      const lobes = 9 + Math.floor(r() * 9), amp = 3 + r() * 5, ph = r() * 6;
      let d = '';
      for (let i = 0; i < 17; i++) {
        const base = R * (0.16 + i * 0.056);
        for (let j = 0; j <= 360; j++) {
          const t = j / 360 * Math.PI * 2;
          const rr = base + amp * Math.sin(lobes * t + ph + i * 0.42) + amp * 0.5 * Math.sin((lobes * 2 + 1) * t - i * 0.3);
          d += (j ? 'L' : 'M') + (cx + rr * Math.cos(t)).toFixed(1) + ' ' + (cy + rr * Math.sin(t)).toFixed(1);
        }
      }
      return wrap(`<path d="${d}" fill="none" stroke="${color}" stroke-width=".55"/>`);
    }
    if (kind === 'waves') {
      let d = '';
      const ph = r() * 6, per = 34 + r() * 30;
      for (let y = 5; y < hh; y += 6.5) {
        for (let x = 0; x <= w; x += 4) d += (x ? 'L' : 'M') + x + ' ' + (y + 2.2 * Math.sin(x / per * Math.PI * 2 + ph + y * 0.09)).toFixed(1);
      }
      return wrap(`<path d="${d}" fill="none" stroke="${color}" stroke-width=".6"/>`);
    }
    const id = 'uidp' + (++uidSeq);
    const P = {
      dots: `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="${color}"/><circle cx="7.5" cy="7.5" r="1.1" fill="${color}"/></pattern>`,
      grid: `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="${color}" stroke-width=".6"/></pattern>`,
      lines: `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V7" stroke="${color}" stroke-width=".7"/></pattern>`
    }[kind];
    if (!P) return null;
    return wrap(`<rect width="${w}" height="${hh}" fill="url(#${id})"/>`, `<defs>${P}</defs>`);
  }

  /* ================================================================ コード・印(飾り。読み取れる規格ではない) */
  function barCode(str, color) {
    const r = rng(hashStr(str));
    let x = 0, rects = '';
    const bar = (bw) => { rects += `<rect x="${x}" width="${bw}" height="24"/>`; x += bw; };
    bar(1); x += 1; bar(1); x += 2;
    while (x < 112) { bar(1 + Math.floor(r() * 3)); x += 1 + Math.floor(r() * 2.6); }
    bar(1); x += 1; bar(1);
    return `<svg viewBox="0 0 ${x} 24" preserveAspectRatio="none" fill="${color}" aria-hidden="true">${rects}</svg>`;
  }
  function ringCode(str, color, paper) {
    const r = rng(hashStr(str));
    let out = '';
    [[27, 4.4], [20.5, 4.4], [14, 4.4]].forEach(([rad]) => {
      const n = 28, seg = 2 * Math.PI * rad / n;
      const bits = Array.from({ length: n }, () => r() > 0.42);
      bits[0] = true;
      const runs = [];
      let cur = true, cnt = 0;
      bits.forEach((b) => { if (b === cur) cnt++; else { runs.push(cnt * seg); cur = b; cnt = 1; } });
      runs.push(cnt * seg);
      if (runs.length % 2) runs.push(0);
      out += `<circle cx="32" cy="32" r="${rad}" fill="none" stroke="${color}" stroke-width="4.4" stroke-dasharray="${runs.map((v) => v.toFixed(2)).join(' ')}" transform="rotate(-90 32 32)"/>`;
    });
    out += `<circle cx="32" cy="32" r="6.5" fill="${color}"/><circle cx="32" cy="29.5" r="2" fill="${paper}"/>`;
    return `<svg viewBox="0 0 64 64" aria-hidden="true">${out}</svg>`;
  }
  function dotCode(str, color) {
    const r = rng(hashStr(str));
    const N = 11;
    const mark = (x, y) => `<rect x="${x + 0.35}" y="${y + 0.35}" width="2.3" height="2.3" rx=".9" fill="none" stroke="${color}" stroke-width=".7"/><circle cx="${x + 1.5}" cy="${y + 1.5}" r=".55" fill="${color}"/>`;
    let out = mark(0, 0) + mark(N - 3, 0) + mark(0, N - 3);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const inMark = (x < 3 && y < 3) || (x >= N - 3 && y < 3) || (x < 3 && y >= N - 3);
        if (!inMark && r() > 0.5) out += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".38" fill="${color}"/>`;
      }
    }
    return `<svg viewBox="0 0 ${N} ${N}" aria-hidden="true">${out}</svg>`;
  }
  function stampSvg(text) {
    const red = '#c8372d';
    const t = Array.from((text || '印').replace(/\s/g, '')).slice(0, 4);
    const T = (ch, x, y, fs) => `<text x="${x}" y="${y}" dy=".36em" text-anchor="middle" font-size="${fs}">${esc(ch)}</text>`;
    let body;
    if (t.length === 1) body = T(t[0], 50, 50, 46);
    else if (t.length === 2) body = T(t[0], 50, 34, 27) + T(t[1], 50, 66, 27);
    else body = T(t[0], 63, 34, 27) + T(t[1], 63, 66, 27) + (t.length === 3 ? T(t[2], 37, 50, 27) : T(t[2], 37, 34, 27) + T(t[3], 37, 66, 27));
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" fill="none" stroke="${red}" stroke-width="5"/><g fill="${red}" font-weight="700">${body}</g></svg>`;
  }

  /* ================================================================ カード */
  const CARD = { v: [340, 540], h: [540, 340] };
  const sideItems = (s, side) => s.items.filter((x) => x.side === side);
  const codeValue = (s, x) => (x.value || '').trim() || ((s.items.find((y) => y.type === 'number' && (y.value || '').trim()) || {}).value) || s.name || 'ID';

  function renderItem(s, x, P) {
    const lb = x.label ? h('div.id-lb', x.label) : null;
    const cls = 'div.id-it.t-' + x.type + (x.wide ? '.wide' : '');
    switch (x.type) {
      case 'long': return h(cls, lb, h('p.id-v', x.value));
      case 'tags': return h(cls, lb, h('div.id-tags', (x.value || '').split(/[、,，\n]/).map((v) => v.trim()).filter(Boolean).map((v) => h('span', v))));
      case 'meter': {
        const lv = clamp(Math.round(x.level || 0), 0, 5);
        return h(cls, lb, h('div.id-meter', { role: 'img', 'aria-label': `${lv} / 5` }, [0, 1, 2, 3, 4].map((i) => h('i' + (i < lv ? '.on' : '')))));
      }
      case 'number': return h(cls, lb, h('div.id-v.mono', x.value));
      case 'sign': return h(cls, lb, h('div.id-v.sign', x.value || s.name));
      case 'stamp': { const n = h(cls, lb, h('div.id-seal')); n.querySelector('.id-seal').append(svgNode(stampSvg(x.value || autoInitial(s) + '印'))); return n; }
      case 'code': {
        const v = codeValue(s, x);
        const st = x.style || 'bar';
        const g = h('div.id-code.c-' + st);
        g.append(svgNode(st === 'ring' ? ringCode(v, P['--ink'], P['--paper']) : st === 'dots' ? dotCode(v, P['--ink']) : barCode(v, P['--ink'])));
        return h(cls + '.c-' + st, g, h('div.id-code-t', lb, h('div.id-codev', v)));
      }
      default: return h(cls, lb, h('div.id-v', x.value));
    }
  }

  function renderFace(s, side, P) {
    const front = side === 'f';
    const [w, hh] = CARD[s.orient] || CARD.v;
    const items = sideItems(s, side);
    const face = h('div.id-face.' + (front ? 'front' : 'back'));
    const bg = patternSvg(s.pattern, w, hh, s.seed + (front ? 0 : 101), P['--acc']);
    if (bg) face.append(bg);
    const onBand = s.look === 'band';
    const headCol = onBand ? { fg: P['--c-ink'], bg: P['--c'] } : { fg: P['--acc'], bg: P['--paper'] };
    const wmCol = { fg: P['--acc'], bg: P['--paper'] };
    // 大きく薄く敷くマーク(透かしの表と、どの装いでも裏)
    if (s.emblem.on && (!front || s.look === 'crest') && (items.length || front)) face.append(emblemNode(s, wmCol, 'id-wm'));

    const inner = h('div.id-in');
    const headT = h('div.id-head-t',
      s.org && h('div.id-org', s.org),
      h('div.id-title', h('b', s.title), s.titleEn && h('small', s.titleEn)));
    inner.append(h('header.id-head', s.emblem.on && emblemNode(s, headCol), headT));
    if (front) {
      const ratio = s.photoShape === 'circle' ? 1 : 3 / 4;
      const slot = ed.image('photo', { ratio, round: s.photoShape === 'circle', label: '写真', compact: true, max: 1200 });
      inner.append(h('div.id-photo', h('div.id-sil', svgNode('<svg viewBox="0 0 60 80" aria-hidden="true"><circle cx="30" cy="31" r="13"/><path d="M6 80c2-17 12-25 24-25s22 8 24 25z"/></svg>')), slot));
      inner.append(h('div.id-who', h('div.id-name', s.name || '名前'), s.nameSub && h('div.id-sub', s.nameSub)));
    }
    // コードは面の下端にそろえる(項目が少なくても下が空きすぎないように)
    const main = items.filter((x) => x.type !== 'code'), foot = items.filter((x) => x.type === 'code');
    const list = h('div.id-items', { 'data-side': side },
      main.length ? h('div.id-grid', main.map((x) => renderItem(s, x, P))) : null,
      foot.length ? h('div.id-foot', foot.map((x) => renderItem(s, x, P))) : null);
    if (!front && !items.length) {
      // 裏に項目が無いときは、マークと所属名だけの裏面にする
      list.classList.add('is-plain');
      if (s.emblem.on) list.append(emblemNode(s, wmCol, 'id-big'));
      list.append(h('div.id-plain-t', s.org || s.title, s.titleEn && h('small', s.titleEn)));
    }
    inner.append(list);
    if (s.note && (front ? !s.back : true)) inner.append(h('p.id-note', s.noteText || NOTE));
    face.append(inner);
    if (s.hold !== 'none') face.append(h('span.id-hole'));
    if (s.look === 'night') face.append(h('span.id-corners', h('i'), h('i'), h('i'), h('i')));
    return face;
  }

  function cardEl(s, P, sides) {
    const card = h('div.id-card.o-' + s.orient + '.look-' + s.look + '.base-' + s.base + '.pos-' + s.photoPos + '.ph-' + s.photoShape + '.font-' + s.font + (s.hold !== 'none' ? '.has-hole' : ''), { style: P });
    sides.forEach((sd) => card.append(renderFace(s, sd, P)));
    return card;
  }

  function holdEl(s, top, cw) {
    const label = (s.org || s.titleEn || 'userid').toUpperCase();
    if (s.hold === 'strap') {
      return h('div.uid-hold.strap', { style: { height: (top + 18) + 'px' } },
        h('div.uid-strap', h('span', Array.from({ length: 6 }, () => label).join('　'))),
        h('div.uid-clasp'));
    }
    return h('div.uid-hold.reel', { style: { height: (top + 18) + 'px' } }, h('div.uid-reel'), h('div.uid-cord'), h('div.uid-clasp'));
  }

  function dimEl(len, mm, vertical) {
    return h('div.uid-dim' + (vertical ? '.v' : ''), { style: vertical ? { height: len + 'px' } : { width: len + 'px' } }, h('span', mm + ' mm'));
  }

  /** Ed に渡す描き方。1 枚のときは傾け・裏返しができる立体、両面のときは平らに並べる */
  function render() {
    const s = ed.state;
    const P = palette(s);
    const [cw, ch] = CARD[s.orient] || CARD.v;
    const one = s.view !== 'both';
    const mm = s.orient === 'h' ? ['85.6', '54.0'] : ['54.0', '85.6'];
    let sheet;
    if (one) {
      const top = s.hold !== 'none' ? 118 : 30;
      const W = cw + 130, H = top + ch + 70;
      cfg.width = W;
      const flip = h('div.uid-flip', cardEl(s, P, s.back ? ['f', 'b'] : ['f']));
      sheet = h('div.uid-sheet.one', { style: Object.assign({ width: W + 'px', height: H + 'px', '--top': top + 'px' }, P) },
        s.hold !== 'none' && holdEl(s, top, cw),
        h('div.uid-place', { style: { width: cw + 'px', height: ch + 'px' } },
          h('div.uid-shadow'),
          h('div.uid-tilt', flip),
          dimEl(cw, mm[0]), dimEl(ch, mm[1], true)));
    } else {
      const twoUp = s.orient === 'v';
      const W = twoUp ? cw * 2 + 140 : cw + 90, H = twoUp ? ch + 90 : ch * 2 + 130;
      cfg.width = W;
      const cell = (side, cap) => h('figure.uid-cell', cardEl(s, P, [side]), h('figcaption', cap));
      sheet = h('div.uid-sheet.both' + (twoUp ? '.row' : '.col'), { style: { width: W + 'px', height: H + 'px' } },
        cell('f', '表'), s.back ? cell('b', '裏') : h('p.uid-noback', '裏面は作らない設定です'));
    }
    return sheet;
  }

  /* ================================================================ Ed(保存・写真の枠) */
  const cfg = { app: 'userid', version: 1, width: 470, defaults, migrate, render, mount: $('mount') };
  const ed = Ed.create(cfg);
  // 値を変えたら次のコマで描き直す(続けて入力しても 1 コマに 1 回)
  let raf = 0;
  const redraw = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; ed.rerender(); afterRender(); });
  };
  const baseSet = ed.set;
  ed.set = (p, v, o) => { baseSet(p, v, o); redraw(); };
  const baseReset = ed.reset, baseLoad = ed.loadJson;
  ed.reset = async () => { await baseReset(); renderPanel(); afterRender(); };
  ed.loadJson = async (f) => { await baseLoad(f); renderPanel(); afterRender(); };

  /* ---------- 描いたあと: 入りきるまで面を詰め、それでもあふれたら知らせる ---------- */
  const view = { flip: false, rx: 0, ry: 0 };
  // 詰める順: 字を縮める → コードと段階を 1 行にまとめる(fit-1) → 写真と名前を小さくする(fit-2) → さらに字を縮める
  const FIT_STEPS = [[1, 0], [0.94, 0], [0.88, 0], [0.88, 1], [0.82, 1], [0.82, 2], [0.76, 2], [0.72, 2]];
  function fitItems(box) {
    const face = box.closest('.id-face');
    for (const [k, t] of FIT_STEPS) {
      box.style.setProperty('--k', String(k));
      face.classList.toggle('fit-1', t >= 1);
      face.classList.toggle('fit-2', t >= 2);
      if (box.scrollHeight <= box.clientHeight + 1) return false;
    }
    return true;
  }
  function afterRender() {
    const sheet = ed.sheet;
    if (!sheet) return;
    const over = { f: false, b: false };
    sheet.querySelectorAll('.id-items').forEach((box) => {
      const o = fitItems(box);
      box.classList.toggle('is-over', o);
      if (o) over[box.dataset.side] = true;
    });
    const where = [over.f && '表', over.b && '裏'].filter(Boolean).join('と');
    const msg = where ? `${where}の項目が入りきりません。いくつかを${over.f && !over.b ? '裏' : 'もう一方の面'}へ移すか、減らしてください。` : '';
    [$('overStage'), $('overPanel')].forEach((el) => { if (el) { el.hidden = !msg; el.textContent = msg; } });
    document.querySelectorAll('.uid-sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === ed.state.color)));
    applyTilt(false);
    applyFlip();
    syncTools();
    fitHeight();
  }
  function applyTilt(anim) {
    const t = ed.sheet && ed.sheet.querySelector('.uid-tilt');
    if (!t) return;
    t.style.transition = anim ? 'transform .7s cubic-bezier(.2,.8,.2,1)' : 'none';
    t.style.transform = `rotateX(${view.rx.toFixed(1)}deg) rotateY(${view.ry.toFixed(1)}deg)`;
    t.parentElement.style.setProperty('--sx', (-view.ry * 0.5).toFixed(1) + 'px');
    t.parentElement.style.setProperty('--sy', (14 + view.rx * 0.4).toFixed(1) + 'px');
  }
  function applyFlip() {
    const f = ed.sheet && ed.sheet.querySelector('.uid-flip');
    if (f) f.classList.toggle('flipped', view.flip && ed.state.back);
  }
  /** 縦長の画面に収める(Ed は横幅だけで縮めるので、高さが足りないときはシートをさらに縮める) */
  function fitHeight() {
    const sheet = ed.sheet;
    if (!sheet) return;
    sheet.style.zoom = '1';
    if (matchMedia('(max-width: 920px)').matches) return;
    const st = $('stage');
    const avail = st.clientHeight - 96;
    const edZoom = parseFloat(sheet.parentElement.style.zoom) || 1;
    const need = parseFloat(sheet.style.height) * edZoom;
    if (need > avail) sheet.style.zoom = String(Math.max(0.4, avail / need));
  }
  new ResizeObserver(() => fitHeight()).observe($('stage'));

  /* ---------- 見え方の切り替え・裏返す・傾ける ---------- */
  function syncTools() {
    const s = ed.state;
    $('viewSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === (s.view === 'both' ? 'both' : 'one'))));
    $('flipBtn').hidden = s.view === 'both' || !s.back;
    $('flipBtn').textContent = view.flip && s.back ? '表に戻す' : '裏返す';
    $('straightBtn').hidden = s.view === 'both';
    $('tip').hidden = s.view === 'both';
  }
  $('viewSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ed.set('view', b.dataset.view);
  });
  $('flipBtn').addEventListener('click', () => { view.flip = !view.flip; applyFlip(); syncTools(); });
  $('straightBtn').addEventListener('click', () => { view.rx = 0; view.ry = 0; applyTilt(true); });
  const stage = $('stage');
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (ed.state.view === 'both' || e.button > 0) return;
    if (e.target.closest('.ed-img, button, input, select, textarea, a, .uid-tools')) return;
    drag = { x: e.clientX, y: e.clientY, rx: view.rx, ry: view.ry, id: e.pointerId };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
    stage.classList.add('is-tilting');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    view.ry = clamp(drag.ry + (e.clientX - drag.x) * 0.3, -38, 38);
    view.rx = clamp(drag.rx - (e.clientY - drag.y) * 0.3, -30, 30);
    applyTilt(false);
  });
  const endDrag = (e) => { if (!drag || e.pointerId !== drag.id) return; drag = null; stage.classList.remove('is-tilting'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', (e) => { if (e.target.closest('.ed-img, .uid-tools')) return; view.rx = 0; view.ry = 0; applyTilt(true); });

  /* ================================================================ 書き出し(PNG) */
  const H2I_URL = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';
  let h2iPromise = null;
  function loadH2I() {
    if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
    if (!h2iPromise) {
      h2iPromise = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = H2I_URL;
        sc.onload = () => (window.htmlToImage ? resolve(window.htmlToImage) : reject(new Error('画像を作る部品を読み込めませんでした')));
        sc.onerror = () => { h2iPromise = null; reject(new Error('画像を作る部品を読み込めませんでした。通信を確かめてください')); };
        document.head.append(sc);
      });
    }
    return h2iPromise;
  }
  // カードの書体は Google Fonts。書き出しでは、カードに出る字だけに絞った書体(text=)を取り寄せ、データにして画像に埋める
  const FONT_FAMILIES = ['Noto+Sans+JP:wght@400;500;700', 'Shippori+Mincho:wght@500;700', 'Zen+Maru+Gothic:wght@500;700', 'IBM+Plex+Mono:wght@400;500;600', 'Klee+One:wght@600'];
  const fontCssCache = new Map();
  const toDataUrl = (blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });
  async function fontCss(text) {
    const chars = Array.from(new Set(Array.from(text + '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,-/・'))).filter((c) => c.trim()).join('');
    if (fontCssCache.has(chars)) return fontCssCache.get(chars);
    const parts = await Promise.all(FONT_FAMILIES.map(async (fam) => {
      const res = await fetch(`https://fonts.googleapis.com/css2?family=${fam}&text=${encodeURIComponent(chars)}`);
      if (!res.ok) throw new Error('書体を取り寄せられませんでした');
      let css = await res.text();
      const urls = Array.from(new Set((css.match(/url\((https:[^)]+)\)/g) || []).map((u) => u.slice(4, -1))));
      for (const u of urls) css = css.split(u).join(await toDataUrl(await (await fetch(u)).blob()));
      return css;
    }));
    const css = parts.join('\n');
    fontCssCache.set(chars, css);
    return css;
  }
  const EXPORT_SIDES = [['f', '表'], ['b', '裏'], ['both', '両面を並べる']];
  const EXPORT_SCALE = 3;   // 540px → 1620px(85.6mm でおよそ 480dpi)
  /** 1 面を画像にする(画面の外に平らに組み直し、ストラップの穴は透明に抜く) */
  async function faceCanvas(lib, s, P, sd) {
    const host = $('exportHost');
    const card = cardEl(s, P, [sd]);
    card.classList.add('is-export');
    host.replaceChildren(card);
    card.querySelectorAll('.id-items').forEach((b) => { fitItems(b); b.classList.remove('is-over'); });
    const css = await fontCss(card.textContent);
    const cv = await lib.toCanvas(card, {
      pixelRatio: EXPORT_SCALE, fontEmbedCSS: css, cacheBust: false,
      filter: (n) => !(n.classList && n.classList.contains('ed-ui'))
    });
    if (s.hold !== 'none') {
      const g = cv.getContext('2d'), k = EXPORT_SCALE, w = cv.width / k;
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      g.roundRect((w - 44) / 2 * k, 11 * k, 44 * k, 9 * k, 4.5 * k);
      g.fill();
    }
    return cv;
  }
  async function exportCard() {
    const s = ed.state;
    const which = s.back ? (s.exportSide || 'f') : 'f';
    const lib = await loadH2I();
    const P = palette(s);
    const canvases = [];
    try {
      for (const sd of which === 'both' ? ['f', 'b'] : [which]) canvases.push(await faceCanvas(lib, s, P, sd));
    } finally { $('exportHost').replaceChildren(); }
    let out = canvases[0];
    if (canvases.length > 1) {
      // 両面: 縦型は横に、横型は縦に並べる(間は透明)
      const gap = 40 * EXPORT_SCALE, row = s.orient !== 'h', [a, b] = canvases;
      out = document.createElement('canvas');
      out.width = row ? a.width + gap + b.width : a.width;
      out.height = row ? a.height : a.height + gap + b.height;
      const g = out.getContext('2d');
      g.drawImage(a, 0, 0);
      g.drawImage(b, row ? a.width + gap : 0, row ? 0 : a.height + gap);
    }
    const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('画像を作れませんでした');
    const tag = { f: 'front', b: 'back', both: 'both' }[which];
    await U.saveImage(blob, `userid-${U.safeName(s.name || 'card')}-${tag}.png`);
  }

  /* ================================================================ 設定の欄 */
  const side = $('side');
  const sideTop = h('div.uid-side-top', ed.statusEl, h('span.kit-spacer'), ed.fileMenu({ resetLabel: '最初に戻す', resetHint: '入力した内容と画像を消して、社員証のひな形に戻します' }));
  const sideBody = h('div.uid-side-body');
  // 保存のボタンは設定の欄の下に貼りつけて、どこまで見ていても押せるようにする
  const exportBtn = h('button.btn.btn-primary', { type: 'button' }, icon('download', 17), 'PNG で保存');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try { await exportCard(); } catch (e) { console.error(e); U.toast(e.message || '画像にできませんでした', 'error'); }
    finally { exportBtn.disabled = false; }
  });
  const exportSeg = h('div.uid-export-seg');
  const actions = h('div.uid-actions', exportSeg, exportBtn);
  side.append(sideTop, sideBody, actions);
  function renderExportSeg() {
    const s = ed.state;
    const opts = s.back ? EXPORT_SIDES : EXPORT_SIDES.slice(0, 1);
    exportSeg.replaceChildren(seg('保存する面', opts, s.back ? (s.exportSide || 'f') : 'f', (v) => { ed.state.exportSide = v; ed.dirty(); }));
  }

  const sec = (title, ...kids) => h('section.uid-sec', h('h2', title), ...kids);
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
  const input = (path, o) => h('input', Object.assign({ type: 'text', value: ed.get(path) || '', oninput: (e) => ed.set(path, e.target.value) }, o || {}));
  const touchSet = (p, v) => { ed.state.touched = true; ed.set(p, v); };

  function renderPanel() {
    const s = ed.state;
    sideBody.replaceChildren(secPreset(s), secBasic(s), secItems(s), secEmblem(s), secLook(s), secBack(s));
    renderExportSeg();
  }

  /* ---------- ひな形 ---------- */
  function secPreset(s) {
    const box = h('div.uid-presets');
    PRESETS.forEach((p) => box.append(h('button', {
      type: 'button', 'aria-pressed': String(s.preset === p.id),
      onclick: async () => {
        const message = p.id === 'blank'
          ? 'いま並んでいる項目をすべて外して、項目なしから作り直します。名前・写真・見た目は残ります。'
          : `項目を「${p.label}」のひな形に入れ替えます。いま並んでいる項目は消えます。名前・写真と、自分で書いた所属名は残ります。`;
        if (ed.state.touched && !(await U.confirmDialog({ title: 'ひな形を当てる', message, okLabel: p.id === 'blank' ? '外す' : '入れ替える' }))) return;
        applyPreset(ed.state, p);
        view.flip = false;
        ed.dirty();
        renderPanel();
        redraw();
      }
    }, h('b', p.label), h('small', p.desc))));
    return sec('ひな形', box, h('p.hint', '選ぶと、項目と見た目がそのひな形に入れ替わります。名前・写真と、自分で書いた所属名はそのまま残ります。'));
  }

  /* ---------- 名前と所属 ---------- */
  function secBasic(s) {
    return sec('名前と所属',
      h('div.grid-2',
        field('名前', input('name', { placeholder: '朝霧 灯' })),
        field('読み・英字', input('nameSub', { placeholder: 'AKARI ASAGIRI' }))),
      field('所属名', input('org', { placeholder: '会社・学校・団体の名前' }), '空欄なら、カードに出しません'),
      h('div.grid-2',
        field('カードの名前', input('title', { placeholder: '社員証' })),
        field('英字の添え', input('titleEn', { placeholder: 'STAFF ID' }))),
      h('div.uid-row',
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: fromProf }, icon('book', 16), 'userprof から読み込む'),
        h('span.hint', '写真はカードの写真の枠を押して選びます')));
  }
  async function fromProf() {
    const r = await Ed.pickUserprof();
    if (!r) return;
    const u = r.user, str = (v) => (typeof v === 'string' ? v.trim() : '');
    const s = ed.state;
    if (str(u.name)) s.name = str(u.name);
    if (str(u.reading)) s.nameSub = str(u.reading);
    if (r.image) s.photo = r.image;
    if (window.Store && Store.colorHex) s.color = safeHex(Store.colorHex(u), s.color);
    const MAP = [[/好き/, 'likes'], [/苦手|嫌い/, 'dislikes'], [/年齢/, 'age'], [/誕生日|生年月日/, 'birthday'], [/身長/, 'height'], [/一人称/, 'firstPerson'],
      [/職業|役職|仕事/, 'occupation'], [/性格|ひとこと|一言/, 'personality'], [/自己紹介|紹介/, 'bio']];
    // userprof で自分で足した項目は、項目名が同じものに入れる
    const extra = (Array.isArray(u.extra) ? u.extra : []).filter((x) => x && str(x.label) && str(x.value));
    let n = 0;
    s.items.forEach((x) => {
      if (!('value' in x)) return;
      const m = MAP.find(([re]) => re.test(x.label));
      const own = extra.find((e) => str(e.label) === str(x.label));
      const v = m && str(u[m[1]]) ? str(u[m[1]]) : own ? str(own.value) : '';
      if (v) { x.value = v; n++; }
    });
    ed.dirty();
    renderPanel();
    redraw();
    U.toast(n ? `名前・写真・色と、${n} 個の項目を読み込みました` : '名前・写真・色を読み込みました');
  }

  /* ---------- 載せる項目 ---------- */
  function secItems(s) {
    const group = (sd, title) => {
      const list = h('div.uid-items');
      s.items.forEach((x, i) => { if (x.side === sd) list.append(itemEditor(x, i)); });
      if (!list.children.length) list.append(h('p.hint.uid-empty', sd === 'f' ? '表に項目がありません。' : '裏に項目がありません。裏面にはマークと所属名だけが出ます。'));
      const add = h('select.uid-add', { 'aria-label': `${title}に項目を足す` },
        h('option', { value: '' }, `＋ ${title}に項目を足す`),
        Object.entries(TYPES).map(([k, t]) => h('option', { value: k }, t.label)));
      add.addEventListener('change', () => {
        if (!add.value) return;
        ed.state.items.push(newItem(add.value, sd));
        ed.state.touched = true;
        ed.dirty();
        renderPanel();
        redraw();
      });
      return h('div.uid-group', h('h3', title), list, add);
    };
    return sec('載せる項目',
      h('p.uid-over', { id: 'overPanel', hidden: true }),
      group('f', '表'),
      s.back ? group('b', '裏') : h('p.hint', '裏面を作らない設定なので、裏の項目はありません。下の「裏面と注記」で切り替えられます。'));
  }
  function moveItem(i, dir) {
    const a = ed.state.items, x = a[i];
    let j = i + dir;
    while (j >= 0 && j < a.length && a[j].side !== x.side) j += dir;
    if (j < 0 || j >= a.length) return;
    a[i] = a[j];
    a[j] = x;
    ed.state.touched = true;
    ed.dirty();
    renderPanel();
    redraw();
  }
  function itemEditor(x, i) {
    const p = 'items.' + i;
    const restruct = () => { ed.state.touched = true; ed.dirty(); renderPanel(); redraw(); };
    const top = h('div.uid-it-top',
      h('span.uid-type', TYPES[x.type].label),
      h('input', { type: 'text', value: x.label, placeholder: x.type === 'code' ? '名前(なくてもよい)' : '項目の名前', 'aria-label': '項目の名前', oninput: (e) => touchSet(p + '.label', e.target.value) }),
      h('button.uid-mini', { type: 'button', title: '表と裏を入れ替える', onclick: () => { x.side = x.side === 'f' ? 'b' : 'f'; restruct(); } }, x.side === 'f' ? '裏へ' : '表へ'),
      h('button.uid-mini', { type: 'button', 'aria-pressed': String(!!x.wide), title: '横いっぱいに使う', onclick: () => { x.wide = !x.wide; restruct(); } }, '全幅'),
      h('button.btn.btn-icon.btn-ghost', { type: 'button', title: '上へ', 'aria-label': '上へ', onclick: () => moveItem(i, -1) }, icon('up', 15)),
      h('button.btn.btn-icon.btn-ghost', { type: 'button', title: '下へ', 'aria-label': '下へ', onclick: () => moveItem(i, 1) }, icon('down', 15)),
      h('button.btn.btn-icon.btn-ghost.danger', { type: 'button', title: '外す', 'aria-label': '外す', onclick: () => { ed.state.items.splice(i, 1); restruct(); } }, icon('close', 15)));
    let val;
    const vin = (o) => h('input', Object.assign({ type: 'text', value: x.value || '', 'aria-label': (x.label || TYPES[x.type].label) + 'の中身', oninput: (e) => touchSet(p + '.value', e.target.value) }, o || {}));
    switch (x.type) {
      case 'long':
        val = h('textarea', { rows: 2, 'aria-label': (x.label || '長い文') + 'の中身', oninput: (e) => touchSet(p + '.value', e.target.value) });
        val.value = x.value || '';
        break;
      case 'tags': val = vin({ placeholder: '「、」で区切って並べます' }); break;
      case 'meter': {
        const out = h('output', String(x.level || 0) + ' / 5');
        val = h('div.uid-row', h('input', { type: 'range', min: 0, max: 5, step: 1, value: x.level || 0, 'aria-label': (x.label || '段階') + 'の段階', oninput: (e) => { out.textContent = e.target.value + ' / 5'; touchSet(p + '.level', Number(e.target.value)); } }), out);
        break;
      }
      case 'number': {
        const inp = vin({ placeholder: '0000-0000' });
        val = h('div.uid-row', inp, h('button.btn.btn-outline.btn-sm', {
          type: 'button', title: '数字だけを選び直します。ほかの字と並びは残します',
          onclick: () => { const v = (x.value || '0000-0000').replace(/[0-9]/g, () => String(Math.floor(Math.random() * 10))); inp.value = v; touchSet(p + '.value', v); }
        }, icon('refresh', 15), '振り直す'));
        break;
      }
      case 'sign': val = vin({ placeholder: '空欄なら名前が入ります' }); break;
      case 'stamp': val = vin({ placeholder: '印の字。4 字までで、空欄なら所属名の 1 字目が入ります' }); break;
      case 'code':
        val = h('div.uid-col',
          seg('コードの形', CODE_STYLES, x.style || 'bar', (v) => touchSet(p + '.style', v)),
          vin({ placeholder: '空欄なら番号の項目と同じ字が入ります' }));
        break;
      default: val = vin();
    }
    return h('div.uid-it', top, val);
  }

  /* ---------- 所属マーク ---------- */
  function secEmblem(s) {
    const e = s.emblem;
    const restruct = () => { ed.dirty(); renderPanel(); redraw(); };
    const onBox = h('label.check', h('input', { type: 'checkbox', checked: e.on, onchange: (ev) => { e.on = ev.target.checked; restruct(); } }), 'カードに所属マークを出す');
    if (!e.on) return sec('所属マーク', onBox);
    const prev = { fg: '#3a3550', bg: '#ffffff' };
    const choice = (key, entries, cur, mk) => {
      const box = h('div.uid-choices', { role: 'group' });
      entries.forEach(([k, label]) => {
        const b = h('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': String(k === cur), onclick: () => { e[key] = k; e.mode = 'make'; restruct(); } });
        b.append(k === 'none' ? h('span', label) : svgNode(mk(k)));
        box.append(b);
      });
      return box;
    };
    const shapes = choice('shape', Object.entries(SHAPES).map(([k, v]) => [k, v.label]), e.shape,
      (k) => emblemSvg(s, Object.assign({}, e, { shape: k, deco: 'line', fill: 'line', symbol: '_' }), prev));
    const symbols = choice('symbol', Object.entries(SYMBOLS).map(([k, v]) => [k, v.label]), e.symbol,
      (k) => emblemSvg(s, Object.assign({}, e, { shape: 'none', deco: 'line', fill: 'line', symbol: k }), prev));
    const imgIn = h('input', { type: 'file', accept: 'image/*', hidden: true });
    imgIn.addEventListener('change', async () => {
      const f = imgIn.files[0];
      imgIn.value = '';
      if (!f) return;
      try { e.image = await U.fileToDataUrl(f, 600); e.mode = 'image'; restruct(); } catch (err) { U.toast('画像を読み込めませんでした', 'error'); }
    });
    const body = e.mode === 'image'
      ? [h('div.uid-row',
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => imgIn.click() }, icon('image', 16), '画像を選び直す'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { e.image = ''; e.mode = 'make'; restruct(); } }, '画像を外す')),
        h('p.hint', '透明な部分のある PNG だと、カードの地になじみます。')]
      : [
        field('外形', shapes),
        field('中の記号', symbols),
        h('div.grid-2',
          field('飾り', seg('飾り', DECOS, e.deco, (v) => { e.deco = v; restruct(); })),
          field('塗り', seg('塗り', [['line', '線だけ'], ['solid', '塗る']], e.fill, (v) => { e.fill = v; restruct(); }))),
        e.symbol === 'initial' && field('頭文字', input('emblem.text', { placeholder: autoInitial(s), maxlength: 3 }), '3 字までです。空欄なら所属名の 1 字目が入ります'),
        e.deco === 'ring' && field('輪の文字', input('emblem.ring', { placeholder: autoRing(s) || 'IDENTIFICATION' }), '空欄なら所属名と英字の添えが入ります')];
    return sec('所属マーク', onBox,
      seg('マークの作り方', [['make', '組み立てる'], ['image', '画像を使う']], e.mode, (v) => {
        if (v === 'image' && !e.image) { imgIn.click(); return; }
        e.mode = v;
        restruct();
      }),
      imgIn,
      ...body.filter(Boolean),
      e.mode !== 'image' && h('div.uid-row', h('button.btn.btn-outline.btn-sm', {
        type: 'button',
        onclick: () => {
          e.shape = pick(Object.keys(SHAPES).filter((k) => k !== 'none'));
          e.symbol = pick(Object.keys(SYMBOLS));
          e.deco = pick(DECOS.map((d) => d[0]));
          e.fill = pick(['line', 'solid']);
          restruct();
        }
      }, icon('sparkle', 16), 'ランダムに組む'), h('span.hint', '外形・記号・飾り・塗りを選び直します')));
  }

  /* ---------- 見た目 ---------- */
  function secLook(s) {
    const restruct = () => { ed.dirty(); renderPanel(); redraw(); };
    const lookHint = h('p.hint', (LOOKS.find((l) => l[0] === s.look) || LOOKS[0])[2]);
    const sw = h('div.uid-swatches',
      SWATCHES.map((c) => h('button.uid-sw', { type: 'button', 'data-c': c, title: c.toUpperCase(), 'aria-label': `色 ${c.toUpperCase()}`, 'aria-pressed': String(c === s.color), style: { '--sw': c }, onclick: () => ed.set('color', c) })),
      ed.color('color', { title: 'カード', code: false, sources: () => (ed.state.photo && ed.state.photo.src ? [{ src: ed.state.photo.src, label: '写真' }] : []) }));
    return sec('見た目',
      h('div.grid-2',
        field('向き', seg('向き', [['v', '縦'], ['h', '横']], s.orient, (v) => ed.set('orient', v))),
        field('写真の位置', seg('写真の位置', POSITIONS, s.photoPos, (v) => ed.set('photoPos', v)))),
      field('装い', seg('装い', LOOKS.map((l) => [l[0], l[1]]), s.look, (v) => { s.look = v; restruct(); })),
      lookHint,
      h('div.grid-2',
        field('地の色', seg('地の色', BASES, s.base, (v) => ed.set('base', v))),
        field('写真の形', seg('写真の形', PHOTO_SHAPES, s.photoShape, (v) => ed.set('photoShape', v)))),
      field('色', sw, '帯・線・マークの色です。丸を押すと、写真から色を拾うこともできます'),
      field('書体', seg('書体', FONTS, s.font, (v) => ed.set('font', v))),
      field('地紋', h('div.uid-row',
        seg('地紋', PATTERNS, s.pattern, (v) => ed.set('pattern', v)),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', title: '紋様と波の形を選び直します', onclick: () => ed.set('seed', Math.floor(Math.random() * 100000)) }, icon('refresh', 15), '振り直す'))),
      field('吊り方', seg('吊り方', HOLDS, s.hold, (v) => ed.set('hold', v)), 'ストラップとリールは画面だけの飾りです。画像にはカードの穴だけが入ります'));
  }

  /* ---------- 裏面と注記 ---------- */
  function secBack(s) {
    const ta = h('textarea', { rows: 3, 'aria-label': '注記の文', oninput: (e) => ed.set('noteText', e.target.value) });
    ta.value = s.noteText || '';
    return sec('裏面と注記',
      h('label.check', h('input', { type: 'checkbox', checked: s.back, onchange: (e) => { s.back = e.target.checked; if (!s.back) view.flip = false; ed.dirty(); renderPanel(); redraw(); } }), '裏面も作る'),
      h('label.check', h('input', { type: 'checkbox', checked: s.note, onchange: (e) => { s.note = e.target.checked; ed.dirty(); renderPanel(); redraw(); } }), '注記を小さく入れる'),
      s.note && field('注記の文', ta, s.back ? '裏面のいちばん下に入ります' : '表のいちばん下に入ります'),
      s.note && h('div.uid-row', h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { ta.value = NOTE; ed.set('noteText', NOTE); } }, icon('undo', 15), '最初の文に戻す')),
      h('p.hint', '実在の会社や学校の名前を入れたカードが本物の身分証と取り違えられないように、注記を入れています。'));
  }

  /* ================================================================ 始め */
  Kit.mountBar('userid');
  document.body.append(Kit.footer());
  (async () => {
    await ed.load();   // 読み終える前に組むと、見本の中身で保存を上書きしてしまうので先に読む
    renderPanel();
    ed.rerender();
    afterRender();
    // 書体が届いたら、字の幅が変わるので入りきるかを測り直す
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => afterRender());
  })();
})();
