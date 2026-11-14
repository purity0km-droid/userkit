/* usermovie — 映画のワンシーン。写真に映画の字幕と黒帯を重ねて、画像(PNG)で保存する。
   カット = 写真 1 枚と字幕 1 つ。カットを並べ、1 枚ずつか、縦に並べた 1 枚(会話の流れを見せる)で保存する。
   字幕は手で打つか、talklog で保存したログから選ぶ(ログはこのページで読むだけで、保存しない)。
   描くのはすべて canvas。画面・小さな見本・書き出しを同じ drawCut で描き、寸法だけを変える(字の大きさなどは画面の短い辺に対する割合)。
   保存は Ed(IndexedDB の userkit-editor、キー usermovie)。写真は dataURL で state.photos に置き、カットからは id で指す */
(function () {
  'use strict';
  const { h, icon } = U;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad2 = (n) => String(n).padStart(2, '0');
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  /* ================================================================ 画面の形と黒帯 */
  // 書き出しの寸法(画素)。長い辺 1920
  const SCREENS = {
    '16:9': { label: '16:9', w: 1920, h: 1080 },
    '2.39': { label: '2.39:1', w: 1920, h: 804 },
    '4:3': { label: '4:3', w: 1440, h: 1080 },
    '1:1': { label: '1:1', w: 1080, h: 1080 },
    '4:5': { label: '4:5', w: 1080, h: 1350 },
    '9:16': { label: '9:16', w: 1080, h: 1920 }
  };
  // 映像の比率。画面より横長なら上下に、縦長なら左右に黒帯が入る
  const PICTURES = {
    fill: { label: '黒帯なし', r: 0 },
    '1.85': { label: 'ビスタ 1.85', r: 1.85 },
    '2.39': { label: 'シネスコ 2.39', r: 2.39 },
    '1.33': { label: 'スタンダード 1.33', r: 4 / 3 }
  };
  const screenOf = (s) => SCREENS[s.screen] || SCREENS['16:9'];
  /** 画面 W×H の中の映像の四角 P と、大きさの基準 U(短い辺) */
  function geom(s, W, H) {
    const r = (PICTURES[s.picture] || PICTURES.fill).r, r0 = W / H;
    let pw = W, ph = H;
    if (r && r > r0 + 0.01) ph = Math.round(W / r);
    else if (r && r < r0 - 0.01) pw = Math.round(H * r);
    return { W, H, U: Math.min(W, H), P: { x: Math.round((W - pw) / 2), y: Math.round((H - ph) / 2), w: pw, h: ph } };
  }

  /* ================================================================ 書体 */
  // 和文は字幕らしい書体を初めに。英字は Google Fonts の OFL の書体(assets/fonts.js の MORE)。'same' は和文と同じ書体
  const JA_FONTS = ['cinecaption', 'biz-udp', 'noto', 'shippori-b1'];
  const EN_FONTS = ['arimo', 'inter', 'atkinson', 'jost', 'eb-garamond', 'courier-prime', 'same'];
  const enFontId = (sub) => (sub.enFont === 'same' ? sub.jaFont : sub.enFont);
  /** 書体の指定。太字を選んでも太い字形がない書体(しねきゃぷしょんなど)は、字と同じ色の細い線を重ねて太く見せる(fake) */
  function fontSpec(id, bold) {
    const f = KitFonts.info(id), want = bold ? 700 : 400, w = KitFonts.nearest(f.weights, want);
    return { id, w, fake: bold && w < 600, css: (px) => `${w} ${Math.max(1, px).toFixed(2)}px ${KitFonts.stack(id)}` };
  }

  /* ================================================================ 字幕の文 */
  const ACT_RE = /^\*[^*].*\*$/;   // 行全体が *…* なら動作の行(talklog のビューアと同じ決まり)
  const isAct = (l) => ACT_RE.test(l) && !l.includes('**');
  /** ログの 1 行 → 字幕の元の文。** は字だけ残し、文中の *動作* は外す(外すと空になる行は * だけ外す)。全体を囲む「」も外す */
  function cleanLine(l) {
    let t = String(l || '').trim();
    if (isAct(t)) t = t.slice(1, -1).trim();
    t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
    const noAct = t.replace(/\*[^*]+\*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();   // 全角の空白は残す
    t = (noAct || t.replace(/\*/g, '')).trim();
    return t.replace(/^「([^「」]*)」$/, '$1').trim();
  }
  /** 日本の字幕の約束: 読点は半角の空白、句点は全角の空白(行末は取る)、！？の後に字が続けば全角の空白 */
  function punctToSpace(s) {
    return s.replace(/[。．｡]+\s*$/u, '')
      .replace(/[、，､]\s*/gu, ' ')
      .replace(/[。．｡]\s*/gu, '　')
      .replace(/([！？!?]+)(?=[^\s　！？!?」』）)\]】])/gu, '$1　')
      .trim();
  }
  const withName = (text, who, on) => (on && who && text ? `（${who}）${text}` : text);

  /* ---------------------------------------------------------------- 日本語の折り返し(字数で。字の幅は描くときに測って、はみ出せば縮める) */
  const NO_START = new Set(Array.from('、。，．,.・：；？！?!ー〜～…‥」』）］】〉》〕”’ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞヽヾ'));
  const NO_END = new Set(Array.from('「『（［【〈《〔“‘'));
  const SPACES = new Set([' ', '　']);
  const PARTICLES = new Set(Array.from('はがをにでともへやのてばかよね'));
  const kindOf = (ch) => (/[぀-ゟ]/.test(ch) ? 'h' : /[゠-ヿ]/.test(ch) ? 'k' : /[㐀-鿿々〆]/.test(ch) ? 'c' : /[A-Za-z0-9]/.test(ch) ? 'a' : 'o');
  const cw = (ch) => (/[ -~｡-ﾟ]/.test(ch) ? 0.5 : 1);   // 半角は 0.5 字
  const widthOf = (a) => a.reduce((t, ch) => t + cw(ch), 0);
  const SEG = (window.Intl && Intl.Segmenter) ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
  /** 語の切れ目(字の番号の集合)。Intl.Segmenter がなければ字の種類が変わる所 */
  function boundaries(str) {
    const set = new Set(), a = Array.from(str);
    if (SEG) { let i = 0; for (const seg of SEG.segment(str)) { i += Array.from(seg.segment).length; set.add(i); } }
    else for (let i = 1; i < a.length; i++) if (kindOf(a[i]) !== kindOf(a[i - 1])) set.add(i);
    return set;
  }
  /**
   * a[i] の前で切るときの点(低いほどよい)。よい切れ目は 句読点の空白 → 助詞の後 → ほかの語の切れ目 の順で、
   * 2 行の長さをそろえることより切れ目のよさを重く見る。行頭・行末の禁則では切らない
   */
  function breakCost(a, i, B, wBefore, target) {
    const prev = a[i - 1], next = a[i];
    if (NO_START.has(next) || NO_END.has(prev)) return Infinity;
    let p;
    if (SPACES.has(prev) || SPACES.has(next)) p = -4;           // 空白(句読点を空白にした所)
    else if ('」』）！？!?…'.includes(prev)) p = -2;
    else if (B.has(i)) p = PARTICLES.has(prev) ? 0 : kindOf(next) === 'h' ? 6 : 2;   // 助詞の後はよく、語尾の前(ひらがなで始まる語)は避ける
    else p = 8;
    if (kindOf(prev) === 'a' && kindOf(next) === 'a') p += 30;    // 英数字の語の中
    return Math.abs(wBefore - target) * 0.5 + p;
  }
  /** 1 行 n 字をめやすに折る。よい切れ目なら 3 字まではみ出してよい(実際の幅は描くときに測って、はみ出せば縮める) */
  function wrapJa(s, n) {
    const all = Array.from(s);
    if (widthOf(all) <= n + 0.01) return [s];
    const B = boundaries(s), lines = [];
    let off = 0, rest = all;
    for (let k = Math.ceil(widthOf(all) / n); k > 1 && rest.length > 1; k--) {
      const total = widthOf(rest), target = total / k, Bk = new Set([...B].map((b) => b - off));
      let best = -1, bestCost = Infinity, bestAny = -1, bestAnyCost = Infinity, w = 0;
      for (let i = 1; i < rest.length; i++) {
        w += cw(rest[i - 1]);
        let c = breakCost(rest, i, Bk, w, target);
        if (c < bestAnyCost) { bestAnyCost = c; bestAny = i; }
        const over = Math.max(0, w - n) + Math.max(0, total - w - n * (k - 1));
        if (over > 3.01) continue;
        c += over * 2;
        if (c < bestCost) { bestCost = c; best = i; }
      }
      const at = best > 0 ? best : bestAny > 0 ? bestAny : Math.ceil(rest.length / 2);
      lines.push(rest.slice(0, at).join('').replace(/[ 　]+$/u, ''));
      let skip = at;
      while (skip < rest.length && SPACES.has(rest[skip])) skip++;
      off += skip;
      rest = rest.slice(skip);
    }
    if (rest.length) lines.push(rest.join(''));
    return lines.filter(Boolean);
  }
  /** 字幕の行。自分で改行した行はそのまま。o = { punct, n } */
  function jaLines(text, o) {
    const raw = String(text || '').replace(/\r/g, '').split('\n').map((t) => t.trim()).filter(Boolean);
    const conv = (t) => (o.punct ? punctToSpace(t) : t);
    if (raw.length > 1) return raw.map(conv).filter(Boolean);
    return raw.length ? wrapJa(conv(raw[0]), o.n) : [];
  }
  /** 長い字幕を 2 つに分ける所(元の文で。句点・感嘆符の後 → 読点の後 → 語の切れ目の順によい) */
  function splitText(t) {
    const lines = String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (lines.length > 1) { const m = Math.ceil(lines.length / 2); return [lines.slice(0, m).join('\n'), lines.slice(m).join('\n')]; }
    const a = Array.from(lines[0] || ''), B = boundaries(lines[0] || ''), half = widthOf(a) / 2;
    let best = -1, bestCost = Infinity, w = 0;
    for (let i = 1; i < a.length; i++) {
      w += cw(a[i - 1]);
      if (NO_START.has(a[i]) || NO_END.has(a[i - 1])) continue;
      const prev = a[i - 1];
      const p = '。．！？!?…'.includes(prev) ? -8 : '、，'.includes(prev) ? -5 : SPACES.has(prev) ? -5 : B.has(i) ? (kindOf(a[i]) === 'h' ? 3 : 0) : 6;
      const c = Math.abs(w - half) + p;
      if (c < bestCost) { bestCost = c; best = i; }
    }
    if (best < 1) return null;
    return [a.slice(0, best).join('').trim(), a.slice(best).join('').trim()];
  }

  /* ================================================================ 文字の測り方と並べ方 */
  const widths = new Map();
  function measure(g, font, str) {
    const key = font + '\u0000' + str;
    let w = widths.get(key);
    if (w == null) { g.font = font; w = g.measureText(str).width; widths.set(key, w); if (widths.size > 6000) widths.clear(); }
    return w;
  }
  // 横書きの組み: 英数字の連なりは 1 つに(字詰めを保つ)、空白は幅だけ(半角 0.5 字・全角 1 字)、ほかは 1 字ずつ
  const H_TOKEN = /([!-~]+)|( )|(　)|([\s\S])/gu;
  function hTokens(line) {
    const out = [];
    for (const m of line.matchAll(H_TOKEN)) out.push(m[1] ? { t: m[1] } : m[2] ? { sp: 0.5 } : m[3] ? { sp: 1 } : { t: m[4] });
    return out;
  }
  function hWidth(g, font, px, line, track) {
    const tk = hTokens(line);
    return tk.reduce((w, k, i) => w + (k.sp ? k.sp * px : measure(g, font, k.t)) + (i < tk.length - 1 ? track : 0), 0);
  }
  // 縦書きの組み: 3 字以上の英数字は横に寝かせ、2 字までは縦中横。かっこ・長音などは 90 度回し、句読点は右上へ、小さい仮名は少し右上へ
  const V_TOKEN = /([!-~]{3,})|([!-~]{1,2}|[！？]{2})|( )|(　)|([\s\S])/gu;
  const V_ROT = new Set(Array.from('ー－―‐〜～…‥「」『』（）［］【】〈〉《》｛｝〔〕＝：；→←'));
  const V_PUNCT = new Set(Array.from('、。，．'));
  const V_SMALL = new Set(Array.from('ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ'));
  function vTokens(line) {
    const out = [];
    for (const m of line.matchAll(V_TOKEN)) out.push(m[1] ? { t: m[1], run: true } : m[2] ? { t: m[2], tcy: true } : m[3] ? { sp: 0.5 } : m[4] ? { sp: 1 } : { t: m[5] });
    return out;
  }
  function vLength(g, font, px, line, track) {
    const tk = vTokens(line);
    return tk.reduce((L, k, i) => L + (k.sp ? k.sp * px : k.run ? measure(g, font, k.t) : px) + (i < tk.length - 1 ? track : 0), 0);
  }
  /** 英語の折り返し(幅で)。2 行にするときは長い方の行がいちばん短くなる所で、句読点の後を少し好む */
  function wrapEn(g, font, text, maxW) {
    const paras = String(text || '').replace(/\r/g, '').split('\n').map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (paras.length !== 1) return paras;
    const p = paras[0], words = p.split(' '), W = (t) => measure(g, font, t);
    if (W(p) <= maxW || words.length < 2) return [p];
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), wa = W(a), wb = W(b);
      const score = Math.max(wa, wb) - (/[,.;:!?]$/.test(words[i - 1]) ? maxW * 0.06 : 0) + (wa > wb ? maxW * 0.01 : 0);
      if (!best || score < best.score) best = { lines: [a, b], score, m: Math.max(wa, wb) };
    }
    if (best.m <= maxW) return best.lines;
    const out = [];
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (line && W(t) > maxW) { out.push(line); line = w; } else line = t; }
    if (line) out.push(line);
    return out;
  }

  /* ================================================================ 字幕の配置 */
  /**
   * カットの字幕を並べる。返り値 { ops(描く字), boxes(帯の四角), ja: { lines, vertical }, en: { lines } }
   * op = { s, x, y, font, px, align, rot, sx, dx, dy, fake }(y は字の上下の真ん中。textBaseline = middle で描く)
   */
  function layoutSubs(g, s, cut, G) {
    const sub = s.sub, P = G.P, base = G.U * clamp(num(sub.size, 5), 2, 12) / 100;
    const track = clamp(num(sub.track, 4), 0, 40) / 100;
    const out = { ops: [], boxes: [], ja: { lines: [], vertical: false, n: 0 }, en: { lines: [] } };
    const jaText = sub.lang !== 'en' ? withName(String(cut.ja || '').trim(), cut.who, sub.name) : '';
    const enText = sub.lang !== 'ja' ? (sub.lang === 'en' && sub.name && cut.who && cut.en.trim() ? `(${cut.who}) ` : '') + String(cut.en || '').trim() : '';
    const fJa = fontSpec(sub.jaFont, sub.bold), fEn = fontSpec(enFontId(sub), sub.bold);
    const vertical = cut.dir === 'v' && !!jaText;
    const n = clamp(Math.round(num(sub.n, 16)), 6, 30), nv = Math.max(5, Math.round(n * 0.7));
    out.ja.vertical = vertical;
    out.ja.n = vertical ? nv : n;

    /* ---- 日本語 */
    let jaPx = base, ja = [];
    if (jaText) {
      ja = jaLines(jaText, { punct: sub.punct !== false, n: vertical ? nv : n });
      if (vertical) {
        const maxL = P.h * 0.84, len = Math.max(...ja.map((l) => vLength(g, fJa.css(jaPx), jaPx, l, jaPx * track)));
        if (len > maxL) jaPx *= maxL / len;
      } else {
        const maxW = P.w * 0.92, wid = Math.max(...ja.map((l) => hWidth(g, fJa.css(jaPx), jaPx, l, jaPx * track)));
        if (wid > maxW) jaPx *= maxW / wid;
      }
    }
    out.ja.lines = ja;
    /* ---- 英語 */
    let enPx = base * (sub.lang === 'en' ? 0.92 : 0.66), en = [];
    if (enText) {
      const maxW = P.w * 0.86;
      en = wrapEn(g, fEn.css(enPx), enText, maxW);
      const wid = Math.max(...en.map((l) => measure(g, fEn.css(enPx), l)));
      if (wid > P.w * 0.94) enPx *= (P.w * 0.94) / wid;
    }
    out.en.lines = en;

    /* ---- 縦書き(映像の右か左の上から。列は右から左へ) */
    if (vertical && ja.length) {
      const font = fJa.css(jaPx), tr = jaPx * track, pitch = jaPx * 1.55, mx = P.w * 0.045, top = P.y + P.h * 0.075;
      const bw = (ja.length - 1) * pitch + jaPx;
      const x0 = sub.vside === 'left' ? P.x + mx + bw - jaPx / 2 : P.x + P.w - mx - jaPx / 2;
      ja.forEach((line, ci) => {
        const cx = x0 - ci * pitch;
        let y = top;
        const tk = vTokens(line);
        tk.forEach((k, i) => {
          const gap = i < tk.length - 1 ? tr : 0;
          if (k.sp) { y += k.sp * jaPx + gap; return; }
          if (k.run) {
            const L = measure(g, font, k.t);
            out.ops.push({ s: k.t, x: cx, y: y + L / 2, font, px: jaPx, align: 'center', rot: Math.PI / 2, fake: fJa.fake });
            y += L + gap;
            return;
          }
          const op = { s: k.t, x: cx, y: y + jaPx / 2, font, px: jaPx, align: 'center', fake: fJa.fake };
          if (k.tcy) { const w = measure(g, font, k.t); if (w > jaPx * 0.96) op.sx = (jaPx * 0.96) / w; }
          else if (V_ROT.has(k.t)) op.rot = Math.PI / 2;
          else if (V_PUNCT.has(k.t)) { op.dx = jaPx * 0.62; op.dy = -jaPx * 0.6; }
          else if (V_SMALL.has(k.t)) { op.dx = jaPx * 0.1; op.dy = -jaPx * 0.1; }
          out.ops.push(op);
          y += jaPx + gap;
        });
        out.boxes.push({ x: cx - jaPx * 0.68, y: top - jaPx * 0.3, w: jaPx * 1.36, h: y - top + jaPx * 0.6 - (tk.length > 1 ? tr : 0) });
      });
    }

    /* ---- 横書きの段(日本語の行 → 英語の行)。下の黒帯に置くなら帯の真ん中、入らなければ映像の下 */
    const rows = [];
    if (!vertical) ja.forEach((l) => rows.push({ l, px: jaPx, font: fJa.css(jaPx), fake: fJa.fake, ja: true, pitch: jaPx * 1.42 }));
    en.forEach((l) => rows.push({ l, px: enPx, font: fEn.css(enPx), fake: fEn.fake, ja: false, pitch: enPx * 1.3 }));
    if (rows.length) {
      let blockH = 0;
      const step = (a, b) => (a.ja !== b.ja ? b.px * 0.75 + a.px * 0.5 + b.px * 0.5 : b.pitch);   // 日本語と英語の間は少しあける
      rows.forEach((r, i) => { blockH += i ? step(rows[i - 1], r) : 0; });
      blockH += rows[0].px / 2 + rows[rows.length - 1].px / 2;
      const barH = G.H - (P.y + P.h), cx = P.x + P.w / 2;
      let top;
      if (sub.pos === 'bar' && P.h < G.H - 2 && barH >= blockH + G.U * 0.04) top = P.y + P.h + (barH - blockH) / 2;
      else top = P.y + P.h - Math.max(G.U * 0.045, P.h * 0.065) - blockH;
      let y = top + rows[0].px / 2;
      rows.forEach((r, i) => {
        if (i) y += step(rows[i - 1], r);
        const tr = r.ja ? r.px * track : 0;
        if (r.ja) {
          const w = hWidth(g, r.font, r.px, r.l, tr);
          let x = cx - w / 2;
          const tk = hTokens(r.l);
          tk.forEach((k, j) => {
            const gap = j < tk.length - 1 ? tr : 0;
            if (k.sp) { x += k.sp * r.px + gap; return; }
            out.ops.push({ s: k.t, x, y, font: r.font, px: r.px, align: 'left', fake: r.fake });
            x += measure(g, r.font, k.t) + gap;
          });
          out.boxes.push({ x: cx - w / 2 - r.px * 0.4, y: y - r.px * 0.68, w: w + r.px * 0.8, h: r.px * 1.36 });
        } else {
          const w = measure(g, r.font, r.l);
          out.ops.push({ s: r.l, x: cx, y, font: r.font, px: r.px, align: 'center', fake: r.fake });
          out.boxes.push({ x: cx - w / 2 - r.px * 0.4, y: y - r.px * 0.7, w: w + r.px * 0.8, h: r.px * 1.4 });
        }
      });
    }
    return out;
  }

  /** 字を描く。縁は 影(shadow)・縁取り(outline)・帯(box)・なし(none) */
  function paintSubs(g, L, sub) {
    if (!L.ops.length) return;
    const color = /^#[0-9a-f]{6}$/i.test(sub.color || '') ? sub.color : '#ffffff', edge = sub.edge || 'shadow';
    g.save();
    g.textBaseline = 'middle';
    if (edge === 'box') {
      g.fillStyle = 'rgba(0,0,0,.62)';
      L.boxes.forEach((b) => { g.beginPath(); g.roundRect ? g.roundRect(b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * 0.12) : g.rect(b.x, b.y, b.w, b.h); g.fill(); });
    }
    const each = (fn) => L.ops.forEach((o) => {
      g.save();
      g.font = o.font;
      g.textAlign = o.align;
      g.translate(o.x, o.y);
      if (o.rot) g.rotate(o.rot);
      if (o.sx) g.scale(o.sx, 1);
      fn(o, o.dx || 0, o.dy || 0);
      g.restore();
    });
    const fill = (o, dx, dy) => {
      g.fillStyle = color;
      g.fillText(o.s, dx, dy);
      if (o.fake) { g.lineJoin = 'round'; g.lineWidth = o.px * 0.045; g.strokeStyle = color; g.strokeText(o.s, dx, dy); }
    };
    if (edge === 'outline') {
      each((o, dx, dy) => { g.lineJoin = 'round'; g.lineWidth = o.px * 0.17; g.strokeStyle = 'rgba(0,0,0,.92)'; g.strokeText(o.s, dx, dy); });
    } else if (edge === 'shadow') {
      each((o, dx, dy) => { g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowBlur = o.px * 0.18; g.shadowOffsetY = o.px * 0.035; fill(o, dx, dy); });
    }
    each(fill);
    g.restore();
  }

  /* ================================================================ 写真と色味 */
  // 色味の見本(押すと下の値がそろう)。値はどれも -100〜100(teal・fade は 0〜100)
  const LOOKS = {
    none: { label: 'そのまま', v: { bright: 0, contrast: 0, sat: 0, temp: 0, teal: 0, fade: 0 } },
    teal: { label: 'ティールとオレンジ', v: { bright: -4, contrast: 16, sat: 6, temp: 4, teal: 70, fade: 0 } },
    faded: { label: '色あせ', v: { bright: 6, contrast: -16, sat: -30, temp: 14, teal: 0, fade: 45 } },
    mono: { label: '白黒', v: { bright: 0, contrast: 22, sat: -100, temp: 0, teal: 0, fade: 12 } },
    dusk: { label: '夕暮れ', v: { bright: 2, contrast: 10, sat: 12, temp: 45, teal: 0, fade: 8 } },
    night: { label: '夜', v: { bright: -14, contrast: 14, sat: -18, temp: -42, teal: 20, fade: 0 } }
  };
  const LOOK_KEYS = ['bright', 'contrast', 'sat', 'temp', 'teal', 'fade'];
  /** 映像の四角 P の色を変える(明るさ・コントラスト・彩度・色温度・ティールとオレンジ・黒の浮き) */
  function grade(g, P, look) {
    const v = (k) => clamp(num(look[k], 0) / 100, -1, 1);
    const b = v('bright'), c = v('contrast'), sa = v('sat'), te = v('temp'), tl = clamp(v('teal'), 0, 1), fd = clamp(v('fade'), 0, 1);
    if (!b && !c && !sa && !te && !tl && !fd) return;
    const im = g.getImageData(P.x, P.y, P.w, P.h), d = im.data;
    const gamma = Math.pow(2, -b * 0.9), cf = c >= 0 ? 1 + c * 1.1 : 1 + c * 0.7, lift = fd * 0.16;
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) lut[i] = lift + clamp((Math.pow(i / 255, gamma) - 0.5) * cf + 0.5, 0, 1) * (1 - lift * 1.1);
    for (let i = 0; i < d.length; i += 4) {
      let r = lut[d[i]], gg = lut[d[i + 1]], bl = lut[d[i + 2]];
      const L = 0.2126 * r + 0.7152 * gg + 0.0722 * bl;
      if (tl) {
        const sh = (1 - L) * (1 - L) * tl, hi = L * L * tl;   // 暗い所は青緑へ、明るい所は橙へ
        r += -0.07 * sh + 0.08 * hi; gg += 0.02 * sh + 0.025 * hi; bl += 0.07 * sh - 0.07 * hi;
      }
      r += te * 0.07; bl -= te * 0.07;
      if (sa) {
        const L2 = 0.2126 * r + 0.7152 * gg + 0.0722 * bl, f = 1 + sa;
        r = L2 + (r - L2) * f; gg = L2 + (gg - L2) * f; bl = L2 + (bl - L2) * f;
      }
      d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = bl * 255;
    }
    g.putImageData(im, P.x, P.y);
  }
  let noiseTex = null;
  function noise() {
    if (noiseTex) return noiseTex;
    const n = 256, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n);
    let a = 20261114;
    const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < im.data.length; i += 4) {
      const v = clamp(128 + (r() + r() + r() - 1.5) * 96, 0, 255);
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return (noiseTex = c);
  }
  /** 周辺減光と粒子(強さ 0〜100)。粒子の細かさは画面の短い辺に合わせる(小さな画面では細かくなりすぎて見えにくい) */
  function filmFx(g, P, U, look) {
    const vg = clamp(num(look.vignette, 0), 0, 100) / 100, gr = clamp(num(look.grain, 0), 0, 100) / 100;
    g.save();
    g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
    if (vg) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.translate(P.x + P.w / 2, P.y + P.h / 2);
      g.scale(P.w / 2, P.h / 2);
      const v = Math.round(255 * (1 - 0.82 * vg)), rg = g.createRadialGradient(0, 0, 0.38, 0, 0, 1.45);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(1, `rgb(${v},${v},${v})`);
      g.fillStyle = rg;
      g.fillRect(-1, -1, 2, 2);
      g.restore();
    }
    if (gr) {
      const pat = g.createPattern(noise(), 'repeat'), k = U / 1080;
      if (pat.setTransform) pat.setTransform(new DOMMatrix([k, 0, 0, k, P.x, P.y]));
      g.globalCompositeOperation = 'overlay';
      g.globalAlpha = gr * 0.6;
      g.fillStyle = pat;
      g.fillRect(P.x, P.y, P.w, P.h);
    }
    g.restore();
  }
  /** 写真がないときの地(夕暮れの空と地平)。書き出しにもこのまま出る */
  function placeholder(g, P) {
    const lg = g.createLinearGradient(0, P.y, 0, P.y + P.h);
    lg.addColorStop(0, '#141b33'); lg.addColorStop(0.45, '#40385c'); lg.addColorStop(0.62, '#b8705a'); lg.addColorStop(0.66, '#e0a070');
    lg.addColorStop(0.665, '#2a2230'); lg.addColorStop(1, '#0f0d14');
    g.fillStyle = lg;
    g.fillRect(P.x, P.y, P.w, P.h);
    const sx = P.x + P.w * 0.64, sy = P.y + P.h * 0.655, rg = g.createRadialGradient(sx, sy, 0, sx, sy, P.w * 0.32);
    rg.addColorStop(0, 'rgba(255,214,160,.85)'); rg.addColorStop(0.08, 'rgba(255,170,110,.45)'); rg.addColorStop(1, 'rgba(255,140,90,0)');
    g.save();
    g.beginPath(); g.rect(P.x, P.y, P.w, P.h * 0.663); g.clip();
    g.fillStyle = rg;
    g.fillRect(P.x, P.y, P.w, P.h);
    g.restore();
  }

  /* ---------------------------------------------------------------- 写真の読み込み(id ごとに 1 度) */
  const imgs = new Map();   // 写真の id → { src, img, ready, p(Promise) }
  function imgEntry(id) {
    const ph = id && ed.state.photos[id];
    if (!ph) return null;
    let e = imgs.get(id);
    if (!e || e.src !== ph.src) {
      e = { src: ph.src, img: new Image(), ready: false };
      e.p = new Promise((res) => {
        e.img.onload = () => { e.ready = true; res(true); invalidate(); };
        e.img.onerror = () => res(false);
      });
      e.img.src = ph.src;
      imgs.set(id, e);
    }
    return e;
  }
  /** 写真の置き方: 映像の四角を覆う大きさ × zoom、x・y は -1〜1(はみ出した分のどこを見せるか) */
  function photoRect(img, P, cut) {
    const z = clamp(num(cut.zoom, 1), 1, 6), sc = Math.max(P.w / img.naturalWidth, P.h / img.naturalHeight) * z;
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    const cx = P.x + P.w / 2 + clamp(num(cut.x, 0), -1, 1) * (dw - P.w) / 2;
    const cy = P.y + P.h / 2 + clamp(num(cut.y, 0), -1, 1) * (dh - P.h) / 2;
    return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh };
  }

  /* ---------------------------------------------------------------- 映像の層(黒帯・写真・色味・減光・粒子)。字幕の前に描く。大きさと設定ごとに覚える */
  const layers = new Map();
  function pictureLayer(s, cut, W, H) {
    const e = imgEntry(cut.photo), ready = !!(e && e.ready);
    const key = [W, H, s.screen, s.picture, ready ? cut.photo : '-', ready ? [cut.x, cut.y, cut.zoom].map((v) => num(v, 0).toFixed(4)).join(',') : '', JSON.stringify(s.look)].join('|');
    let c = layers.get(key);
    if (c) { layers.delete(key); layers.set(key, c); return c; }
    c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }), G = geom(s, W, H), P = G.P;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (ready) {
      const r = photoRect(e.img, P, cut);
      g.save();
      g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
      g.imageSmoothingQuality = 'high';
      g.drawImage(e.img, r.x, r.y, r.w, r.h);
      g.restore();
    } else placeholder(g, P);
    grade(g, P, s.look);
    filmFx(g, P, G.U, s.look);
    layers.set(key, c);
    while (layers.size > 24) layers.delete(layers.keys().next().value);
    return c;
  }
  /** カット 1 枚を g に W×H で描く。返り値は字幕の配置 */
  function drawCut(g, s, cut, W, H) {
    g.drawImage(pictureLayer(s, cut, W, H), 0, 0);
    const L = layoutSubs(g, s, cut, geom(s, W, H));
    paintSubs(g, L, s.sub);
    return L;
  }

  /* ================================================================ 保存の形(Ed) */
  const newCut = (o) => Object.assign({ id: U.uid(), photo: null, x: 0, y: 0, zoom: 1, ja: '', en: '', who: '', dir: 'h' }, o || {});
  function defaults() {
    return {
      title: '',
      screen: '16:9', picture: '2.39',
      sub: { lang: 'ja', jaFont: 'cinecaption', enFont: 'arimo', bold: false, size: 5, track: 4, color: '#ffffff', edge: 'shadow', pos: 'in', vside: 'right', n: 16, punct: true, name: false },
      look: Object.assign({ preset: 'dusk', grain: 22, vignette: 30 }, LOOKS.dusk.v),
      stack: { gap: 'thin' },
      photos: {},
      cuts: [
        newCut({ ja: 'ここまで来れば、もう誰も追ってこない。', en: 'No one will follow us this far.' }),
        newCut({ ja: 'なら、少しだけ休もうか。', en: "Then let's rest, just for a while." })
      ]
    };
  }
  function migrate(st) {
    const d = defaults(), o = st && typeof st === 'object' ? st : {};
    const cuts = Array.isArray(o.cuts) && o.cuts.length ? o.cuts.map((c) => newCut(Object.assign({}, c, { id: c && c.id ? c.id : U.uid() }))) : d.cuts;
    return Object.assign(d, o, {
      sub: Object.assign(d.sub, o.sub), look: Object.assign(d.look, o.look), stack: Object.assign(d.stack, o.stack),
      photos: o.photos && typeof o.photos === 'object' ? o.photos : {}, cuts
    });
  }
  const cfg = { app: 'usermovie', version: 1, width: 1, defaults, migrate, render: () => h('div'), mount: h('div') };
  const ed = Ed.create(cfg);
  const baseSet = ed.set;
  ed.set = (p, v, o) => { baseSet(p, v); invalidate(); if (o && o.panel) renderPanel(); };
  ed.rerender = () => { view.cur = 0; widths.clear(); layers.clear(); renderAll(); };

  /* ================================================================ 作業台 */
  const view = { cur: 0 };
  let LOG = null;   // 読み込んだ talklog { title, lines: [{ no, name, text, act, nar }], names }。保存しない
  const curCut = () => { const cs = ed.state.cuts; view.cur = clamp(view.cur, 0, cs.length - 1); return cs[view.cur]; };
  const cv = $('screen'), box = $('view'), drop = $('drop'), stage = $('stage');
  let raf = 0, last = null;
  function invalidate() { if (!raf) raf = requestAnimationFrame(paint); }
  /** 画面の大きさを作業台に合わせる(書き出しと同じ縦横比)。狭い画面では作業台の高さを画面の形に合わせる(高さは画面の 6 割まで) */
  const narrow = matchMedia('(max-width: 920px)');
  function fitStage() {
    const sc = screenOf(ed.state), aw = Math.max(80, box.clientWidth - 24);
    let ah;
    if (narrow.matches) {
      ah = Math.round(Math.min(aw * sc.h / sc.w, window.innerHeight * 0.6));
      if (box.style.height !== ah + 24 + 'px') box.style.height = ah + 24 + 'px';
    } else {
      if (box.style.height) box.style.height = '';
      ah = Math.max(80, box.clientHeight - 24);
    }
    const k = Math.min(aw / sc.w, ah / sc.h), dw = Math.round(sc.w * k), dh = Math.round(sc.h * k), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = dw + 'px';
    cv.style.height = dh + 'px';
    const pw = Math.round(dw * dpr), ph = Math.round(dh * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    invalidate();
  }
  new ResizeObserver(fitStage).observe(box);
  function paint() {
    raf = 0;
    const s = ed.state, cut = curCut(), g = cv.getContext('2d');
    last = drawCut(g, s, cut, cv.width, cv.height);
    const has = !!(cut.photo && s.photos[cut.photo]);
    drop.hidden = has;
    cv.classList.toggle('has-photo', has);
    updateMeta();
    scheduleThumbs();
    needFonts();
  }

  /* ---------------------------------------------------------------- 書体を読む(使う字の分だけ。読めたら描き直す) */
  let fontKey = '', fontFail = false;
  function fontJobs(s) {
    const sub = s.sub, jobs = [], w = (id) => [fontSpec(id, sub.bold).w];
    const ja = s.cuts.map((c) => withName(c.ja || '', c.who, sub.name)).join('') + '（）あア漢', en = s.cuts.map((c) => (c.en || '') + (c.who || '')).join('') + 'Aa()';
    if (sub.lang !== 'en') jobs.push([sub.jaFont, w(sub.jaFont), ja]);
    if (sub.lang !== 'ja') jobs.push([enFontId(sub), w(enFontId(sub)), en]);
    return jobs;
  }
  function needFonts() {
    const jobs = fontJobs(ed.state), key = JSON.stringify(jobs);
    if (key === fontKey) return;
    fontKey = key;
    Promise.all(jobs.map(([id, ws, t]) => KitFonts.load(id, ws, t))).then((rs) => {
      const bad = rs.find((r) => !r.ok);
      if (bad && !fontFail) U.toast(`${bad.why}${bad.hint ? '。' + bad.hint + 'ください' : ''}`.replace('くださいください', 'ください'), 'error');
      fontFail = !!bad;
      widths.clear();
      thumbKeys.clear();
      invalidate();
    });
  }

  /* ---------------------------------------------------------------- 写真を動かす(ドラッグ)・拡大(ホイール・ピンチ) */
  const ptrs = new Map();
  let drag = null;
  const slack = (cut) => {
    const e = imgEntry(cut.photo);
    if (!e || !e.ready) return null;
    const P = geom(ed.state, cv.width, cv.height).P, r = photoRect(e.img, P, cut), k = cv.getBoundingClientRect().width / cv.width;
    return { x: ((r.w - P.w) / 2) * k, y: ((r.h - P.h) / 2) * k };
  };
  cv.addEventListener('pointerdown', (e) => {
    const cut = curCut();
    if (!cut.photo || !ed.state.photos[cut.photo]) { photoIn.click(); return; }
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x0: e.clientX, y0: e.clientY, cx: num(cut.x, 0), cy: num(cut.y, 0), sl: slack(cut) };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: num(cut.zoom, 1) };
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !drag) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cut = curCut();
    if (drag.pinch) {
      const [a, b] = [...ptrs.values()];
      cut.zoom = clamp(drag.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / drag.pinch), 1, 6);
    } else if (drag.sl) {
      if (drag.sl.x > 0.5) cut.x = clamp(drag.cx + (e.clientX - drag.x0) / drag.sl.x, -1, 1);
      if (drag.sl.y > 0.5) cut.y = clamp(drag.cy + (e.clientY - drag.y0) / drag.sl.y, -1, 1);
    }
    invalidate();
  });
  const endPtr = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 1) { const [p] = ptrs.values(), cut = curCut(); drag = { x0: p.x, y0: p.y, cx: num(cut.x, 0), cy: num(cut.y, 0), sl: slack(cut) }; }
    if (!ptrs.size) { drag = null; ed.dirty(); syncZoom(); }
  };
  cv.addEventListener('pointerup', endPtr);
  cv.addEventListener('pointercancel', endPtr);
  cv.addEventListener('wheel', (e) => {
    const cut = curCut();
    if (!cut.photo) return;
    e.preventDefault();
    cut.zoom = clamp(num(cut.zoom, 1) * Math.exp(-e.deltaY * 0.0015), 1, 6);
    ed.dirty();
    syncZoom();
    invalidate();
  }, { passive: false });

  /* ---------------------------------------------------------------- 写真を入れる(選ぶ・ドラッグ・貼り付け) */
  const photoIn = $('photoIn');
  photoIn.addEventListener('change', () => { const f = photoIn.files[0]; photoIn.value = ''; if (f) setPhoto(f); });
  async function setPhoto(file) {
    if (!file || !/^image\//.test(file.type)) return U.toast('画像のファイルを選んでください', 'error');
    try {
      const src = await U.fileToDataUrl(file, 2400, 'image/jpeg');
      const img = await U.loadImage(src), id = U.uid(), cut = curCut();
      ed.state.photos[id] = { src, w: img.naturalWidth, h: img.naturalHeight };
      Object.assign(cut, { photo: id, x: 0, y: 0, zoom: 1 });
      gcPhotos();
      ed.dirty();
      renderPanel();
      invalidate();
    } catch (e) { U.toast('画像を読み込めませんでした', 'error'); }
  }
  /** どのカットからも使われていない写真を消す */
  function gcPhotos() {
    const used = new Set(ed.state.cuts.map((c) => c.photo).filter(Boolean));
    Object.keys(ed.state.photos).forEach((id) => { if (!used.has(id)) { delete ed.state.photos[id]; imgs.delete(id); } });
  }
  stage.addEventListener('dragover', (e) => { if ([...(e.dataTransfer.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); stage.classList.add('is-over'); } });
  stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('is-over'); });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('is-over');
    const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type));
    if (f) setPhoto(f);
  });
  document.addEventListener('paste', (e) => {
    if (e.target && e.target.closest && e.target.closest('input,textarea,[contenteditable]')) return;
    const f = U.imageFromPaste(e);
    if (f) { e.preventDefault(); setPhoto(f); }
  });

  /* ================================================================ カットの並び(作業台の下) */
  const strip = $('strip');
  const thumbKeys = new Map();   // カットの id → 描いたときの鍵
  let thumbTimer = 0;
  const thumbSize = () => { const sc = screenOf(ed.state), th = 54, tw = Math.min(110, Math.round(th * sc.w / sc.h)); return [tw, Math.round(tw * sc.h / sc.w)]; };
  function renderStrip() {
    const cs = ed.state.cuts, [tw, th] = thumbSize();
    strip.replaceChildren(
      h('div.mov-cuts', { role: 'list', 'aria-label': 'カットの並び' }, cs.map((c, i) => h('button.mov-cut', {
        type: 'button', role: 'listitem', 'aria-pressed': String(i === view.cur), 'aria-label': `カット ${i + 1}`, 'data-id': c.id,
        onclick: () => { if (view.cur !== i) { view.cur = i; renderStrip(); renderPanel(); invalidate(); } }
      }, h('canvas', { width: tw * 2, height: th * 2, style: { width: tw + 'px', height: th + 'px' } }), h('span', String(i + 1))))),
      h('button.mov-add', { type: 'button', onclick: () => addCut(), title: 'いまのカットの後ろに、同じ写真のカットを足します' }, icon('plus', 16), h('span', 'カットを足す')));
    thumbKeys.clear();
    scheduleThumbs();
  }
  function scheduleThumbs() { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, 180); }
  function drawThumbs() {
    const s = ed.state, common = JSON.stringify([s.screen, s.picture, s.sub, s.look, fontKey]);
    strip.querySelectorAll('.mov-cut').forEach((b) => {
      const cut = s.cuts.find((c) => c.id === b.dataset.id), cvs = b.querySelector('canvas');
      if (!cut || !cvs) return;
      const e = imgEntry(cut.photo), key = common + JSON.stringify(cut) + (e && e.ready ? 1 : 0);
      if (thumbKeys.get(cut.id) === key) return;
      thumbKeys.set(cut.id, key);
      drawCut(cvs.getContext('2d'), s, cut, cvs.width, cvs.height);
    });
  }
  function addCut(o) {
    const cur = curCut(), c = newCut(Object.assign({ photo: cur.photo, x: cur.x, y: cur.y, zoom: cur.zoom, dir: cur.dir, who: '' }, o || {}));
    ed.state.cuts.splice(view.cur + 1, 0, c);
    view.cur += 1;
    ed.dirty();
    renderStrip();
    renderPanel();
    invalidate();
    return c;
  }
  function moveCut(d) {
    const cs = ed.state.cuts, i = view.cur, j = i + d;
    if (j < 0 || j >= cs.length) return;
    [cs[i], cs[j]] = [cs[j], cs[i]];
    view.cur = j;
    ed.dirty();
    renderStrip();
    renderPanel();
  }
  async function removeCut() {
    const cs = ed.state.cuts;
    if (cs.length < 2) return U.toast('カットが 1 つのときは消せません');
    const c = curCut();
    if ((c.ja || c.en) && !(await U.confirmDialog({ title: 'カットを消す', message: `カット ${view.cur + 1} を消します。`, okLabel: '消す', danger: true }))) return;
    cs.splice(view.cur, 1);
    view.cur = Math.min(view.cur, cs.length - 1);
    gcPhotos();
    ed.dirty();
    renderStrip();
    renderPanel();
    invalidate();
  }

  /* ================================================================ 設定の欄 */
  const side = $('side');
  const sideTop = h('div.mov-side-top', ed.statusEl, h('span.kit-spacer'), ed.fileMenu({ resetLabel: '最初に戻す', resetHint: 'カットと写真をすべて消して、見本の状態に戻します' }));
  const sideBody = h('div.mov-side-body');
  side.append(sideTop, sideBody);

  const sec = (title, ...kids) => h('section.mov-sec', h('h2', title), ...kids);
  const field = (label, control, hint) => h('div.field', h('label', label, hint && h('small', hint)), control);
  function seg(label, opts, cur, onPick) {
    const g = h('div.seg', { role: 'group', 'aria-label': label });
    opts.forEach(([v, t]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(v === cur) }, t);
      b.addEventListener('click', () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(v); });
      g.append(b);
    });
    return g;
  }
  function range(label, min, max, step, value, fmt, onInput) {
    const show = (v) => (fmt ? fmt(v) : String(v));
    const out = h('output', show(value));
    const inp = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
    inp.addEventListener('input', () => { out.textContent = show(Number(inp.value)); onInput(Number(inp.value)); });
    inp.__sync = (v) => { inp.value = v; out.textContent = show(v); };
    return h('div.mov-range', inp, out);
  }
  const check = (label, on, onChange) => h('label.check', h('input', { type: 'checkbox', checked: on, onchange: (e) => onChange(e.target.checked) }), label);
  function fontButtons(ids, cur, sample, onPick, sameLabel) {
    const g = h('div.mov-fonts', { role: 'group' });
    ids.forEach((id) => {
      const same = id === 'same', f = same ? null : KitFonts.info(id);
      const b = h('button', { type: 'button', 'aria-pressed': String(id === cur), title: same ? '和文と同じ書体で出します' : f.mood },
        h('b', { style: { fontFamily: same ? 'inherit' : KitFonts.stack(id) } }, same ? sameLabel : sample),
        h('small', same ? '和文と同じ' : f.label));
      b.addEventListener('click', () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(id); });
      if (!same) KitFonts.load(id, [400], sample).catch(() => {});
      g.append(b);
    });
    return g;
  }

  let meta = null, zoomInput = null;
  const syncZoom = () => { if (zoomInput) zoomInput.__sync(Number(num(curCut().zoom, 1).toFixed(2))); };

  function secCut(s) {
    const cut = curCut(), i = view.cur, n = s.cuts.length, P = (k) => `cuts.${i}.${k}`;
    const has = !!(cut.photo && s.photos[cut.photo]);
    const ta = (path, label, rows, ph) => {
      const t = h('textarea', { rows, 'aria-label': label, placeholder: ph || '', spellcheck: 'false' });
      t.value = ed.get(path) || '';
      t.addEventListener('input', () => ed.set(path, t.value));
      return t;
    };
    const zoom = range('写真の拡大', 1, 6, 0.01, Number(num(cut.zoom, 1).toFixed(2)), (v) => `${Math.round(v * 100)}%`, (v) => { cut.zoom = v; ed.dirty(); invalidate(); });
    zoomInput = zoom.querySelector('input');
    meta = { ja: h('p.mov-meta'), en: h('p.mov-meta') };
    const ja = ta(P('ja'), '日本語の字幕', 3, '字幕を打つか、talklog から選びます');
    const en = s.sub.lang !== 'ja' && ta(P('en'), '英語の字幕', 2, 'English subtitle');
    const who = h('input', { type: 'text', value: cut.who || '', 'aria-label': '話者の名前', placeholder: '名前' });
    who.addEventListener('input', () => ed.set(P('who'), who.value));
    return h('section.mov-sec.mov-cutsec',
      h('div.mov-cuthead',
        h('h2', `カット ${i + 1}`, h('small', ` / ${n}`)),
        h('span.kit-spacer'),
        h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '前へ動かす', 'aria-label': '前へ動かす', disabled: i === 0, onclick: () => moveCut(-1) }, icon('left', 17)),
        h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '後ろへ動かす', 'aria-label': '後ろへ動かす', disabled: i === n - 1, onclick: () => moveCut(1) }, icon('right', 17)),
        h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '同じ写真と字幕のカットを後ろに足します', 'aria-label': 'カットを複製', onclick: () => addCut({ ja: cut.ja, en: cut.en, who: cut.who }) }, icon('copy', 16)),
        h('button.btn.btn-ghost.btn-icon.danger', { type: 'button', title: 'このカットを消す', 'aria-label': 'このカットを消す', disabled: n < 2, onclick: removeCut }, icon('trash', 16))),
      field('写真', h('div.mov-col',
        h('div.mov-row',
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => photoIn.click() }, icon('image', 15), has ? '写真を替える' : '写真を選ぶ'),
          has && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { Object.assign(cut, { x: 0, y: 0, zoom: 1 }); ed.dirty(); syncZoom(); invalidate(); } }, '位置を戻す'),
          has && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { cut.photo = null; gcPhotos(); ed.dirty(); renderPanel(); invalidate(); } }, '外す')),
        has && zoom,
        has && n > 1 && h('button.btn.btn-ghost.btn-sm.mov-left', { type: 'button', onclick: () => {
          s.cuts.forEach((c) => { if (c !== cut) Object.assign(c, { photo: cut.photo, x: cut.x, y: cut.y, zoom: cut.zoom }); });
          gcPhotos(); ed.dirty(); thumbKeys.clear(); scheduleThumbs(); U.toast('ほかのカットも同じ写真にしました');
        } }, icon('copy', 14), 'この写真をほかのカットにも使う'),
        h('p.hint', has ? '画面の写真はドラッグで動かせ、ホイールかピンチで拡大できます。' : '写真は作業台へのドラッグや貼り付けでも入れられます。'))),
      s.sub.lang !== 'en' && field('字幕', h('div.mov-col', ja, meta.ja)),
      en && field('英語の字幕', h('div.mov-col', en, meta.en)),
      h('div.grid-2',
        field('話者', who, s.sub.name ? '' : '名前を出す設定のときだけ出します'),
        field('字幕の向き', seg('字幕の向き', [['h', '横書き'], ['v', '縦書き']], cut.dir === 'v' ? 'v' : 'h', (v) => ed.set(P('dir'), v, { panel: true })))),
      h('div.mov-row',
        h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: openLog }, icon('bubble', 15), 'talklog から選ぶ'),
        LOG && h('small.hint', `読み込み中: ${LOG.title}`)));
  }
  /** 字数と行数の知らせ(描くたびに)。日本語が 3 行を超えたら分けるボタン */
  function updateMeta() {
    if (!meta || !last) return;
    const cut = curCut(), J = last.ja, jl = J.lines.length, chars = Array.from(String(cut.ja || '').replace(/\s/g, '')).length;
    if (meta.ja.isConnected) {
      const unit = J.vertical ? '列' : '行';
      const long = jl > 2;
      meta.ja.classList.toggle('is-warn', long);
      meta.ja.replaceChildren(...[
        h('span', chars ? `${chars} 字・${jl} ${unit}` : '空のときは字幕を出しません'),
        long && h('span', `2 ${unit}に収まりません。2 つのカットに分けると読みやすくなります`),
        long && h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: splitCut }, '2 つに分ける')].filter(Boolean));
    }
    if (meta.en.isConnected) {
      const el = last.en.lines.length, len = String(cut.en || '').trim().length;
      meta.en.classList.toggle('is-warn', el > 2);
      meta.en.textContent = len ? `${len} 文字・${el} 行${el > 2 ? '　2 行に収まりません。2 つのカットに分けると読みやすくなります' : ''}` : '空のときは英語の字幕を出しません';
    }
  }
  function splitCut() {
    const cut = curCut(), parts = splitText(cut.ja);
    if (!parts || !parts[0] || !parts[1]) return U.toast('分ける所が見つかりませんでした');
    cut.ja = parts[0];
    const en = cut.en;
    cut.en = '';
    addCut({ ja: parts[1], who: cut.who, en: '' });
    if (en) U.toast('英語の字幕は外しました。分けた 2 つのカットに入れ直してください');
  }

  function secSub(s) {
    const sub = s.sub, set = (k, v, o) => ed.set('sub.' + k, v, o);
    const jaF = KitFonts.info(sub.jaFont), enId = enFontId(sub);
    const colors = [['#ffffff', '白'], ['#fff3c4', 'クリーム'], ['#ffe14a', '黄色']];
    const color = h('div.mov-swatches', colors.map(([c, t]) => h('button.mov-sw', {
      type: 'button', title: t, 'aria-label': `字の色 ${t}`, 'aria-pressed': String(c === sub.color), style: { '--sw': c },
      onclick: () => set('color', c, { panel: true })
    })), h('button.mov-sw.own', {
      type: 'button', title: 'ほかの色を選びます', 'aria-label': 'ほかの色を選ぶ', 'aria-pressed': String(!colors.some(([c]) => c === sub.color)), style: { '--sw': sub.color },
      onclick: async () => { const v = await Ed.pickColor({ value: sub.color, title: '字幕の色' }); if (v) set('color', v, { panel: true }); }
    }, icon('plus', 12)));
    return sec('字幕の見た目',
      field('字幕の言葉', seg('字幕の言葉', [['ja', '日本語'], ['en', '英語'], ['both', '日本語と英語']], sub.lang, (v) => set('lang', v, { panel: true }))),
      sub.lang !== 'en' && field('日本語の書体', h('div.mov-col',
        fontButtons(JA_FONTS, sub.jaFont, '字幕', (id) => set('jaFont', id, { panel: true })),
        jaF.credit && h('p.hint', jaF.credit + '。作者の配布条件に沿って同梱しています。'))),
      sub.lang !== 'ja' && field('英語の書体', fontButtons(EN_FONTS, sub.enFont, 'Ag', (id) => set('enFont', id, { panel: true }), '字A'),
        enId !== sub.jaFont ? KitFonts.info(enId).mood : ''),
      h('div.grid-2',
        field('大きさ', range('字幕の大きさ', 3, 9, 0.1, num(sub.size, 5), (v) => v.toFixed(1), (v) => set('size', v))),
        field('字間', range('字間', 0, 30, 1, num(sub.track, 4), (v) => `${v}%`, (v) => set('track', v)))),
      h('div.mov-row', check('太字', !!sub.bold, (v) => set('bold', v))),
      field('字の色', color),
      field('縁', seg('字の縁', [['shadow', '影'], ['outline', '縁取り'], ['box', '帯'], ['none', 'なし']], sub.edge, (v) => set('edge', v))),
      field('横書きの位置', seg('横書きの字幕の位置', [['in', '映像の下'], ['bar', '下の黒帯']], sub.pos, (v) => set('pos', v)),
        '黒帯に収まらないときは映像の下に出します'),
      field('縦書きの位置', seg('縦書きの字幕の位置', [['right', '右'], ['left', '左']], sub.vside, (v) => set('vside', v))),
      field('1 行の字数', range('1 行の字数', 8, 24, 1, num(sub.n, 16), (v) => `${v} 字`, (v) => set('n', v)), '縦書きはこの 7 割の字数です'),
      h('div.mov-col',
        check('句読点を空白にする', sub.punct !== false, (v) => set('punct', v)),
        check('話者の名前を（ ）で前に付ける', !!sub.name, (v) => set('name', v, { panel: true }))));
  }

  function secScreen(s) {
    return sec('画面',
      field('画面の形', seg('画面の形', Object.entries(SCREENS).map(([k, v]) => [k, v.label]), s.screen, (v) => { ed.set('screen', v); fitStage(); renderStrip(); })),
      field('黒帯（映像の比率）', seg('映像の比率', Object.entries(PICTURES).map(([k, v]) => [k, v.label]), s.picture, (v) => ed.set('picture', v))),
      h('p.hint', `書き出す画像の大きさは ${screenOf(s).w} × ${screenOf(s).h} です。`));
  }

  function secLook(s) {
    const L = s.look, sliders = [];
    const sl = (k, label, min, max) => { const r = range(label, min, max, 1, num(L[k], 0), null, (v) => { L[k] = v; L.preset = ''; presets.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false')); ed.dirty(); invalidate(); }); sliders.push([k, r.querySelector('input')]); return field(label, r); };
    const presets = h('div.mov-chips', Object.entries(LOOKS).map(([k, v]) => h('button', {
      type: 'button', 'aria-pressed': String(L.preset === k),
      onclick: (e) => {
        Object.assign(L, v.v, { preset: k });
        presets.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        sliders.forEach(([key, inp]) => inp.__sync(num(L[key], 0)));
        ed.dirty(); invalidate();
      }
    }, v.label)));
    return sec('色味',
      presets,
      h('div.grid-2', sl('bright', '明るさ', -100, 100), sl('contrast', 'コントラスト', -100, 100)),
      h('div.grid-2', sl('sat', '彩度', -100, 100), sl('temp', '色温度', -100, 100)),
      h('div.grid-2', sl('teal', 'ティールとオレンジ', 0, 100), sl('fade', '黒の浮き', 0, 100)),
      h('div.grid-2',
        field('周辺減光', range('周辺減光', 0, 100, 1, num(L.vignette, 0), null, (v) => { L.vignette = v; ed.dirty(); invalidate(); })),
        field('粒子', range('粒子', 0, 100, 1, num(L.grain, 0), null, (v) => { L.grain = v; ed.dirty(); invalidate(); }))));
  }

  function secSave(s) {
    const title = h('input', { type: 'text', value: s.title || '', 'aria-label': 'ファイルの名前', placeholder: 'movie' });
    title.addEventListener('input', () => ed.set('title', title.value));
    const btn = (ic, label, fn, cls) => h('button.btn.btn-sm' + (cls || '.btn-outline'), { type: 'button', onclick: (e) => run(e.currentTarget, fn) }, icon(ic, 15), label);
    return sec('保存',
      field('ファイルの名前', title),
      h('div.mov-col',
        btn('download', 'このカットを PNG で保存', saveOne, '.btn-primary'),
        s.cuts.length > 1 && btn('download', `全カットを 1 枚ずつ保存（${s.cuts.length} 枚）`, saveEach),
        s.cuts.length > 1 && h('div.mov-stackrow',
          btn('download', '縦に並べた 1 枚で保存', saveStack),
          seg('カットの間', [['none', '間なし'], ['thin', '細い間'], ['wide', '広い間']], s.stack.gap, (v) => ed.set('stack.gap', v)))),
      h('p.hint', 'カットを縦に並べた 1 枚は、会話の流れを見せたいときに使います。'));
  }

  function renderPanel() {
    const s = ed.state;
    sideBody.replaceChildren(secCut(s), secSub(s), secScreen(s), secLook(s), secSave(s));
    U.hydrateIcons(sideBody);
    invalidate();
  }
  function renderAll() { renderStrip(); renderPanel(); fitStage(); }

  /* ================================================================ 書き出し */
  let busy = false;
  async function run(btn, fn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try { await fn(); } catch (e) { U.toast(e.message || '保存できませんでした', 'error'); } finally { busy = false; btn.disabled = false; }
  }
  /** 書き出す前に、書体(使う字の分)と写真を待つ。書体が読めなければやめる(黙って代わりの書体で出さない) */
  async function ready(cuts) {
    const rs = await Promise.all(fontJobs(ed.state).map(([id, ws, t]) => KitFonts.load(id, ws, t)));
    const bad = rs.find((r) => !r.ok);
    if (bad) throw new Error(`${bad.why}。${bad.hint ? bad.hint + 'ください' : '書体を替えてお試しください'}`);
    widths.clear();
    await Promise.all(cuts.map((c) => { const e = imgEntry(c.photo); return e ? e.p : true; }));
  }
  const toBlob = (c) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('画像を作れませんでした'))), 'image/png'));
  function renderCut(cut, W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    drawCut(c.getContext('2d'), ed.state, cut, W, H);
    return c;
  }
  const baseName = () => U.safeName(ed.state.title, 'movie');
  async function saveOne() {
    const cut = curCut(), sc = screenOf(ed.state);
    await ready([cut]);
    const blob = await toBlob(renderCut(cut, sc.w, sc.h));
    const r = await U.saveImage(blob, `${baseName()}-${pad2(view.cur + 1)}.png`);
    if (r !== 'aborted') U.toast('画像を保存しました');
  }
  async function saveEach() {
    const s = ed.state, sc = screenOf(s);
    await ready(s.cuts);
    const files = [];
    for (let i = 0; i < s.cuts.length; i++) {
      const blob = await toBlob(renderCut(s.cuts[i], sc.w, sc.h));
      files.push(new File([blob], `${baseName()}-${pad2(i + 1)}.png`, { type: 'image/png' }));
    }
    await deliver(files);
  }
  /**
   * 縦に並べた 1 枚。幅は 1280 まで(スマホで読むには足り、粒子の入った PNG が重くなりすぎない)。
   * 大きすぎる画像は端末によって作れないので、面積と高さも抑えて縮める
   */
  async function saveStack() {
    const s = ed.state, sc = screenOf(s), n = s.cuts.length;
    await ready(s.cuts);
    const gap0 = { none: 0, thin: Math.round(Math.min(sc.w, sc.h) * 0.014), wide: Math.round(Math.min(sc.w, sc.h) * 0.045) }[s.stack.gap] || 0;
    const total = n * sc.h + (n - 1) * gap0, k = Math.min(1280 / sc.w, 1, 16000 / total, Math.sqrt(16e6 / (sc.w * total)));
    const W = Math.round(sc.w * k), H = Math.round(sc.h * k), gap = Math.round(gap0 * k);
    const c = document.createElement('canvas');
    c.width = W; c.height = n * H + (n - 1) * gap;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    s.cuts.forEach((cut, i) => g.drawImage(renderCut(cut, W, H), 0, i * (H + gap)));
    const r = await U.saveImage(await toBlob(c), `${baseName()}-cuts.png`);
    if (r !== 'aborted') U.toast(k < Math.min(1, 1280 / sc.w) - 0.001 ? `カットが多いので、幅 ${W} に縮めて保存しました` : '画像を保存しました');
  }
  /** 何枚かの保存。スマホは共有シート(押してから時間がたつと断られるので、そのときは押し直してもらう)、パソコンは 1 枚ずつダウンロード */
  async function deliver(files) {
    const canShare = U.isTouch() && navigator.canShare && navigator.canShare({ files });
    if (canShare) {
      try { await navigator.share({ files }); return; } catch (e) {
        if (e && e.name === 'AbortError') return;
        if (e && e.name === 'NotAllowedError') {
          const ctl = U.openDialog({ title: 'まとめて保存', content: h('div.modal-body',
            h('p.modal-lead', `${files.length} 枚の画像ができました。下のボタンを押すと、保存先を選べます。`),
            h('div.modal-foot', h('button.btn.btn-primary', { type: 'button', onclick: async () => { ctl.close(); try { await navigator.share({ files }); } catch (er) { /* 閉じた */ } } }, icon('share', 16), '保存する'))) });
          return;
        }
      }
    }
    for (let i = 0; i < files.length; i++) {
      U.downloadBlob(files[i], files[i].name);
      if (i < files.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    U.toast(`${files.length} 枚を保存しました`);
  }

  /* ================================================================ talklog から選ぶ(読むだけ。保存しない) */
  const logIn = $('logIn');
  logIn.addEventListener('change', async () => {
    const f = logIn.files[0];
    logIn.value = '';
    if (!f) return;
    try { LOG = buildLog(parseLog(await f.text(), f.name)); renderPanel(); showLog(); }
    catch (e) { U.toast(e.message || 'ログを読み込めませんでした', 'error'); }
  });
  function openLog() { if (LOG) showLog(); else logIn.click(); }
  /** talklog の書き出し(HTML/JSON)を読む。talklog.js の parseLog と同じ決まり */
  function parseLog(text, name) {
    let data = null;
    const t = text.trim();
    if (t.startsWith('{')) data = JSON.parse(t);
    else {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const node = doc.getElementById('talklog-data') || doc.getElementById('chatlog-data');
      if (!node) throw new Error('トークのデータが見つかりませんでした。talklog で書き出したファイルを選んでください');
      data = JSON.parse(node.textContent);
    }
    const str = (v) => (v == null ? '' : String(v));
    if (Array.isArray(data.items)) {
      return { title: str(data.title) || name, items: data.items.map((x) => ({ kind: ['speech', 'narration', 'info'].includes(x.kind) ? x.kind : 'speech', name: str(x.name), right: !!x.right, body: str(x.body) })) };
    }
    if (Array.isArray(data.turns)) {
      return { title: str(data.title) || name, items: data.turns.map((x) => { const narr = x.name === '地の文'; return { kind: x.kind === 'info' ? 'info' : narr ? 'narration' : 'speech', name: narr ? '' : str(x.name), right: x.who === '自分', body: str(x.body) }; }) };
    }
    throw new Error('読み取れない形式のファイルです');
  }
  /** 発言を行に分ける(talklog のビューアと同じく改行で。インフォボックスは除く)。番号は全体の通し番号 */
  function buildLog(log) {
    const lines = [], names = new Map();
    let no = 0;
    log.items.forEach((x) => {
      if (x.kind === 'info') return;
      const name = x.kind === 'narration' ? '' : (x.name || (x.right ? 'あなた' : '相手'));
      x.body.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
        no += 1;
        const act = isAct(l), nar = x.kind === 'narration';
        lines.push({ no, name, text: cleanLine(l), act, nar });
        if (!act && !nar) names.set(name, (names.get(name) || 0) + 1);
      });
    });
    return { title: log.title, lines, names: [...names.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k) };
  }
  const logView = { q: '', who: '', all: false, from: 0, limit: 200, picked: new Set() };
  function showLog() {
    const st = logView, n2 = clamp(Math.round(num(ed.state.sub.n, 16)), 6, 30) * 2;
    const q = h('input', { type: 'search', value: st.q, placeholder: '言葉で探す', 'aria-label': '言葉で探す' });
    const who = h('select', { 'aria-label': '話者で絞る' }, h('option', { value: '' }, 'すべての話者'), LOG.names.map((k) => h('option', { value: k, selected: k === st.who }, k)));
    const all = h('input', { type: 'checkbox', checked: st.all });
    const from = h('input', { type: 'number', min: 1, max: LOG.lines.length, value: st.from || '', placeholder: '番号', 'aria-label': 'この番号から見る' });
    const count = h('span.hint'), list = h('div.mov-log-list'), more = h('div.mov-log-more');
    const pickBtn = h('button.btn.btn-primary', { type: 'button' });
    const filtered = () => {
      const nq = U.norm(st.q);
      return LOG.lines.filter((l) => (st.all || (!l.act && !l.nar)) && (!st.who || l.name === st.who) && (!st.from || l.no >= st.from) && (!nq || U.norm(l.text + ' ' + l.name).includes(nq)));
    };
    const syncPick = () => { pickBtn.disabled = !st.picked.size; pickBtn.replaceChildren(icon('plus', 16), st.picked.size ? `選んだ ${st.picked.size} 行でカットを作る` : '行を選ぶとカットを作れます'); };
    const row = (l) => {
      const len = Array.from(l.text.replace(/\s/g, '')).length, long = len > n2;
      const cb = h('input', { type: 'checkbox', checked: st.picked.has(l.no), 'aria-label': `${l.no} 番を選ぶ` });
      cb.addEventListener('change', () => { if (cb.checked) st.picked.add(l.no); else st.picked.delete(l.no); syncPick(); });
      return h('div.mov-log-row' + (l.act || l.nar ? '.is-act' : ''),
        h('label.mov-log-pick', cb, h('span.mov-log-no', '#' + l.no)),
        h('div.mov-log-body', l.name && h('b', l.name), h('p', l.text)),
        h('div.mov-log-side',
          h('span.mov-log-len' + (long ? '.is-long' : ''), long ? `${len} 字・長い` : `${len} 字`),
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => useLine(l), title: 'いまのカットの字幕をこの行にします' }, 'このカットに'),
          !!(st.q || st.who || st.from) && h('button.btn.btn-ghost.btn-sm', { type: 'button', title: 'この行の前後を見ます', onclick: () => { st.q = ''; st.who = ''; st.from = Math.max(1, l.no - 6); q.value = ''; who.value = ''; from.value = st.from; st.limit = 200; draw(); } }, '前後')));
    };
    function draw() {
      const items = filtered();
      count.textContent = `${items.length} 行（全 ${LOG.lines.length} 行）`;
      list.replaceChildren(...items.slice(0, st.limit).map(row));
      if (!items.length) list.append(h('p.hint.center', '当てはまる行がありません。'));
      more.replaceChildren(items.length > st.limit ? h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { st.limit += 200; draw(); } }, `さらに表示（残り ${items.length - st.limit} 行）`) : '');
      U.hydrateIcons(list);
    }
    let qt = 0;
    q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { st.q = q.value.trim(); st.limit = 200; draw(); }, 200); });
    who.addEventListener('change', () => { st.who = who.value; st.limit = 200; draw(); });
    all.addEventListener('change', () => { st.all = all.checked; draw(); });
    from.addEventListener('change', () => { st.from = clamp(Math.round(num(from.value, 0)), 0, LOG.lines.length); st.limit = 200; draw(); });
    pickBtn.addEventListener('click', () => { makeCuts(); ctl.close(); });
    syncPick();
    const ctl = U.openDialog({
      title: 'talklog から選ぶ', wide: true,
      content: h('div.modal-body.mov-log',
        h('p.modal-lead', `${LOG.title}。ログはこのページで読むだけで、保存も送信もしません。`),
        h('div.mov-log-tools', q, who, from,
          h('label.check', all, '動作の行と地の文も出す'),
          h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { ctl.close(); logIn.click(); } }, icon('upload', 15), '別のログを開く')),
        count, list, more,
        h('div.modal-foot', h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, '閉じる'), pickBtn))
    });
    ctl.dlg.classList.add('mov-log-dlg');
    draw();
  }
  function useLine(l) {
    const cut = curCut();
    Object.assign(cut, { ja: l.text, who: l.name, en: '' });
    ed.dirty();
    renderPanel();
    invalidate();
    document.querySelector('dialog.mov-log-dlg') && document.querySelector('dialog.mov-log-dlg').close();
    U.toast(`カット ${view.cur + 1} の字幕にしました`);
  }
  /** 選んだ行を順にカットにする。いまのカットが空なら、1 行目はいまのカットに入れる */
  function makeCuts() {
    const picked = LOG.lines.filter((l) => logView.picked.has(l.no));
    if (!picked.length) return;
    let first = true, made = 0;
    picked.forEach((l) => {
      const cur = curCut();
      if (first && !String(cur.ja || '').trim() && !String(cur.en || '').trim()) Object.assign(cur, { ja: l.text, who: l.name, en: '' });
      else addCut({ ja: l.text, who: l.name, en: '' });
      first = false;
      made += 1;
    });
    logView.picked.clear();
    ed.dirty();
    renderStrip();
    renderPanel();
    U.toast(`${made} 行をカットにしました`);
  }

  /* ================================================================ はじめ */
  Kit.mountBar('usermovie');
  document.body.append(Kit.footer());
  $('help').append(Ed.help('usermovie', [
    '写真を選ぶと、映画の画面のように黒帯と字幕を重ねます。写真はドラッグで動かせ、ホイールかピンチで拡大できます。',
    '字幕は打ち込むか、talklog で保存したトークから選びます。ログはこのページで読むだけで、保存も送信もしません。',
    '長い字幕は 2 行に自動で折り返します。字幕の欄で改行すると、その位置で折り返します。',
    'カットを足すと、1 枚ずつ保存できるほか、縦に並べた 1 枚にして会話の流れを見せられます。'
  ]));
  U.hydrateIcons(document);
  // 確かめ用: canvas(i) = カット i を書き出しの大きさで描いた canvas(書体と写真を待つ)
  window.__usermovie = {
    ed, view, wrapJa, jaLines, splitText, cleanLine, punctToSpace, layout: () => last, geom,
    canvas: async (i, W, H) => { const s = ed.state, c = s.cuts[i == null ? view.cur : i], sc = screenOf(s); await ready([c]); return renderCut(c, W || sc.w, H || sc.h); },
    refresh: () => { renderAll(); },
    loadLog: (text, name) => { LOG = buildLog(parseLog(text, name)); renderPanel(); showLog(); }
  };
  ed.load().then(() => { renderAll(); });
})();
