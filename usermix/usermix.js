/* usermix: 2 人のためのプレイリストを、音楽アプリの画面のような 1 枚の画像にする。
   見た目は プレイリスト(list・縦長 760px) と 再生画面(player・横長 1040px) の 2 つ。中身(state)は同じで、render だけを分ける。
   曲ごとに「選んだ人」by(a = 1 人目・b = 2 人目・ab = 2 人)を持ち、印は名前の 1 字目(people[i].mark で変えられる)の丸。
   再生中の曲は now(曲の番号)、再生位置は pos(「1:24」)。並びは曲順(order)か選んだ人ごと(person)。
   再生ボタンなどの操作の印は飾り(押しても何も起きない)。同じ値を何か所にも出すときは、書けるのは曲目の行だけで、ほかは写し(data-mirror)。
   3 つ目の見た目 ジャケット(jacket・600px 四方)は jacket.js(UmJacket)。曲ごとの設定は tracks[].jk、表紙は coverJk、作る曲は jkAt */
(function () {
  'use strict';
  const { h, icon } = U;
  const { normHex, toHex } = ColorPick;

  Kit.mountBar('usermix');

  const LAYOUTS = [['list', 'プレイリスト'], ['player', '再生画面'], ['jacket', 'ジャケット']];
  const WIDTH = { list: 760, player: 1040, jacket: 600 };   // シートの幅(ed-app の幅 1100px に収まるように。ジャケットは 2 倍で 1200 × 1200 px)
  const BY = ['a', 'b', 'ab'];                 // 印を押したときに替わる順
  const ORDERS = [['order', '曲順'], ['person', '選んだ人ごと']];
  const SHOW = [['cover', 'ジャケットの画像'], ['disc', 'レコード'], ['intro', '紹介'], ['art', '曲ごとの画像'], ['time', '時間'], ['note', 'ひとこと'],
    ['line', '好きな一節'], ['picker', '選んだ人の印'], ['total', '曲数と合計'], ['player', '再生中の曲'], ['foot', '下の一文']];

  const person = () => ({ name: '', mark: '', color: '' });
  const track = (by) => ({ title: '', artist: '', time: '', note: '', line: '', by: by || 'a', image: null, jk: UmJacket.normalize() });
  const defaults = () => ({
    layout: 'list', theme: 'basic', palette: {},
    label: '', title: '', intro: '', foot: '', pos: '',
    cover: null,
    people: [person(), person()],
    show: { cover: true, disc: true, intro: true, art: true, time: true, note: true, line: true, picker: true, total: true, player: true, foot: true },
    split: 'order', now: 0,
    tracks: [track('a'), track('b'), track('ab')],
    coverJk: UmJacket.normalize(), jkAt: null   // 表紙のジャケットの設定・ジャケットを作る曲(null = 再生中の曲、'cover' = 表紙)
  });
  /** v = 保存したときの版。版 1 の 'jacket' は最初の試作(見開き)なので再生画面に寄せる。版 2 からはジャケット */
  function migrate(s, v) {
    const out = Object.assign(defaults(), s || {});
    out.show = Object.assign(defaults().show, s && s.show);
    out.people = [0, 1].map((i) => Object.assign(person(), s && Array.isArray(s.people) && s.people[i]));
    out.tracks = (Array.isArray(s && s.tracks) ? s.tracks : []).map((t) => Object.assign(track(), t, { by: BY.includes(t && t.by) ? t.by : 'a', jk: UmJacket.normalize(t && t.jk) }));
    out.coverJk = UmJacket.normalize(s && s.coverJk);
    if (!(out.jkAt === null || out.jkAt === 'cover' || Number.isInteger(out.jkAt))) out.jkAt = null;
    if (out.layout === 'jacket' && !(v >= 2)) out.layout = 'player';   // 最初の試作(見開き)の保存
    if (!WIDTH[out.layout]) out.layout = 'list';
    if (out.split !== 'person') out.split = 'order';
    if (!Number.isInteger(out.now)) out.now = 0;
    delete out.splitAt;
    return out;
  }

  const app = document.getElementById('app');
  const toolbar = h('div.ed-toolbar');
  const tip = Ed.help('usermix', [
    '見た目は「プレイリスト」（縦長）、「再生画面」（横長）、「ジャケット」（正方形）から選べます。切り替えても、書いた内容はそのまま残ります。',
    '「ジャケット」では曲ごとの画像を地にして、題を重ねた 1200 × 1200 px の画像を作ります。作る曲は「曲」の矢印で選び、「表紙」ではプレイリストの題で作ります。',
    '書体は「書体」から、いまの題と画像の見本で比べて選べます。Google Fonts のおすすめのほか、端末に入っているフォントの名前や、フォントファイルでも選べます。フォントファイルはこのブラウザの中にだけ保存します。',
    '「まとめて保存」では画像の入った曲のジャケットを、曲順の番号を付けて保存します。',
    '文字は押してそのまま書けます。アーティストの左の丸い印を押すと、選んだ人が 1 人目、2 人目、2 人の順に替わります。',
    '印の字と色、2 人の名前は「選んだ人」で変えられます。印の字を空けておくと、名前の 1 字目を使います。',
    '曲の右のボタンで、再生中の曲を選んだり、順番を入れ替えたりします。「並び」で選んだ人ごとにまとめることもできます。',
    '再生中の曲の曲名やアーティストは、曲目の行で書き換えます。再生位置を「1:24」の形で書くと、進み具合のバーに表します。',
    '時間を「3:45」の形で書くと、すべての曲の時間がそろったときに合計の時間を出します。',
    '好きな一節には歌詞の短い一部分だけを書いてください。',
    '「動画で保存」ではレコードが回って再生位置が進む短い動画を、MP4 か GIF で作れます。音は入りません。',
    '内容はこのブラウザに自動で保存されます。控えは「ファイル」から .json ファイルとして書き出せます。',
    '「画像で保存」は Ctrl+S（Mac は ⌘S）でもできます。'
  ]);
  app.append(toolbar, tip);

  const ed = Ed.create({ app: 'usermix', version: 2, width: WIDTH.list, defaults, migrate, render, mount: app });
  let jacket = null;   // ジャケットの見た目(起動のところで作る)
  const T = () => ed.state.tracks;

  /* ---------------------------------------------------------------- 操作の印(飾り) */
  const SVG = {
    play: ['fill', '<path d="M8 5.2v13.6L19 12z"/>'],
    pause: ['fill', '<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/>'],
    prev: ['fill', '<path d="M6 5h2.2v14H6zM19 5.5v13L9.5 12z"/>'],
    next: ['fill', '<path d="M15.8 5H18v14h-2.2zM5 5.5v13l9.5-6.5z"/>'],
    shuffle: ['line', '<path d="M3.5 7h3c4.5 0 6.5 10 11 10h3M3.5 17h3c1.7 0 3-1.4 4.2-3.3M13.3 10.3C14.5 8.4 15.8 7 17.5 7h3M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5"/>'],
    repeat: ['line', '<path d="M4.5 11.5V10a3 3 0 0 1 3-3h12M16.5 4l3 3-3 3M19.5 12.5V14a3 3 0 0 1-3 3h-12M7.5 20l-3-3 3-3"/>'],
    heart: ['line', '<path d="M12 19.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z"/>'],
    more: ['fill', '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>'],
    note: ['line', '<path d="M9 17.5V6l10.5-2.2v11.4"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17" cy="15.2" r="2.5"/>'],
    clock: ['line', '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'],
    save: ['line', '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v7.5m0 0-3-3m3 3 3-3"/>']
  };
  function glyph(name, size, cls) {
    const [kind, body] = SVG[name];
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'um-ic' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    if (kind === 'fill') s.setAttribute('fill', 'currentColor');
    else { s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); }
    s.innerHTML = body;
    return s;
  }
  const playBtn = (size, ic, cls) => h('span.um-play' + (cls ? '.' + cls : ''), glyph(ic || 'play', size));
  /** 再生中の曲の印(音の大きさのバー) */
  const eqBars = () => h('span.um-eq', h('i'), h('i'), h('i'), h('i'));

  /* ---------------------------------------------------------------- 色(選んだ人の印と画面の地) */
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return toHex(...x.map((v, i) => v * t + y[i] * (1 - t))); };
  const lum = (hex) => {
    const [r, g, b] = rgbOf(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const inkOn = (hex) => (1.05 / (lum(hex) + 0.05) >= 3 ? '#ffffff' : '#1f1d26');
  function hslOf(hex) {
    const [r, g, b] = rgbOf(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(hh * 60 + 360) % 360, s, l];
  }
  function hexOfHsl(hh, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
    return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  /**
   * 2 人の印の色。決めていなければ、1 人目はテーマのメインの色、2 人目は 1 人目の色相を 150° 回した色
   * (色味の薄いテーマでは 1 人目を淡くした色。印は字でも見分けられる)
   */
  function peopleColors() {
    const t = Ed.themeColors(ed.state.theme, ed.state.palette), own = (i) => normHex(ed.state.people[i].color);
    const a = own(0) || t.main;
    let b = own(1);
    if (!b) { const [hh, s, l] = hslOf(a); b = s < 0.15 ? mix(a, t.card, 0.45) : hexOfHsl((hh + 150) % 360, s, l); }
    return { a, b };
  }
  /** 印の色と、画面の地の色(プレイリストの上の色・再生画面の暗い地) */
  function sheetVars() {
    const c = peopleColors(), t = Ed.themeColors(ed.state.theme, ed.state.palette);
    return {
      '--pa': c.a, '--pb': c.b, '--pa-ink': inkOn(c.a), '--pb-ink': inkOn(c.b),
      '--t-top': mix(t.main, t.bg, 0.24), '--t-deep': mix(t.main, '#0d0b16', 0.42), '--t-deeper': mix(t.main, '#0d0b16', 0.16)
    };
  }
  // テーマや色を変えたとき(ed.set からも ed.dirty が呼ばれる)、印と地の色も合わせる。シートは作り直さない
  const paintVars = () => {
    if (!ed.sheet) return;
    Object.entries(sheetVars()).forEach(([k, v]) => ed.sheet.style.setProperty(k, v));
    const t = Ed.themeColors(ed.state.theme, ed.state.palette);
    if (t.main + t.ink !== recTheme) paintRecords();   // レコードのラベル(画像がないとき)はメインの色
  };
  const dirty0 = ed.dirty;
  ed.dirty = () => { dirty0(); paintVars(); };

  /** 印の字: 決めた字(2 字まで) → 名前の 1 字目 → A・B */
  function markChar(i) {
    const p = ed.state.people[i];
    const m = Array.from((p.mark || '').trim()).slice(0, 2).join('') || Array.from((p.name || '').trim())[0];
    return m || (i ? 'B' : 'A');
  }
  const whoIndex = (who) => (who === 'b' ? 1 : 0);
  const nameOf = (i) => (ed.state.people[i].name || '').trim() || `${i + 1} 人目`;
  function badge(who) {
    const c = markChar(whoIndex(who));
    return h('span.um-badge.' + who + (Array.from(c).length > 1 ? '.two' : ''), { 'data-who': who }, c);
  }
  const byLabel = (by) => (by === 'ab' ? `${nameOf(0)}と${nameOf(1)}` : nameOf(whoIndex(by)));

  /** 名前や印の字を変えたとき、シートの印・名前をまとめて書き換える(書いている欄 except と入力中の欄はそのまま) */
  function syncPeople(except) {
    const sh = ed.sheet;
    if (!sh) return;
    sh.querySelectorAll('.um-badge').forEach((b) => {
      const c = markChar(whoIndex(b.dataset.who));
      b.textContent = c;
      b.classList.toggle('two', Array.from(c).length > 1);
    });
    sh.querySelectorAll('[data-person]').forEach((el) => {
      if (el === except || el === document.activeElement) return;
      const v = ed.state.people[+el.dataset.person].name || '';
      el.textContent = v;
      el.classList.toggle('is-empty', !v.trim());
    });
    sh.querySelectorAll('[data-pname]').forEach((el) => { el.textContent = nameOf(+el.dataset.pname); });
    sh.querySelectorAll('.um-mark').forEach((b) => b.setAttribute('aria-label', `選んだ人: ${byLabel(b.dataset.by)}（押して替える）`));
    paintVars();
  }

  /* ---------------------------------------------------------------- 時間と曲数 */
  /** 「3:45」「1:02:03」「3分45秒」を秒に。読めなければ null */
  function secOf(v) {
    const t = String(v || '').trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[：]/g, ':');
    let m = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(t);
    if (m) return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    m = /^(?:(\d+)\s*分)?\s*(?:(\d+)\s*秒)?$/.exec(t);
    if (m && (m[1] || m[2])) return +(m[1] || 0) * 60 + +(m[2] || 0);
    return null;
  }
  const pad2 = (x) => String(x).padStart(2, '0');
  const fmtSec = (n) => { const hh = Math.floor(n / 3600), mm = Math.floor((n % 3600) / 60), ss = n % 60; return hh ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${mm}:${pad2(ss)}`; };
  /** 書き出しで出す曲か(何か書いてあるか) */
  const blank = (t) => !['title', 'artist', 'time', 'note', 'line'].some((k) => String(t[k] || '').trim()) && !(t.image && t.image.src);
  /** 曲数と合計の時間の文。時間は、曲名かアーティストを書いた曲すべてで読めたときだけ足す */
  function totalText(list) {
    const xs = list.filter((t) => String(t.title || '').trim() || String(t.artist || '').trim());
    if (!xs.length) return '';
    const secs = xs.map((t) => secOf(t.time));
    const time = ed.state.show.time && secs.every((x) => x != null) ? `・${fmtSec(secs.reduce((a, b) => a + b, 0))}` : '';
    return `${xs.length} 曲${time}`;
  }
  /** 再生中の曲の番号(曲がなければ -1) */
  const nowIdx = () => { const n = T().length, k = ed.state.now; return !n ? -1 : Number.isInteger(k) && k >= 0 && k < n ? k : 0; };
  /** 進み具合(0〜1)。再生位置か曲の時間が読めなければ 4 割ほど */
  function progress() {
    const k = nowIdx(), d = k >= 0 ? secOf(T()[k].time) : null, p = secOf(ed.state.pos);
    return d && p != null ? Math.max(0, Math.min(1, p / d)) : 0.38;
  }

  /* ---------------------------------------------------------------- レコード(表示項目の「レコード」)
     ジャケット(.um-jacket)の後ろから、盤(.um-rec)がのぞいて回る。プレイリストの画面では下の小さなバーの画像も盤になる。
     盤は canvas 2 枚に描く: 回る層(溝・曲の切れ目・傷の点・ラベル)と、動かない層(光の筋・軸)。光の当たり方は盤が回っても変わらないため。
     画面では回る層を CSS で回し、動画では角度を変えて描く。ラベルは再生中の曲の画像(なければジャケット、どちらもなければメインの色) */
  const TAU = Math.PI * 2;
  const SLEEVE = { player: { j: 246, d: 232 }, list: { j: 224, d: 210 } };   // ジャケットの一辺と盤の直径(px)。盤はラベルの端が見えるまでのぞかせる
  const MINI_D = 58;   // 小さなバーの盤の直径
  const REV = 2;       // 1 回転の秒数(33 1/3 回転に近く、4 秒と 8 秒で割り切れる)
  // 傷の点 [角度, 半径(盤の半径を 1), 大きさ(px), 濃さ] と細い擦り傷 [角度, 半径, 長さ]。溝は同心円で回っても動いて見えないので、決まった場所に置く
  const SPECKS = [[0.3, 0.62, 1.1, 0.2], [1.2, 0.81, 0.8, 0.16], [1.9, 0.55, 0.9, 0.14], [2.6, 0.9, 1.2, 0.18], [3.3, 0.72, 0.7, 0.15], [4.1, 0.5, 1, 0.12], [4.8, 0.86, 0.9, 0.2], [5.6, 0.66, 1.2, 0.14]];
  const SCRATCH = [[0.9, 0.77, 0.35], [3.8, 0.6, 0.25], [5.2, 0.92, 0.3]];
  const imgMemo = new Map();
  function imgOf(src) {
    if (!src) return Promise.resolve(null);
    if (!imgMemo.has(src)) { if (imgMemo.size > 24) imgMemo.clear(); imgMemo.set(src, U.loadImage(src).catch(() => null)); }
    return imgMemo.get(src);
  }
  const labelR = (R, mini) => R * (mini ? 0.48 : 0.4);
  /** 回る層を描く。P = 直径(画素)、d = 画面での直径(px)。o: { img, mini, main, ink } */
  function recRot(c, P, d, o) {
    c.width = c.height = P;
    const g = c.getContext('2d'), R = P / 2, k = P / d, L = labelR(R, o.mini);
    const ring = (r0, r1, color) => { g.beginPath(); g.arc(0, 0, r1, 0, TAU); g.arc(0, 0, r0, 0, TAU, true); g.fillStyle = color; g.fill(); };
    g.translate(R, R);
    if (o.mini) ring(R * 0.62, R * 0.64, '#1d1b24');
    else {
      g.strokeStyle = 'rgba(255,255,255,.045)';
      g.lineWidth = 0.5 * k;
      for (let r = L + 2 * k; r < R * 0.96; r += 2.5 * k) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      ring(R * 0.448, R * 0.458, '#1d1b24');
      ring(R * 0.685, R * 0.693, '#17151d');
      g.strokeStyle = 'rgba(255,255,255,.1)';
      g.lineWidth = 0.7 * k;
      SCRATCH.forEach(([a, r, len]) => { g.beginPath(); g.arc(0, 0, r * R, a, a + len); g.stroke(); });
      SPECKS.forEach(([a, r, sz, al]) => { g.fillStyle = `rgba(255,255,255,${al})`; g.beginPath(); g.arc(Math.cos(a) * r * R, Math.sin(a) * r * R, sz * k, 0, TAU); g.fill(); });
    }
    ring(R * 0.97, R, '#24212c');
    g.save();
    g.beginPath(); g.arc(0, 0, L, 0, TAU); g.clip();
    if (o.img) {
      const iw = o.img.naturalWidth, ih = o.img.naturalHeight, sc = Math.max(2 * L / iw, 2 * L / ih);
      g.drawImage(o.img, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc);
    } else {
      g.fillStyle = o.main; g.fillRect(-L, -L, 2 * L, 2 * L);
      g.globalAlpha = 0.55; g.fillStyle = o.ink;   // 刷った字の代わりの線(回っているのが分かるように)
      g.fillRect(-L * 0.55, -L * 0.5, L * 1.1, L * 0.1); g.fillRect(-L * 0.55, -L * 0.3, L * 0.7, L * 0.08); g.fillRect(-L * 0.3, L * 0.38, L * 0.6, L * 0.07);
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.lineWidth = 1.5 * k;
    g.beginPath(); g.arc(0, 0, L - 0.75 * k, 0, TAU); g.stroke();
  }
  /** 動かない層を描く: 光の筋(ラベルの外)と軸 */
  function recFix(c, P, d, o) {
    c.width = c.height = P;
    const g = c.getContext('2d'), R = P / 2, L = labelR(R, o.mini);
    if (g.createConicGradient) {
      const cg = g.createConicGradient(-140 * Math.PI / 180, R, R);
      [[0, 0], [16, 0.17], [38, 0], [180, 0], [196, 0.12], [218, 0]].forEach(([deg, a]) => cg.addColorStop(deg / 360, `rgba(255,255,255,${a})`));
      g.beginPath(); g.arc(R, R, R, 0, TAU); g.arc(R, R, L * 1.03, 0, TAU, true);
      g.fillStyle = cg; g.fill();
    }
    const sr = Math.max(1.5, R * (o.mini ? 0.06 : 0.032)), sg = g.createRadialGradient(R - sr * 0.3, R - sr * 0.4, 0, R, R, sr);
    sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.55, '#b9bcc6'); sg.addColorStop(1, '#6f7380');
    g.fillStyle = sg;
    g.beginPath(); g.arc(R, R, sr, 0, TAU); g.fill();
  }
  /** 盤の要素(中の canvas は paintRecords が描く) */
  function record(src, d) {
    const el = h('div.um-rec' + (d < 100 ? '.mini' : ''), { 'data-d': d, style: { width: d + 'px', height: d + 'px' } }, h('canvas.um-rec-rot'), h('canvas.um-rec-fix'));
    el.__src = src || '';
    return el;
  }
  /** ジャケットの後ろからレコードがのぞく組み。kind = player | list */
  function sleeve(jacket, kind, src) {
    const { j, d } = SLEEVE[kind];
    jacket.classList.add('um-jacket');
    return h('div.um-sleeve.' + kind, { style: { '--j': j + 'px', '--d': d + 'px' } }, record(src, d), jacket);
  }
  let recReady = Promise.resolve(), recTheme = '';
  /** シートの盤をすべて描く(画像を読み終えてから)。書き出しは recReady を待つ */
  function paintRecords() {
    const sh = ed.sheet;
    if (!sh) return recReady;
    const t = Ed.themeColors(ed.state.theme, ed.state.palette), pr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    recTheme = t.main + t.ink;
    recReady = Promise.all([...sh.querySelectorAll('.um-rec')].map(async (el) => {
      const d = +el.dataset.d, o = { img: await imgOf(el.__src), mini: d < 100, main: t.main, ink: t.ink }, [rot, fix] = el.querySelectorAll('canvas');
      recRot(rot, Math.round(d * pr), d, o);
      recFix(fix, Math.round(d * pr), d, o);
    }));
    return recReady;
  }
  const srcAt = (p) => (Ed.getIn(ed.state, p) || {}).src || '';

  /* ---------------------------------------------------------------- 並べ替え・足す・消す・再生中にする */
  const personMode = () => ed.state.split === 'person';
  /** 群 g の曲の番号の一覧。'' = すべて、a・b・ab = 選んだ人 */
  const groupIdx = (g) => T().map((_, i) => i).filter((i) => !g || T()[i].by === g);
  const commit = (focus) => {
    ed.dirty();
    ed.rerender();
    if (focus) { const el = ed.sheet.querySelector(focus); if (el) el.focus(); }
  };
  /** i 番目の曲が上(dir = -1)・下(+1)へ動けるか。選んだ人ごとの並びでは、同じ人の曲の中で動く */
  function canMove(i, dir) {
    const a = T();
    if (personMode()) { for (let j = i + dir; j >= 0 && j < a.length; j += dir) if (a[j].by === a[i].by) return true; return false; }
    return i + dir >= 0 && i + dir < a.length;
  }
  function move(i, dir) {
    if (!canMove(i, dir)) return;
    const a = T(), s = ed.state;
    let to = i + dir;
    if (personMode()) while (a[to].by !== a[i].by) to += dir;
    [a[i], a[to]] = [a[to], a[i]];
    if (s.now === i) s.now = to; else if (s.now === to) s.now = i;
    if (s.jkAt === i) s.jkAt = to; else if (s.jkAt === to) s.jkAt = i;
    commit(`.um-row[data-i="${to}"] .um-tools button[data-dir="${dir}"]`);
  }
  function remove(i) {
    const s = ed.state;
    T().splice(i, 1);
    if (i < s.now) s.now--;
    if (Number.isInteger(s.jkAt)) { if (s.jkAt === i) s.jkAt = null; else if (i < s.jkAt) s.jkAt--; }
    s.now = Math.max(0, Math.min(s.now, T().length - 1));
    commit();
  }
  /** 曲を足す。g: '' = 終わりに(印は前の曲と替える)、a・b・ab = その人の曲として */
  function add(g) {
    const a = T(), last = a[a.length - 1];
    a.push(track(g || (last && last.by === 'a' ? 'b' : 'a')));
    commit(`.um-row[data-i="${a.length - 1}"] .um-title`);
  }
  const setNow = (i) => { ed.state.now = i; commit(`.um-row[data-i="${i}"] .um-tools button.now`); };

  /* ---------------------------------------------------------------- シートの部品 */
  function markBtn(t, tp) {
    const b = h('button.um-mark', { type: 'button', 'data-by': t.by, title: '選んだ人を替える', 'aria-label': `選んだ人: ${byLabel(t.by)}（押して替える）` },
      t.by === 'ab' ? [badge('a'), badge('b')] : badge(t.by));
    b.addEventListener('click', () => {
      const i = +b.dataset.i;
      ed.set(`${tp}.by`, BY[(BY.indexOf(t.by) + 1) % BY.length]);
      commit(`.um-mark[data-i="${i}"]`);
    });
    b.dataset.i = tp.split('.')[1];
    return b;
  }
  function rowTools(i) {
    const btn = (dir, ic, label) => canMove(i, dir) && h('button', { type: 'button', 'data-dir': dir, title: label, 'aria-label': label, onclick: () => move(i, dir) }, icon(ic, 13));
    return h('div.um-tools.ed-ui',
      i !== nowIdx() && h('button.now', { type: 'button', title: '再生中の曲にする', 'aria-label': '再生中の曲にする', onclick: () => setNow(i) }, glyph('play', 11)),
      btn(-1, 'up', '上へ'), btn(1, 'down', '下へ'),
      h('button.rm', { type: 'button', title: '曲を削除', 'aria-label': '曲を削除', onclick: () => remove(i) }, icon('close', 12)));
  }
  /** 画像の枠。画像がなければ、書き出しでは音符の四角になる */
  const art = (p, cls) => h('div.um-artbox' + (cls ? '.' + cls : ''), glyph('note', 20, 'um-art-ph'),
    ed.image(p, { ratio: 1, compact: true, label: '画像', max: 1000, onChange: () => ed.rerender() }));
  /** 曲目の行の写し(書けるのは曲目の行だけ)。refresh がそろえる */
  const mirror = (p, cls, ph) => h('span.um-mirror' + (cls ? '.' + cls : ''), { 'data-mirror': p, 'data-ph': ph || '', title: '曲目の行で書き換えます' });
  const isNow = (i) => (ed.state.layout === 'player' || ed.state.show.player) && i === nowIdx();
  function row(i) {
    const s = ed.state, t = T()[i], tp = `tracks.${i}`;
    return h('div.um-row' + (blank(t) ? '.is-blank' : '') + (isNow(i) ? '.is-now' : ''), { 'data-i': i },
      h('div.um-lead', h('span.um-no'), isNow(i) && eqBars()),
      s.show.art && art(`${tp}.image`, 'um-art'),
      h('div.um-body',
        ed.text(`${tp}.title`, { cls: 'um-title', ph: '曲名' }),
        h('div.um-sub', s.show.picker && markBtn(t, tp), ed.text(`${tp}.artist`, { cls: 'um-artist', ph: 'アーティスト' })),
        s.show.note && ed.text(`${tp}.note`, { cls: 'um-note', ph: 'ひとこと（選んだわけ・流れた場面）', multi: true }),
        s.show.line && h('div.um-quote', ed.text(`${tp}.line`, { cls: 'um-line', ph: '好きな一節', multi: true }))),
      s.show.time && ed.text(`${tp}.time`, { cls: 'um-time', ph: '0:00', label: '時間' }),
      h('span.um-more', glyph('more', 16)),
      rowTools(i));
  }
  const addBtn = (g, label) => h('button.ed-add.ed-ui', { type: 'button', onclick: () => add(g) }, icon('plus', 12), label);
  const total = (g) => ed.state.show.total && h('span.um-total', { 'data-g': g || '' });
  function legend() {
    if (!ed.state.show.picker) return null;
    return h('div.um-legend', h('span.um-legend-k', '選曲'), [0, 1].map((i) => {
      const name = ed.text(`people.${i}.name`, { cls: 'um-who-name', ph: `${i + 1} 人目の名前` });
      name.dataset.person = i;
      return h('span.um-who', badge(i ? 'b' : 'a'), name);
    }));
  }
  const label = () => ed.text('label', { cls: 'um-label', ph: 'ラベル' });
  const title = () => ed.text('title', { cls: 'um-title-main', ph: 'プレイリストの題' });
  const intro = () => ed.state.show.intro && ed.text('intro', { cls: 'um-intro', ph: '紹介', multi: true });
  const foot = () => ed.state.show.foot && ed.text('foot', { cls: 'um-foot', ph: '下の一文' });
  const meta = () => (ed.state.show.total || ed.state.show.picker) && h('div.um-meta', legend(), total(''));
  /** 曲目の見出し(# ・タイトル・時計)。行と同じ幅の並びにする */
  const colHead = () => h('div.um-colhead', h('span.um-lead', '#'), ed.state.show.art && h('span.um-art-sp'), h('span.um-body', 'タイトル'),
    ed.state.show.time && h('span.um-time-h', glyph('clock', 15)), h('span.um-more-sp'));
  /** 曲目。曲順ならそのまま、選んだ人ごとなら 1 人目・2 人目・2 人の段に分ける */
  function tracklist() {
    if (!personMode()) return [h('div.um-rows', T().map((_, i) => row(i))), addBtn('', '曲を追加')];
    return [['a', 0], ['b', 1], ['ab', null]].map(([g, who]) => h('section.um-group', { 'data-g': g },
      h('header.um-group-head',
        who == null ? h('span.um-pair', badge('a'), badge('b')) : badge(g),
        who == null ? h('b', '2 人で選んだ曲') : h('b', h('span', { 'data-pname': who }, nameOf(who)), 'の選曲'),
        total(g)),
      h('div.um-rows', groupIdx(g).map(row)),
      addBtn(g, who == null ? '2 人の曲を追加' : `${who + 1} 人目の曲を追加`)));
  }
  /** 再生位置・進み具合のバー・曲の時間 */
  const progressRow = (k) => h('div.um-prog',
    ed.text('pos', { cls: 'um-pos', ph: '1:24', label: '再生位置' }),
    h('div.um-bar', h('i')),
    mirror(`tracks.${k}.time`, 'um-dur', '0:00'));
  /** 再生中の曲の画像の場所: 曲の画像があればそれ、なければジャケット */
  const nowArtPath = (k) => { const t = T()[k]; return t && t.image && t.image.src ? `tracks.${k}.image` : 'cover'; };

  /** 番号・空の曲・合計・写し・進み具合を、いまの中身に合わせる(書くたびに呼ぶ。シートは作り直さない) */
  function refresh() {
    const sh = ed.sheet;
    if (!sh) return;
    const a = T();
    let n = 0;
    sh.querySelectorAll('.um-row').forEach((r) => {
      const t = a[+r.dataset.i];
      if (!t) return;
      const b = blank(t);
      r.classList.toggle('is-blank', b);
      if (!b) n++;
      r.querySelector('.um-no').textContent = b ? '–' : String(n);
    });
    sh.querySelectorAll('.um-total').forEach((el) => {
      el.textContent = totalText(groupIdx(el.dataset.g || '').map((i) => a[i]));
      el.classList.toggle('is-empty', !el.textContent);
    });
    sh.querySelectorAll('[data-mirror]').forEach((el) => {
      const v = String(Ed.getIn(ed.state, el.dataset.mirror) || '').trim();
      el.textContent = v;
      el.classList.toggle('is-empty', !v);
    });
    const p = progress();
    sh.querySelectorAll('.um-bar').forEach((b) => b.style.setProperty('--p', p));
  }

  /* ---------------------------------------------------------------- シート */
  let refitTimer = 0;
  function render() {
    const s = ed.state, player = s.layout === 'player';
    ed.cfg.width = WIDTH[s.layout] || WIDTH.list;   // 画面に収める縮小(Ed の fit)が読む
    if (s.layout === 'jacket') {
      const sh = jacket.sheet();
      // 題を書き換えたら、増えた字の書体を読んで収め直す
      sh.addEventListener('input', () => { jacket.fit(); clearTimeout(refitTimer); refitTimer = setTimeout(jacket.after, 250); });
      return sh;
    }
    const sheet = h('div.mix-sheet' + (player ? '.is-player' : ''), { style: Object.assign(Ed.themeVars(s.theme, s.palette), sheetVars()) },
      ...(player ? renderPlayer(s) : renderList(s)));
    sheet.addEventListener('input', (e) => {
      refresh();
      if (e.target.dataset && e.target.dataset.person != null) syncPeople(e.target);
    });
    return sheet;
  }

  /** プレイリストの上のジャケット(レコードを出すなら後ろに盤) */
  function cover(s) {
    const el = h('div.um-cover', ed.image('cover', { ratio: 1, label: 'ジャケットの画像', onChange: () => ed.rerender() }));
    return s.show.disc ? sleeve(el, 'list', srcAt('cover')) : el;
  }

  /* プレイリスト(縦長): 上にジャケットと題、操作の段、曲目の表、下に再生中の曲の小さなバー */
  function renderList(s) {
    const k = nowIdx();
    return [
      h('header.um-head' + (s.show.cover ? (s.show.disc ? '.has-rec' : '') : '.no-cover'),
        s.show.cover && cover(s),
        h('div.um-head-body', label(), title(), intro(), meta())),
      h('div.um-actions',
        h('span.um-act', glyph('shuffle', 22)), h('span.um-act', glyph('heart', 22)), h('span.um-act', glyph('save', 22)), h('span.um-act', glyph('more', 22)),
        h('span.um-spacer'), playBtn(26, 'play', 'big')),
      h('section.um-list', colHead(), ...tracklist()),
      s.show.player && k >= 0 && h('div.um-mini',
        s.show.disc ? record(srcAt(nowArtPath(k)), MINI_D) : art(nowArtPath(k), 'um-mini-art'),
        h('div.um-mini-body',
          h('div.um-mini-top',
            h('div.um-mini-text', mirror(`tracks.${k}.title`, 'um-mini-title', '曲名'), mirror(`tracks.${k}.artist`, 'um-mini-artist', 'アーティスト')),
            h('div.um-ctrls', glyph('shuffle', 18, 'sm'), glyph('prev', 20), playBtn(18, 'pause'), glyph('next', 20), glyph('repeat', 18, 'sm'))),
          progressRow(k))),
      foot()
    ];
  }

  /* 再生画面(横長): 左に再生中の曲(ぼかしたジャケットの地・大きな画像・進み具合・操作・好きな一節)、右に曲目 */
  function renderPlayer(s) {
    const k = nowIdx(), t = k >= 0 ? T()[k] : null, tp = `tracks.${k}`, ap = nowArtPath(k), src = (Ed.getIn(s, ap) || {}).src;
    const now = h('div.ump-now',
      h('div.ump-bg', src && h('img', { src, alt: '' })),
      h('div.ump-top', h('span.ump-top-k', 'NOW PLAYING'), mirror('title', 'ump-from', 'プレイリストの題')),
      // 右の曲目のほうが高いときは、画像から下を上下の真ん中に置く
      h('div.ump-main',
        s.show.disc ? sleeve(art(ap, 'ump-art'), 'player', src) : art(ap, 'ump-art'),
        t && h('div.ump-info',
          h('div.ump-text', mirror(`${tp}.title`, 'ump-title', '曲名'),
            h('div.ump-sub', s.show.picker && markBtn(t, tp), mirror(`${tp}.artist`, 'ump-artist', 'アーティスト'))),
          h('span.ump-heart', glyph('heart', 24))),
        t && progressRow(k),
        t && h('div.ump-ctrls', glyph('shuffle', 22, 'sm'), glyph('prev', 30), playBtn(30, 'pause', 'big'), glyph('next', 30), glyph('repeat', 22, 'sm')),
        t && s.show.line && h('div.ump-lyric', mirror(`${tp}.line`, 'ump-line', '好きな一節'))));
    const queue = h('div.ump-queue',
      h('header.ump-qhead',
        s.show.cover && h('div.ump-qcover', ed.image('cover', { ratio: 1, compact: true, label: 'ジャケット', onChange: () => ed.rerender() })),
        h('div.ump-qtext', label(), title(), intro(), meta())),
      h('section.um-list', colHead(), ...tracklist()),
      foot());
    return [h('div.ump', now, queue)];
  }

  /* ---------------------------------------------------------------- 動画で保存(MP4・GIF。音なし)
     シートを html-to-image で 2 枚の絵にする: 下(um-vid-base)= 盤の中身・ジャケット・動く物を隠したシート、上(um-vid-top)= ジャケットだけ。
     1 コマごとに 下 → 角度を変えた盤 → 上 の順に重ね、進み具合のバー・再生位置・再生中の印のバーを上から描く。
     再生位置の字は秒ごとに先に描いておく(字の形を画像と同じにするため)。1 コマずつ作るので、重い端末でもコマ落ちしない */
  const VIDEO = {
    mp4: { name: 'MP4', sec: 8, fps: 30, scale: (W, H) => Math.min(2, 1920 / Math.max(W, H)) },
    gif: { name: 'GIF', sec: 4, fps: 20, scale: (W) => Math.min(1, 720 / W) }
  };
  const EQ = [[1, 0.3], [0.8, 0], [2, 0.6], [0.5, 0.15]];   // 再生中の印のバー [1 往復の秒数, ずらし]。どれも 4 秒と 8 秒で割り切れる
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const roundRect = (g, x, y, w, ht, r) => {
    r = Math.max(0, Math.min(r, w / 2, ht / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + ht, r); g.arcTo(x + w, y + ht, x, y + ht, r); g.arcTo(x, y + ht, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  };
  /** 「rgb(…) 0px 0px 0px 3px」のような輪の影 → { color, spread }(なければ null) */
  function ringOf(bs) {
    const m = /^(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+([\d.]+)px/.exec(bs || '');
    return m ? { color: m[1], spread: +m[2] } : null;
  }
  /** シートの大きさと、書き出す動画の大きさ。書き出すときと同じ形(縮小なし・空の欄を省く)で測る */
  function videoSize(fmt) {
    const node = ed.sheet, zb = node.parentElement, z = zb.style.zoom, had = node.classList.contains('exporting');
    zb.style.zoom = '1';
    node.classList.add('exporting');
    const W = node.offsetWidth, H = node.offsetHeight, S = VIDEO[fmt].scale(W, H);
    if (!had) node.classList.remove('exporting');
    zb.style.zoom = z;
    return { W, H, w: even(W * S), h: even(H * S) };
  }
  /** 動いて見える物(進み具合が読めるか)。動画の画面の説明にも使う */
  function videoMotion() {
    const k = nowIdx(), dur = k >= 0 ? secOf(T()[k].time) : null, p0 = secOf(ed.state.pos);
    return { dur, p0, moving: !!(dur && p0 != null) };
  }
  /** 動画のコマを作る準備。返り値の frame(i) が i コマ目を描いた canvas を返す */
  async function videoFrames(fmt) {
    const V = VIDEO[fmt], node = ed.sheet, zb = node.parentElement, z = zb.style.zoom;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const lib = await Ed.loadH2I();
    const texts = [];
    zb.style.zoom = '1';
    node.classList.add('exporting');
    try {
      await recReady;
      const { W, H, w: OW, h: OH } = videoSize(fmt), base = node.getBoundingClientRect(), S = OW / W, sy = OH / H;
      const at = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }; };
      const t = Ed.themeColors(ed.state.theme, ed.state.palette), { dur, p0, moving } = videoMotion();
      const recs = [...node.querySelectorAll('.um-rec')].map((el) => Object.assign(at(el), { d: +el.dataset.d, src: el.__src }));
      const bars = moving ? [...node.querySelectorAll('.um-bar')].map((b) => {
        const i = b.firstElementChild, ks = getComputedStyle(i, '::after');
        return Object.assign(at(b), { fill: getComputedStyle(i).backgroundColor, knob: ks.backgroundColor, kr: parseFloat(ks.width) / 2 || 6, ring: ringOf(ks.boxShadow) });
      }) : [];
      const poss = moving ? [...node.querySelectorAll('.um-pos')].map((el) => Object.assign(at(el), { el })) : [];
      const eqs = [...node.querySelectorAll('.um-eq')].map((e) => Object.assign(at(e), { bars: [...e.children].map((i) => Object.assign(at(i), { color: getComputedStyle(i).backgroundColor })) }));
      const opts = { pixelRatio: S, skipFonts: true, cacheBust: false, filter: (n) => !(n.classList && n.classList.contains('ed-ui')) };
      const shot = async (el, o) => { const op = Object.assign({}, opts, o); let c = await lib.toCanvas(el, op); if (isSafari) c = await lib.toCanvas(el, op); return c; };

      node.classList.add('um-vid-base');
      if (moving) node.classList.add('um-vid-prog');
      const under = await shot(node, { backgroundColor: getComputedStyle(node).backgroundColor });
      node.classList.remove('um-vid-base', 'um-vid-prog');
      let over = null;
      if (node.querySelector('.um-jacket')) {
        node.classList.add('um-vid-top');
        over = await shot(node);
        node.classList.remove('um-vid-top');
      }
      const sprites = new Map();   // 'j:秒' → 再生位置の字の絵
      if (moving) {
        poss.forEach((p) => texts.push([p.el, p.el.textContent]));
        for (let sec = Math.floor(p0); sec <= Math.min(dur, p0 + V.sec); sec++) {
          for (const [j, p] of poss.entries()) { p.el.textContent = fmtSec(sec); sprites.set(j + ':' + sec, await shot(p.el)); }
        }
      }
      const discs = await Promise.all(recs.map(async (r) => {
        const P = Math.round(r.d * S), o = { img: await imgOf(r.src), mini: r.d < 100, main: t.main, ink: t.ink };
        const rot = document.createElement('canvas'), fix = document.createElement('canvas');
        recRot(rot, P, r.d, o);
        recFix(fix, P, r.d, o);
        return Object.assign(r, { P, rot, fix });
      }));

      const fc = document.createElement('canvas');
      fc.width = OW;
      fc.height = OH;
      const g = fc.getContext('2d', { willReadFrequently: fmt === 'gif' });
      g.imageSmoothingQuality = 'high';
      const circle = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
      const frame = (i) => {
        const time = i / V.fps;
        g.drawImage(under, 0, 0, OW, OH);
        discs.forEach((r) => {
          const cx = (r.x + r.w / 2) * S, cy = (r.y + r.h / 2) * sy;
          g.save(); g.translate(cx, cy); g.rotate(TAU * time / REV); g.drawImage(r.rot, -r.P / 2, -r.P / 2); g.restore();
          g.drawImage(r.fix, cx - r.P / 2, cy - r.P / 2);
        });
        if (over) g.drawImage(over, 0, 0, OW, OH);
        if (moving) {
          const cur = Math.min(dur, p0 + time), p = cur / dur;
          bars.forEach((b) => {
            const x = b.x * S, y = b.y * sy, ht = b.h * sy, kx = x + b.w * S * p, ky = y + ht / 2;
            g.fillStyle = b.fill; roundRect(g, x, y, b.w * S * p, ht, ht / 2); g.fill();
            if (b.ring) { g.fillStyle = b.ring.color; circle(kx, ky, (b.kr + b.ring.spread) * S); }
            g.fillStyle = b.knob; circle(kx, ky, b.kr * S);
          });
          poss.forEach((ps, j) => { const sp = sprites.get(j + ':' + Math.floor(cur)); if (sp) g.drawImage(sp, ps.x * S, ps.y * sy, ps.w * S, ps.h * sy); });
        }
        eqs.forEach((e) => e.bars.forEach((b, j) => {
          const [per, ph] = EQ[j % EQ.length], f = 0.22 + 0.78 * (0.5 - 0.5 * Math.cos(TAU * (time / per + ph))), ht = e.h * f * sy;
          g.fillStyle = b.color; roundRect(g, b.x * S, (e.y + e.h) * sy - ht, b.w * S, ht, S); g.fill();
        }));
        return fc;
      };
      return { frame, count: V.sec * V.fps, fps: V.fps, width: OW, height: OH };
    } finally {
      texts.forEach(([el, v]) => { el.textContent = v; });
      node.classList.remove('exporting', 'um-vid-base', 'um-vid-prog', 'um-vid-top');
      zb.style.zoom = z;
    }
  }
  /** 動画を作る(Blob) */
  async function makeVideo(fmt, onProgress) {
    if (fmt === 'mp4' && !Mp4.supported()) throw new Error('このブラウザでは MP4 を作れません。GIF をお試しください');
    const f = await videoFrames(fmt);
    return (fmt === 'mp4' ? Mp4 : Gif).encode(Object.assign(f, { onProgress }));
  }
  const VIDEO_KEY = 'userkit:usermix:video';   // 前に選んだ形式(この端末だけ)
  /** 「動画で保存」の画面: 形式を選んで作り、見てから保存する */
  function videoDialog() {
    if (!ed.sheet) return;
    let fmt = 'mp4', busy = false, closed = false, url = '';
    try { if (localStorage.getItem(VIDEO_KEY) === 'gif') fmt = 'gif'; } catch (e) { /* 使えない環境 */ }
    if (!Mp4.supported()) fmt = 'gif';
    const s = ed.state, body = h('div.modal-body.um-vd');
    const drop = () => { if (url) URL.revokeObjectURL(url); url = ''; };
    const ctl = U.openDialog({ title: '動画で保存', wide: true, content: body, onClose: () => { closed = true; drop(); } });
    const moves = [s.show.disc && 'レコードが回り', videoMotion().moving && '再生位置と進み具合のバーが進み'].filter(Boolean);
    function choose() {
      drop();
      const seg = h('div.seg.um-vd-fmt', { role: 'group', 'aria-label': '形式' }, Object.entries(VIDEO).map(([k, v]) => h('button', {
        type: 'button', 'aria-pressed': String(fmt === k), disabled: k === 'mp4' && !Mp4.supported(),
        onclick: () => { fmt = k; try { localStorage.setItem(VIDEO_KEY, k); } catch (e) { /* 使えない環境 */ } choose(); }
      }, v.name)));
      const V = VIDEO[fmt], z = videoSize(fmt);
      const note = fmt === 'mp4'
        ? `大きさは ${z.w} × ${z.h} px、長さは ${V.sec} 秒で、1 秒に ${V.fps} コマです。なめらかで、X などにそのまま載せられます。`
        : `大きさは ${z.w} × ${z.h} px、長さは ${V.sec} 秒で、1 秒に ${V.fps} コマです。色の数が少ないので少し粗くなりますが、どこでもそのまま動きます。`;
      const go = h('button.btn.btn-primary', { type: 'button' }, icon('video'), '作る');
      go.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        go.disabled = true;
        go.textContent = '作っています…';
        try {
          const blob = await makeVideo(fmt, (p) => { go.textContent = `作っています… ${Math.round(p * 100)}%`; });
          if (!closed) result(blob);
        } catch (e) {
          console.error(e);
          U.toast(e.message || '動画を作れませんでした', 'error');
          if (!closed) choose();
        } finally { busy = false; }
      });
      body.replaceChildren(...[
        h('p.modal-lead', `${moves.length ? moves.join('、') + '、' : ''}再生中の曲の横で 4 本の短いバーが揺れる動画を作ります。音は入りません。`),
        seg, h('p.hint', note),
        !Mp4.supported() && h('p.hint', 'このブラウザでは MP4 を作れないため、GIF だけを選べます。'),
        h('div.modal-foot', h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, '閉じる'), go)].filter(Boolean));
    }
    function result(blob) {
      drop();
      url = URL.createObjectURL(blob);
      const ext = fmt, mb = (blob.size / 1048576).toFixed(1) + ' MB', info = h('p.hint');
      const name = `usermix_${U.safeName(s.title || s.people.map((p) => p.name).filter(Boolean).join('_'), 'playlist')}.${ext}`;
      let media;
      if (ext === 'mp4') {
        media = h('video.um-vd-out', { src: url, autoplay: true, loop: true, playsinline: true, controls: true });
        media.muted = true;
        media.addEventListener('loadedmetadata', () => { info.textContent = `${media.videoWidth} × ${media.videoHeight} px・${media.duration.toFixed(1)} 秒・MP4・${mb}`; });
      } else {
        media = h('img.um-vd-out', { src: url, alt: '作った GIF' });
        media.addEventListener('load', () => { info.textContent = `${media.naturalWidth} × ${media.naturalHeight} px・${VIDEO.gif.sec} 秒・GIF・${mb}`; });
      }
      body.replaceChildren(media, info, h('div.modal-foot',
        h('button.btn.btn-outline', { type: 'button', onclick: choose }, '形式を選び直す'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => U.saveImage(blob, name) }, icon('download'), '保存する')));
    }
    choose();
  }

  /* ---------------------------------------------------------------- 選んだ人(名前・印の字・色) */
  function peoplePop() {
    return ed.popover('選んだ人', 'pair', () => {
      const rows = [0, 1].map((i) => {
        const p = ed.state.people[i];
        const sw = h('button.pal-sw', { type: 'button', title: '色を選ぶ(パレット・画像からスポイト)', 'aria-label': `${i + 1} 人目の印の色を選ぶ` });
        const rm = h('button.pal-rm', { type: 'button', title: '色を自動に戻す', 'aria-label': `${i + 1} 人目の色を自動に戻す` }, icon('close', 11));
        const showColor = () => { sw.style.setProperty('--c', peopleColors()[i ? 'b' : 'a']); rm.disabled = !normHex(p.color); };
        const name = h('input', { type: 'text', value: p.name, placeholder: `${i + 1} 人目の名前`, 'aria-label': `${i + 1} 人目の名前` });
        const mark = h('input.um-pp-mark', { type: 'text', value: p.mark, maxlength: 4, placeholder: markChar(i), 'aria-label': `${i + 1} 人目の印の字` });
        name.addEventListener('input', () => { ed.set(`people.${i}.name`, name.value); mark.placeholder = Array.from(name.value.trim())[0] || (i ? 'B' : 'A'); syncPeople(); });
        mark.addEventListener('input', () => { ed.set(`people.${i}.mark`, mark.value); syncPeople(); });
        sw.addEventListener('click', async () => {
          const v = await Ed.pickColor({ value: peopleColors()[i ? 'b' : 'a'], title: `${i + 1} 人目の印の色`, sources: ed.images() });
          if (v) { ed.set(`people.${i}.color`, v); rows.forEach((r) => r.show()); syncPeople(); }
        });
        rm.addEventListener('click', () => { ed.set(`people.${i}.color`, ''); rows.forEach((r) => r.show()); syncPeople(); });
        showColor();
        return { show: showColor, el: h('div.um-pp-row', sw, h('div.um-pp-fields', h('label', h('small', `${i + 1} 人目`), name), h('label', h('small', '印の字'), mark)), rm) };
      });
      return h('div.um-pp', rows.map((r) => r.el),
        h('p.hint', '印の字を空けておくと、名前の 1 字目を使います。色を決めないと、1 人目はテーマのメインの色、2 人目はそれに合わせた色になります。'));
    });
  }

  /* ---------------------------------------------------------------- userprof から(名前と目印の色) */
  async function importFrom(i) {
    const r = await Ed.pickUserprof();
    if (!r) return;
    const u = r.user, p = ed.state.people[i];
    p.name = u.name || p.name;
    if (window.Store && Store.colorHex) { const c = normHex(Store.colorHex(u)); if (c) p.color = c; }
    await ed.save();
    ed.rerender();
    U.toast(`「${u.name}」を ${i + 1} 人目に読み込みました`);
  }

  /* ---------------------------------------------------------------- ツールバー */
  function renderToolbar() {
    const s = ed.state;
    if (s.layout === 'jacket') return renderJacketToolbar();
    const seg = (cls, label, items, key) => h('div.seg.' + cls, { role: 'group', 'aria-label': label },
      cls === 'um-order' && h('span.um-seg-k', label),
      items.map(([v, text]) => h('button', {
        type: 'button', 'aria-pressed': String(s[key] === v),
        onclick: () => { if (s[key] !== v) ed.set(key, v, { rerender: true }); }
      }, cls === 'um-layout' && h('i.um-shape.' + v), text)));
    const imp = ed.popover('userprofから', 'book', (close) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('p.hint', 'userprof に保存した user の名前と目印の色を、選んだ人の印に読み込みます。'),
      [0, 1].map((i) => h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { close(); importFrom(i); } }, `${i + 1} 人目に読み込む`))));
    toolbar.replaceChildren(
      seg('um-layout', '見た目', LAYOUTS, 'layout'),
      seg('um-order', '並び', ORDERS, 'split'),
      Ed.themePicker(ed, 'theme'),
      Ed.showPicker(ed, 'show', SHOW),
      peoplePop(),
      imp,
      h('span.spacer'),
      ed.statusEl,
      ed.fileMenu({ reset: () => ed.reset().then(renderToolbar) }),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: videoDialog }, icon('video'), '動画で保存'),
      ed.exportButton(() => `usermix_${U.safeName(ed.state.title || ed.state.people.map((p) => p.name).filter(Boolean).join('_'), 'playlist')}.png`));
  }

  /** ジャケットのツールバー: 1 段目に見た目・テーマ・保存、2 段目にジャケットの設定 */
  function renderJacketToolbar() {
    const s = ed.state;
    const all = h('button.btn.btn-outline.btn-sm', { type: 'button', title: '画像の入った曲のジャケットを、曲順の番号を付けて保存します' }, icon('download'), 'まとめて保存');
    all.addEventListener('click', () => jacket.exportAll(all));
    toolbar.replaceChildren(
      h('div.seg.um-layout', { role: 'group', 'aria-label': '見た目' }, LAYOUTS.map(([v, text]) => h('button', {
        type: 'button', 'aria-pressed': String(s.layout === v), onclick: () => { if (s.layout !== v) ed.set('layout', v, { rerender: true }); }
      }, h('i.um-shape.' + v), text))),
      Ed.themePicker(ed, 'theme'),
      h('span.spacer'),
      ed.statusEl,
      ed.fileMenu({ reset: () => ed.reset().then(renderToolbar) }),
      all,
      ed.exportButton(() => ''),
      jacket.bar());
  }

  /* ---------------------------------------------------------------- 起動 */
  document.body.append(Kit.footer());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      toolbar.querySelector('.btn-primary').click();
    }
  });
  // 描き直すたびに、番号・合計・写しとツールバーもそろえる
  const origRerender = ed.rerender;
  ed.rerender = () => { origRerender(); refresh(); renderToolbar(); paintRecords(); if (ed.state.layout === 'jacket') jacket.after(); };
  // PNG はレコードを描き終えてから。ジャケットは書体を埋め込んで書き出す(jacket.js)
  const origExport = ed.exportPng;
  ed.exportPng = async (filename) => {
    if (ed.state.layout === 'jacket') return jacket.exportOne();
    await recReady;
    return origExport(filename);
  };
  jacket = UmJacket.create({ ed, nowIdx: () => nowIdx(), inkOn: (x) => inkOn(x), sheetVars: () => sheetVars() });
  // 読み込んだフォントファイルの名前も先に読む(書体の名前を出すため)
  Promise.all([ed.load(), KitFonts.files.index()]).then(() => { ed.rerender(); U.hydrateIcons(document); });
  window.__usermix = ed;   // 動作確認用
})();
