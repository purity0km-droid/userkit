/* usermovie — 映画のワンシーン。写真に映画の字幕と黒帯を重ねて、画像(PNG)か動画(MP4・GIF)で保存する。
   カット = 写真 1 枚と字幕 1 つ。カットを並べ、1 枚ずつか、縦に並べた 1 枚(会話の流れを見せる)で保存する。
   動画はカットを順に映して字幕を替えていく。最後にエンドロール(役と名前の行を流す)を付けられる。
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
  /**
   * 書体の指定。太字を選んでも太い字形がない書体(しねきゃぷしょんなど)は、字と同じ色の細い線を重ねて太く見せる(fake)。
   * italic = 斜体(英語の字幕。斜体の字形がない書体は、ブラウザが字を傾けて代わりにする)
   */
  function fontSpec(id, bold, italic) {
    const f = KitFonts.info(id), want = bold ? 700 : 400, w = KitFonts.nearest(f.weights, want), st = italic ? 'italic ' : '';
    return { id, w, fake: bold && w < 600, css: (px) => `${st}${w} ${Math.max(1, px).toFixed(2)}px ${KitFonts.stack(id)}` };
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
  /** 縦書きの 1 列の字を並べる(字幕とエンドロールで共用)。cx = 列の真ん中、top = 1 字目の上。返り値 { ops, y(最後の字の下), n(字の数) } */
  function vColumn(g, font, px, line, cx, top, track, fake) {
    const ops = [], tk = vTokens(line);
    let y = top;
    tk.forEach((k, i) => {
      const gap = i < tk.length - 1 ? track : 0;
      if (k.sp) { y += k.sp * px + gap; return; }
      if (k.run) {
        const L = measure(g, font, k.t);
        ops.push({ s: k.t, x: cx, y: y + L / 2, font, px, align: 'center', rot: Math.PI / 2, fake });
        y += L + gap;
        return;
      }
      const op = { s: k.t, x: cx, y: y + px / 2, font, px, align: 'center', fake };
      if (k.tcy) { const w = measure(g, font, k.t); if (w > px * 0.96) op.sx = (px * 0.96) / w; }
      else if (V_ROT.has(k.t)) op.rot = Math.PI / 2;
      else if (V_PUNCT.has(k.t)) { op.dx = px * 0.62; op.dy = -px * 0.6; }
      else if (V_SMALL.has(k.t)) { op.dx = px * 0.1; op.dy = -px * 0.1; }
      ops.push(op);
      y += px + gap;
    });
    return { ops, y, n: tk.length };
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
    const fJa = fontSpec(sub.jaFont, sub.bold), fEn = fontSpec(enFontId(sub), sub.bold, !!sub.italic);
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
        const cx = x0 - ci * pitch, col = vColumn(g, font, jaPx, line, cx, top, tr, fJa.fake);
        out.ops.push(...col.ops);
        out.boxes.push({ x: cx - jaPx * 0.68, y: top - jaPx * 0.3, w: jaPx * 1.36, h: col.y - top + jaPx * 0.6 - (col.n > 1 ? tr : 0) });
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
    if ((!b && !c && !sa && !te && !tl && !fd) || P.w < 1 || P.h < 1) return;
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
  /** 周辺減光と粒子(強さ 0〜100) */
  function filmFx(g, P, U, look) {
    const vg = clamp(num(look.vignette, 0), 0, 100) / 100;
    if (vg) {
      g.save();
      g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
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
    grainFx(g, P, U, look, 0);
  }
  /**
   * 粒子。細かさは画面の短い辺に合わせる(小さな画面では細かくなりすぎて見えにくい)。
   * 動画(MP4)では seed でコマごとに模様の位置をずらし、フィルムのように粒子を動かす
   */
  function grainFx(g, P, U, look, seed) {
    const gr = clamp(num(look.grain, 0), 0, 100) / 100;
    if (!gr) return;
    const pat = g.createPattern(noise(), 'repeat'), k = U / 1080;
    const ox = seed ? (seed * 97) % 256 : 0, oy = seed ? (seed * 61 + 131) % 256 : 0;
    if (pat.setTransform) pat.setTransform(new DOMMatrix([k, 0, 0, k, P.x - ox * k, P.y - oy * k]));
    g.save();
    g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = gr * 0.6;
    g.fillStyle = pat;
    g.fillRect(P.x, P.y, P.w, P.h);
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
    c = buildLayer(s, cut, W, H, s.look);
    layers.set(key, c);
    while (layers.size > 24) layers.delete(layers.keys().next().value);
    return c;
  }
  /** 映像の層を描く(覚えない)。動画は大きな絵を何枚も覚えないよう、これを直接使う。look = 色味(動画では粒子を外して渡すことがある) */
  function buildLayer(s, cut, W, H, look) {
    const e = imgEntry(cut.photo), ready = !!(e && e.ready);
    const c = document.createElement('canvas');
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
    grade(g, P, look);
    filmFx(g, P, G.U, look);
    return c;
  }
  /** カット 1 枚を g に W×H で描く。返り値は字幕の配置 */
  function drawCut(g, s, cut, W, H) {
    g.drawImage(pictureLayer(s, cut, W, H), 0, 0);
    const L = layoutSubs(g, s, cut, geom(s, W, H));
    paintSubs(g, L, s.sub);
    return L;
  }

  /* ================================================================ エンドロール
     行は 左(役・見出し)と右(名前)の 2 つの欄。左だけなら見出し、右だけなら名前を 1 行、両方なら役と名前を左右(縦書きは上下)に並べ、どちらも空なら間。
     横書きは下から上へ、縦書きは左から右へ流れる(縦書きは右の列から読むので、後の行ほど左に並び、左から入ってくる)。
     字は映像の四角の中だけに出す。地は黒 */
  const ROLL_SPEEDS = { slow: { label: 'ゆっくり', v: 0.1 }, normal: { label: 'ふつう', v: 0.14 }, fast: { label: 'はやめ', v: 0.2 } };   // 1 秒に進む長さ(映像の高さに対する割合)
  const ROLL_FIN = [0.3, 0.7, 1.8, 0.9];   // 最後に出す字: 間・出る・止まる・消える(秒)
  const rollFontId = (s) => (s.sub.lang === 'en' ? enFontId(s.sub) : s.sub.jaFont);
  const rollText = (s) => [s.roll.title, s.roll.fin].concat(s.roll.rows.map((r) => (r.a || '') + (r.b || ''))).join('');
  /** 話者の名前(出てくる順)から、キャストの下書き */
  function draftRows() {
    const names = [...new Set(ed.state.cuts.map((c) => String(c.who || '').trim()).filter(Boolean))];
    return [{ a: 'CAST', b: '' }].concat(names.map((n) => ({ a: '', b: n })));
  }
  /**
   * エンドロールの字を組む。k = 字の大きさの倍率(1 枚の絵に収めるときに縮める)。返り値 { ops, len(流れる向きの長さ) }。
   * 横書きの op の u は上の端からの距離(x はそのまま)、縦書きの op の u は右の端から左への距離(y はそのまま)
   */
  function rollLayout(g, s, G, k) {
    const R = s.roll, P = G.P, css = fontSpec(rollFontId(s), false).css, ops = [];
    const px = G.U * 0.046 * k, rp = px * 0.66, hp = px * 0.6, tp = px * 1.45;
    const C = { name: '#ffffff', role: 'rgba(255,255,255,.74)', head: 'rgba(255,255,255,.58)' };
    const rows = R.rows.map((r) => ({ a: String(r.a || '').trim(), b: String(r.b || '').trim() }));
    const title = String(R.title || '').trim();
    let u = 0;
    if (R.dir === 'v') {
      const top = P.y + P.h * 0.12, nameTop = P.y + P.h * 0.34, bottom = P.y + P.h * 0.9;
      const fit = (p, str, max) => { const L = vLength(g, css(p), p, str, 0); return L > max ? (p * max) / L : p; };
      const col = (str, p, color, y0, max, cu) => {
        const q = fit(p, str, max);
        vColumn(g, css(q), q, str, 0, y0, 0, false).ops.forEach((o) => ops.push(Object.assign(o, { u: cu, color })));
      };
      if (title) { col(title, tp, C.name, top, bottom - top, u + tp / 2); u += tp + px * 2; }
      rows.forEach((r) => {
        if (!r.a && !r.b) { u += px * 1.3; return; }
        if (!r.b) { if (u) u += px * 0.5; col(r.a, hp, C.head, top, bottom - top, u + px / 2); u += px * 1.9; return; }
        if (r.a) col(r.a, rp, C.role, top, nameTop - top - px * 0.5, u + px / 2);
        col(r.b, px, C.name, nameTop, bottom - nameTop, u + px / 2);
        u += px * 2;
      });
    } else {
      const cx = P.x + P.w / 2, gut = px * 0.75;
      const fit = (p, str, max) => { const w = measure(g, css(p), str); return w > max ? (p * max) / w : p; };
      const put = (str, p, color, x, align, cu) => ops.push({ s: str, x, u: cu, font: css(p), px: p, align, color });
      const spaced = (str, p, color, cu) => {   // 字間をあけた見出し(真ん中ぞろえ)。小文字の混じる英語は詰める
        const ch = Array.from(str), tr = /[a-z]/.test(str) ? 0.1 : 0.32, width = (q) => ch.reduce((t, c) => t + measure(g, css(q), c), 0) + q * tr * (ch.length - 1);
        const w0 = width(p);
        if (w0 > P.w * 0.9) p *= (P.w * 0.9) / w0;
        let x = cx - width(p) / 2;
        ch.forEach((c) => { put(c, p, color, x, 'left', cu); x += measure(g, css(p), c) + p * tr; });
      };
      if (title) { const p = fit(tp, title, P.w * 0.9); put(title, p, C.name, cx, 'center', u + p / 2); u += p + px * 2; }
      rows.forEach((r) => {
        if (!r.a && !r.b) { u += px * 1.3; return; }
        if (!r.b) { if (u) u += px * 0.6; spaced(r.a, hp, C.head, u + hp / 2); u += hp + px; return; }
        if (!r.a) { put(r.b, fit(px, r.b, P.w * 0.9), C.name, cx, 'center', u + px / 2); u += px * 1.75; return; }
        put(r.a, fit(rp, r.a, P.w * 0.42), C.role, cx - gut, 'right', u + px / 2);
        put(r.b, fit(px, r.b, P.w * 0.42), C.name, cx + gut, 'left', u + px / 2);
        u += px * 1.75;
      });
    }
    return { ops, len: ops.reduce((m, o) => Math.max(m, o.u + o.px * 0.6), 0) };
  }
  /** 組んだ字を描く。off = 流れた長さ(横書きは上へ、縦書きは右へ) */
  function paintRoll(g, s, G, L, off) {
    const P = G.P, v = s.roll.dir === 'v', base = v ? P.x + off : P.y + P.h - off;
    g.save();
    g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
    g.textBaseline = 'middle';
    for (const o of L.ops) {
      const x = v ? base - o.u : o.x, y = v ? o.y : base + o.u, m = o.px * 4;
      if (v ? x < P.x - m || x > P.x + P.w + m : y < P.y - m || y > P.y + P.h + m) continue;
      g.save();
      g.font = o.font;
      g.textAlign = o.align;
      g.fillStyle = o.color;
      g.translate(x, y);
      if (o.rot) g.rotate(o.rot);
      if (o.sx) g.scale(o.sx, 1);
      g.fillText(o.s, o.dx || 0, o.dy || 0);
      g.restore();
    }
    g.restore();
  }
  /** 最後に出す字(真ん中に横書きで) */
  function paintFin(g, s, G, text, alpha) {
    const P = G.P, css = fontSpec(rollFontId(s), false).css;
    let p = G.U * 0.065;
    const w = measure(g, css(p), text);
    if (w > P.w * 0.8) p *= (P.w * 0.8) / w;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = '#ffffff';
    g.font = css(p);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, P.x + P.w / 2, P.y + P.h / 2);
    g.restore();
  }
  /** エンドロールの時間割(画面の見本と動画で共用)。返り値 { G, L, sp(1 秒に進む画素), scroll(流れる秒数), fin, dur(全体の秒数) } */
  function rollPlan(g, s, W, H) {
    const G = geom(s, W, H), P = G.P, L = rollLayout(g, s, G, 1);
    const sp = (ROLL_SPEEDS[s.roll.speed] || ROLL_SPEEDS.normal).v * P.h;
    const scroll = L.ops.length ? ((s.roll.dir === 'v' ? P.w : P.h) + L.len) / sp : 0;
    const fin = String(s.roll.fin || '').trim();
    return { G, L, sp, scroll, fin, dur: scroll + (fin ? ROLL_FIN.reduce((a, b) => a + b, 0) : 0) + 0.4 };
  }
  /** エンドロールの t 秒目を描く */
  function drawRollAt(g, s, R, t) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, R.G.W, R.G.H);
    if (t < R.scroll) { paintRoll(g, s, R.G, R.L, t * R.sp); return; }
    if (!R.fin) return;
    const [w0, a, hold, z] = ROLL_FIN, u = t - R.scroll - w0;
    const al = u < 0 ? 0 : u < a ? u / a : u < a + hold ? 1 : u < a + hold + z ? 1 - (u - a - hold) / z : 0;
    if (al > 0) paintFin(g, s, R.G, R.fin, al);
  }
  /** エンドロールを 1 枚の絵に(すべての字を真ん中に収める。字がなければ最後に出す字) */
  function drawRollStill(g, s, W, H) {
    const G = geom(s, W, H), P = G.P, span = s.roll.dir === 'v' ? P.w : P.h;
    let L = rollLayout(g, s, G, 1);
    if (L.len > span * 0.86) L = rollLayout(g, s, G, (span * 0.86) / L.len);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (L.ops.length) paintRoll(g, s, G, L, (span + L.len) / 2);
    else if (String(s.roll.fin || '').trim()) paintFin(g, s, G, String(s.roll.fin).trim(), 1);
  }

  /* ================================================================ 保存の形(Ed) */
  const newCut = (o) => Object.assign({ id: U.uid(), photo: null, x: 0, y: 0, zoom: 1, ja: '', en: '', who: '', dir: 'h' }, o || {});
  function defaults() {
    return {
      title: '',
      screen: '16:9', picture: '2.39',
      sub: { lang: 'ja', jaFont: 'cinecaption', enFont: 'arimo', bold: false, italic: false, size: 5, track: 4, color: '#ffffff', edge: 'shadow', pos: 'in', vside: 'right', n: 16, punct: true, name: false },
      look: Object.assign({ preset: 'dusk', grain: 22, vignette: 30 }, LOOKS.dusk.v),
      stack: { gap: 'thin' },
      // エンドロール(rows = [{ a: 役・見出し, b: 名前 }]、dir = 'up' 横書き | 'v' 縦書き)と、動画の設定(形式はこの端末の localStorage)
      roll: { on: false, title: '', rows: [], dir: 'up', speed: 'normal', fin: 'FIN' },
      video: { pace: 'normal', trans: 'fade', push: true },
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
    const roll = Object.assign(d.roll, o.roll);
    roll.rows = Array.isArray(roll.rows) ? roll.rows.map((r) => ({ a: String((r && r.a) || ''), b: String((r && r.b) || '') })) : [];
    return Object.assign(d, o, {
      sub: Object.assign(d.sub, o.sub), look: Object.assign(d.look, o.look), stack: Object.assign(d.stack, o.stack),
      roll, video: Object.assign(d.video, o.video),
      photos: o.photos && typeof o.photos === 'object' ? o.photos : {}, cuts
    });
  }
  const cfg = { app: 'usermovie', version: 1, width: 1, defaults, migrate, render: () => h('div'), mount: h('div') };
  const ed = Ed.create(cfg);
  const baseSet = ed.set;
  ed.set = (p, v, o) => { baseSet(p, v); invalidate(); if (o && o.panel) renderPanel(); };
  ed.rerender = () => { view.cur = 0; view.roll = false; rollPlay = false; widths.clear(); layers.clear(); renderAll(); };

  /* ================================================================ 作業台 */
  const view = { cur: 0, roll: false };   // roll = エンドロールを選んでいる(保存しない)
  let LOG = null;   // 読み込んだ talklog { title, lines: [{ no, name, text, act, nar }], names }。保存しない
  const curCut = () => { const cs = ed.state.cuts; view.cur = clamp(view.cur, 0, cs.length - 1); return cs[view.cur]; };
  const cv = $('screen'), box = $('view'), drop = $('drop'), stage = $('stage');
  let raf = 0, last = null, changed = false;
  function invalidate() { changed = true; if (!raf) raf = requestAnimationFrame(paint); }
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
    const was = changed;
    changed = false;
    if (view.roll) { paintRollStage(was); return; }
    playBtn.hidden = true;
    const s = ed.state, cut = curCut(), g = cv.getContext('2d');
    last = drawCut(g, s, cut, cv.width, cv.height);
    const has = !!(cut.photo && s.photos[cut.photo]);
    drop.hidden = has;
    cv.classList.toggle('has-photo', has);
    updateMeta();
    scheduleThumbs();
    needFonts();
  }
  /* ---------------------------------------------------------------- エンドロールの見本(ふだんは全部を 1 枚に、ボタンで流して見せる) */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const playBtn = h('button.mov-play', { type: 'button', hidden: true });
  cv.parentElement.append(playBtn);
  let rollPlay = false, rollT0 = 0, rollKey = '', rollR = null;
  function syncPlay() {
    playBtn.replaceChildren(icon(rollPlay ? 'stop' : 'play', 14), rollPlay ? '止める' : '流してみる');
    playBtn.setAttribute('aria-pressed', String(rollPlay));
  }
  playBtn.addEventListener('click', () => { rollPlay = !rollPlay; rollT0 = performance.now(); syncPlay(); invalidate(); });
  syncPlay();
  function paintRollStage(was) {
    const s = ed.state, g = cv.getContext('2d'), W = cv.width, H = cv.height;
    drop.hidden = true;
    cv.classList.remove('has-photo');
    playBtn.hidden = reduceMotion.matches;
    if (rollPlay && !reduceMotion.matches) {
      const key = JSON.stringify([W, H, s.screen, s.picture, s.roll, s.sub.lang, s.sub.jaFont, s.sub.enFont, fontKey]);
      if (key !== rollKey || !rollR) { rollKey = key; rollR = rollPlan(g, s, W, H); }
      drawRollAt(g, s, rollR, ((performance.now() - rollT0) / 1000) % rollR.dur);
      raf = requestAnimationFrame(paint);
    } else drawRollStill(g, s, W, H);
    if (was) { scheduleThumbs(); needFonts(); }
  }

  /* ---------------------------------------------------------------- 書体を読む(使う字の分だけ。読めたら描き直す) */
  let fontKey = '', fontFail = false;
  function fontJobs(s) {
    const sub = s.sub, jobs = [], w = (id) => [fontSpec(id, sub.bold).w];
    const ja = s.cuts.map((c) => withName(c.ja || '', c.who, sub.name)).join('') + '（）あア漢', en = s.cuts.map((c) => (c.en || '') + (c.who || '')).join('') + 'Aa()';
    if (sub.lang !== 'en') jobs.push([sub.jaFont, w(sub.jaFont), ja, {}]);
    if (sub.lang !== 'ja') jobs.push([enFontId(sub), w(enFontId(sub)), en, { italic: !!sub.italic }]);
    if (s.roll.on) jobs.push([rollFontId(s), [fontSpec(rollFontId(s), false).w], rollText(s) + 'A', {}]);
    return jobs;
  }
  const loadJobs = (jobs) => Promise.all(jobs.map(([id, ws, t, o]) => KitFonts.load(id, ws, t, o)));
  function needFonts() {
    const jobs = fontJobs(ed.state), key = JSON.stringify(jobs);
    if (key === fontKey) return;
    fontKey = key;
    loadJobs(jobs).then((rs) => {
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
    if (view.roll) return;
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
    if (view.roll || !cut.photo) return;
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
    if (view.roll) return U.toast('写真を入れるカットを、下の並びから選んでください');
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
    const cs = ed.state.cuts, [tw, th] = thumbSize(), thumb = () => h('canvas', { width: tw * 2, height: th * 2, style: { width: tw + 'px', height: th + 'px' } });
    const on = ed.state.roll.on;
    strip.replaceChildren(...[
      h('div.mov-cuts', { role: 'list', 'aria-label': 'カットの並び' }, cs.map((c, i) => h('button.mov-cut', {
        type: 'button', role: 'listitem', 'aria-pressed': String(!view.roll && i === view.cur), 'aria-label': `カット ${i + 1}`, 'data-id': c.id,
        onclick: () => { if (view.roll || view.cur !== i) { view.cur = i; view.roll = false; rollPlay = false; syncPlay(); renderStrip(); renderPanel(); invalidate(); } }
      }, thumb(), h('span', String(i + 1))))),
      on && h('button.mov-cut.mov-rolltile', { type: 'button', 'aria-pressed': String(view.roll), 'aria-label': 'エンドロール', 'data-id': 'roll', onclick: selectRoll }, thumb(), h('span', 'END')),
      h('button.mov-add', { type: 'button', onclick: () => addCut(), title: 'いまのカットの後ろに、同じ写真のカットを足します' }, icon('plus', 16), h('span', 'カットを足す')),
      !on && h('button.mov-add', { type: 'button', onclick: addRoll, title: 'カットのあとに流すエンドロールを足します' }, icon('plus', 16), h('span', 'エンドロール'))].filter(Boolean));
    thumbKeys.clear();
    scheduleThumbs();
  }
  function scheduleThumbs() { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, 180); }
  function drawThumbs() {
    const s = ed.state, common = JSON.stringify([s.screen, s.picture, s.sub, s.look, fontKey]);
    strip.querySelectorAll('.mov-cut').forEach((b) => {
      if (b.dataset.id === 'roll') {
        const cvs = b.querySelector('canvas'), key = common + JSON.stringify(s.roll);
        if (thumbKeys.get('roll') !== key) { thumbKeys.set('roll', key); drawRollStill(cvs.getContext('2d'), s, cvs.width, cvs.height); }
        return;
      }
      const cut = s.cuts.find((c) => c.id === b.dataset.id), cvs = b.querySelector('canvas');
      if (!cut || !cvs) return;
      const e = imgEntry(cut.photo), key = common + JSON.stringify(cut) + (e && e.ready ? 1 : 0);
      if (thumbKeys.get(cut.id) === key) return;
      thumbKeys.set(cut.id, key);
      drawCut(cvs.getContext('2d'), s, cut, cvs.width, cvs.height);
    });
  }
  function addCut(o) {
    const cs = ed.state.cuts, cur = view.roll ? cs[cs.length - 1] : curCut();   // エンドロールを選んでいるときは最後のカットの後ろに
    const c = newCut(Object.assign({ photo: cur.photo, x: cur.x, y: cur.y, zoom: cur.zoom, dir: cur.dir, who: '' }, o || {}));
    ed.state.cuts.splice(view.roll ? ed.state.cuts.length : view.cur + 1, 0, c);
    view.cur = view.roll ? ed.state.cuts.length - 1 : view.cur + 1;
    view.roll = false;
    rollPlay = false;
    syncPlay();
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
  /* ---------------------------------------------------------------- エンドロールを選ぶ・足す・外す */
  function showRoll() { view.roll = true; rollPlay = false; syncPlay(); renderStrip(); renderPanel(); invalidate(); }
  function selectRoll() { if (!view.roll) showRoll(); }
  function addRoll() {
    const R = ed.state.roll;
    R.on = true;
    if (!R.rows.some((r) => r.a || r.b) && !String(R.title || '').trim()) R.rows = draftRows();   // 前に書いた字があれば、それを戻す
    ed.dirty();
    showRoll();
  }
  function removeRoll() {
    ed.state.roll.on = false;
    ed.dirty();
    view.roll = false;
    rollPlay = false;
    syncPlay();
    renderStrip();
    renderPanel();
    invalidate();
    U.toast('エンドロールを外しました。書いた字は残っていて、足し直すと戻ります');
  }
  const rowsChanged = () => { ed.dirty(); renderPanel(); invalidate(); };
  function addRow() {
    ed.state.roll.rows.push({ a: '', b: '' });
    rowsChanged();
    const ins = sideBody.querySelectorAll('.mov-roll-row:last-child input');
    if (ins[1]) ins[1].focus();
  }
  function moveRow(i, d) {
    const r = ed.state.roll.rows, j = i + d;
    if (j < 0 || j >= r.length) return;
    [r[i], r[j]] = [r[j], r[i]];
    rowsChanged();
  }
  function removeRow(i) { ed.state.roll.rows.splice(i, 1); rowsChanged(); }
  async function redraft() {
    const R = ed.state.roll;
    if (R.rows.some((r) => r.a || r.b) && !(await U.confirmDialog({ title: '話者から下書き', message: 'いまの行を消して、カットの話者の名前から作り直します。', okLabel: '作り直す' }))) return;
    R.rows = draftRows();
    rowsChanged();
    if (R.rows.length < 2) U.toast('話者の名前がまだないので、見出しだけを入れました');
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
  function fontButtons(ids, cur, sample, onPick, sameLabel, italic) {
    const g = h('div.mov-fonts', { role: 'group' });
    ids.forEach((id) => {
      const same = id === 'same', f = same ? null : KitFonts.info(id);
      const b = h('button', { type: 'button', 'aria-pressed': String(id === cur), title: same ? '和文と同じ書体で出します' : f.mood },
        h('b', { style: { fontFamily: same ? 'inherit' : KitFonts.stack(id), fontStyle: italic ? 'italic' : 'normal' } }, same ? sameLabel : sample),
        h('small', same ? '和文と同じ' : f.label));
      b.addEventListener('click', () => { g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); onPick(id); });
      if (!same) KitFonts.load(id, [400], sample, { italic: !!italic }).catch(() => {});
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

  function secRoll(s) {
    const R = s.roll, set = (k, v) => ed.set('roll.' + k, v);
    const text = (path, label, ph) => {
      const t = h('input', { type: 'text', value: ed.get(path) || '', 'aria-label': label, placeholder: ph || '' });
      t.addEventListener('input', () => ed.set(path, t.value));
      return t;
    };
    const n = R.rows.length;
    const rows = h('div.mov-roll-rows', { role: 'list', 'aria-label': '流す字の行' }, R.rows.map((r, i) => h('div.mov-roll-row', { role: 'listitem' },
      text(`roll.rows.${i}.a`, `${i + 1} 行目の役・見出し`, '役・見出し'),
      text(`roll.rows.${i}.b`, `${i + 1} 行目の名前`, '名前'),
      h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '上へ', 'aria-label': `${i + 1} 行目を上へ`, disabled: i === 0, onclick: () => moveRow(i, -1) }, icon('up', 15)),
      h('button.btn.btn-ghost.btn-icon', { type: 'button', title: '下へ', 'aria-label': `${i + 1} 行目を下へ`, disabled: i === n - 1, onclick: () => moveRow(i, 1) }, icon('down', 15)),
      h('button.btn.btn-ghost.btn-icon.danger', { type: 'button', title: 'この行を消す', 'aria-label': `${i + 1} 行目を消す`, onclick: () => removeRow(i) }, icon('close', 15)))));
    return h('section.mov-sec.mov-cutsec',
      h('div.mov-cuthead',
        h('h2', 'エンドロール'),
        h('span.kit-spacer'),
        h('button.btn.btn-ghost.btn-sm.danger', { type: 'button', onclick: removeRoll, title: 'エンドロールを外します。書いた字は残ります' }, icon('trash', 15), '外す')),
      field('題', text('roll.title', '題', '映画の題'), '空のままでもかまいません'),
      field('流す字', h('div.mov-col', rows,
        h('div.mov-row',
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: addRow }, icon('plus', 15), '行を足す'),
          h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: redraft, title: 'カットの話者の名前から、キャストの行を作り直します' }, icon('refresh', 15), '話者から下書き')),
        h('p.hint', '左だけ書いた行は見出しに、右だけ書いた行は名前になります。両方書くと役と名前を並べて出し、どちらも空の行は間になります。'))),
      field('流し方', seg('流し方', [['up', '横書きで上へ'], ['v', '縦書きで右へ']], R.dir === 'v' ? 'v' : 'up', (v) => set('dir', v))),
      field('速さ', seg('流れる速さ', Object.entries(ROLL_SPEEDS).map(([k, v]) => [k, v.label]), R.speed in ROLL_SPEEDS ? R.speed : 'normal', (v) => set('speed', v))),
      field('最後に出す字', text('roll.fin', '最後に出す字', '例: 終・FIN'), '流し終えたあと、真ん中に少しのあいだ出します'),
      h('p.hint', '動画で保存すると、カットのあとに流れます。画像で保存すると、すべての字を 1 枚に収めます。'));
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
      sub.lang !== 'ja' && field('英語の書体', fontButtons(EN_FONTS, sub.enFont, 'Ag', (id) => set('enFont', id, { panel: true }), '字A', !!sub.italic),
        enId !== sub.jaFont ? KitFonts.info(enId).mood : ''),
      h('div.grid-2',
        field('大きさ', range('字幕の大きさ', 3, 9, 0.1, num(sub.size, 5), (v) => v.toFixed(1), (v) => set('size', v))),
        field('字間', range('字間', 0, 30, 1, num(sub.track, 4), (v) => `${v}%`, (v) => set('track', v)))),
      h('div.mov-row', check('太字', !!sub.bold, (v) => set('bold', v)),
        sub.lang !== 'ja' && check('英語を斜体にする', !!sub.italic, (v) => set('italic', v, { panel: true }))),
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
    const total = s.cuts.length + (s.roll.on ? 1 : 0);
    return sec('保存',
      field('ファイルの名前', title),
      h('div.mov-col',
        btn('download', view.roll ? 'エンドロールを PNG で保存' : 'このカットを PNG で保存', saveOne, '.btn-primary'),
        total > 1 && btn('download', `${s.roll.on ? 'カットとエンドロール' : '全カット'}を 1 枚ずつ保存（${total} 枚）`, saveEach),
        total > 1 && h('div.mov-stackrow',
          btn('download', '縦に並べた 1 枚で保存', saveStack),
          seg('カットの間', [['none', '間なし'], ['thin', '細い間'], ['wide', '広い間']], s.stack.gap, (v) => ed.set('stack.gap', v))),
        h('button.btn.btn-sm.btn-outline', { type: 'button', onclick: videoDialog }, icon('video', 15), '動画で保存（MP4・GIF）')),
      h('p.hint', 'カットを縦に並べた 1 枚は、会話の流れを見せたいときに使います。動画ではカットを順に映して字幕を替えていきます。'));
  }

  function renderPanel() {
    const s = ed.state;
    if (view.roll && !s.roll.on) view.roll = false;
    meta = null;
    sideBody.replaceChildren(view.roll ? secRoll(s) : secCut(s), secSub(s), secScreen(s), secLook(s), secSave(s));
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
    const rs = await loadJobs(fontJobs(ed.state));
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
  function renderRoll(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    drawRollStill(c.getContext('2d'), ed.state, W, H);
    return c;
  }
  const baseName = () => U.safeName(ed.state.title, 'movie');
  async function saveOne() {
    const cut = curCut(), sc = screenOf(ed.state);
    if (view.roll) {
      await ready([]);
      const r = await U.saveImage(await toBlob(renderRoll(sc.w, sc.h)), `${baseName()}-end.png`);
      if (r !== 'aborted') U.toast('画像を保存しました');
      return;
    }
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
    if (s.roll.on) files.push(new File([await toBlob(renderRoll(sc.w, sc.h))], `${baseName()}-end.png`, { type: 'image/png' }));
    await deliver(files);
  }
  /**
   * 縦に並べた 1 枚。幅は 1280 まで(スマホで読むには足り、粒子の入った PNG が重くなりすぎない)。
   * 大きすぎる画像は端末によって作れないので、面積と高さも抑えて縮める
   */
  async function saveStack() {
    const s = ed.state, sc = screenOf(s), n = s.cuts.length + (s.roll.on ? 1 : 0);   // エンドロールは最後の 1 枚
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
    if (s.roll.on) g.drawImage(renderRoll(W, H), 0, s.cuts.length * (H + gap));
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

  /* ================================================================ 動画で保存(MP4・GIF。音なし)
     カットを順に映し、字幕を替えていく。映す長さは字幕の字数から決める(ふつうは日本語で 1 秒に 4 字)。
     つなぎは そのまま・暗転(黒を挟む)・重ねる(前のカットの上に次のカットが現れる。字幕は重なりの真ん中で替わる)。
     MP4 は写真をゆっくり寄せ、粒子をコマごとに動かす。GIF は軽くするため写真を動かさず、粒子も止める(字幕の替わる所しか変わらない)。
     エンドロールを付けたら最後に流す。1 コマずつ描くので、重い端末でもコマ落ちしない */
  const VIDEO = { mp4: { name: 'MP4', fps: 30, long: 1920 }, gif: { name: 'GIF', fps: 12, long: 640 } };
  const PACES = { slow: { label: 'ゆっくり', cps: 3.2, min: 2.6 }, normal: { label: 'ふつう', cps: 4, min: 2.2 }, fast: { label: 'はやめ', cps: 5.2, min: 1.8 } };
  const TRANS = { cut: 'そのまま', fade: '暗転', dissolve: '重ねる' };
  const FADE = 0.45, MIX = 0.6, PUSH = 0.05, GAP = 0.5;   // 黒から出る・黒へ消える秒数、重ねる秒数、寄せる割合、エンドロールの前の黒(秒)
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const charsOf = (t) => Array.from(String(t || '').replace(/\s/g, '')).length;
  const videoSize = (s, fmt) => { const sc = screenOf(s), k = Math.min(1, VIDEO[fmt].long / Math.max(sc.w, sc.h)); return { w: even(sc.w * k), h: even(sc.h * k) }; };
  /** カットを映す秒数(字幕を読む時間)。日本語は 1 秒に cps 字、英語はその 3.5 倍の字数 */
  function cutSec(s, cut, pace) {
    const P = PACES[pace] || PACES.normal;
    const ja = s.sub.lang !== 'en' ? charsOf(withName(String(cut.ja || '').trim(), cut.who, s.sub.name)) : 0;
    const en = s.sub.lang !== 'ja' ? String(cut.en || '').trim().length : 0;
    return Math.round(clamp(0.7 + Math.max(ja / P.cps, en / (P.cps * 3.5)), P.min, 9) * 10) / 10;
  }
  /**
   * 動画の時間割。segs = [{ cut, a, b(映る間), h0, h1(全部見える間), subA, subB(字幕の出る間), outBlack(終わりに黒へ消える) }]、
   * roll = { a(始まり), R(rollPlan) } か null、T = 全体の秒数
   */
  function timeline(s, v, g, W, H) {
    const tr = TRANS[v.trans] ? v.trans : 'fade', n = s.cuts.length, segs = [];
    let t = 0;
    s.cuts.forEach((cut, i) => {
      const d = cutSec(s, cut, v.pace), first = !i, last = i === n - 1;
      if (tr === 'cut') { segs.push({ cut, a: t, h0: t, h1: t + d, b: t + d, subA: t, subB: t + d }); t += d; return; }
      if (tr === 'fade') { segs.push({ cut, a: t, h0: t + FADE, h1: t + FADE + d, b: t + 2 * FADE + d, subA: t + FADE, subB: t + FADE + d, outBlack: true }); t += 2 * FADE + d; return; }
      const a = t, h0 = a + (first ? FADE : MIX), h1 = h0 + d;   // 重ねる: 最初は黒から、最後は黒へ
      segs.push({ cut, a, h0, h1, b: last ? h1 + FADE : h1 + MIX, subA: first ? h0 : a + MIX / 2, subB: last ? h1 : h1 + MIX / 2, outBlack: last });
      t = last ? h1 + FADE : h1;
    });
    let roll = null, T = t;
    if (s.roll.on) {
      const R = rollPlan(g, s, W, H);
      if (R.scroll || R.fin) { roll = { a: t + GAP, R }; T = roll.a + R.dur; }
    }
    return { segs, roll, T: Math.max(T, 0.5) };
  }
  /** 映像の層を、映像の四角の真ん中を中心に z 倍して重ねる(黒帯は動かさない) */
  function drawPicture(g, layer, P, z, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
    if (z > 1.0001) {
      const cx = P.x + P.w / 2, cy = P.y + P.h / 2;
      g.translate(cx, cy); g.scale(z, z); g.translate(-cx, -cy);
    }
    g.drawImage(layer, P.x, P.y, P.w, P.h, P.x, P.y, P.w, P.h);
    g.restore();
  }
  /** 動画のコマを作る準備。返り値の frame(i) が i コマ目を描いた canvas を返す(どの順に呼んでもよい) */
  async function videoFrames(fmt) {
    const s = ed.state, V = VIDEO[fmt], gif = fmt === 'gif', { w: W, h: H } = videoSize(s, fmt), fps = V.fps;
    await ready(s.cuts);
    const fc = document.createElement('canvas');
    fc.width = W; fc.height = H;
    const g = fc.getContext('2d', { willReadFrequently: gif });
    g.imageSmoothingQuality = 'high';
    const G = geom(s, W, H), P = G.P, push = !gif && s.video.push !== false;
    const moveGrain = !gif && num(s.look.grain, 0) > 0, look = moveGrain ? Object.assign({}, s.look, { grain: 0 }) : s.look;
    const TL = timeline(s, s.video, g, W, H), N = Math.max(1, Math.ceil(TL.T * fps));
    // 映っているカットの層と字幕の絵だけを持つ(大きな絵を何枚も覚えない)
    const pics = new Map(), subs = new Map();
    const picOf = (sg) => { if (!pics.has(sg)) pics.set(sg, buildLayer(s, sg.cut, W, H, look)); return pics.get(sg); };
    const subOf = (sg) => {
      if (!subs.has(sg)) {
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const cg = c.getContext('2d');
        paintSubs(cg, layoutSubs(cg, s, sg.cut, G), s.sub);
        subs.set(sg, c);
      }
      return subs.get(sg);
    };
    const frame = (i) => {
      const t = i / fps, vis = TL.segs.filter((sg) => t >= sg.a && t < sg.b), on = TL.segs.find((sg) => t >= sg.subA && t < sg.subB);
      [...pics.keys()].forEach((sg) => { if (!vis.includes(sg)) pics.delete(sg); });
      [...subs.keys()].forEach((sg) => { if (sg !== on) subs.delete(sg); });
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      vis.forEach((sg) => {
        const al = t < sg.h0 ? (t - sg.a) / (sg.h0 - sg.a) : sg.outBlack && t > sg.h1 ? 1 - (t - sg.h1) / (sg.b - sg.h1) : 1;
        drawPicture(g, picOf(sg), P, push ? 1 + (PUSH * (t - sg.a)) / (sg.b - sg.a) : 1, clamp(al, 0, 1));
      });
      if (moveGrain && vis.length) grainFx(g, P, G.U, s.look, i + 1);
      if (on) g.drawImage(subOf(on), 0, 0);
      if (TL.roll && t >= TL.roll.a) drawRollAt(g, s, TL.roll.R, t - TL.roll.a);
      return fc;
    };
    // GIF の色は、それぞれのカットの真ん中のコマ(12 個まで)とエンドロールのコマから選ぶ
    const step = Math.ceil(TL.segs.length / 12), sample = TL.segs.filter((_, j) => j % step === 0).map((sg) => Math.floor(((sg.h0 + sg.h1) / 2) * fps));
    if (TL.roll && TL.roll.R.scroll) sample.push(Math.floor((TL.roll.a + TL.roll.R.scroll / 2) * fps));
    return { frame, count: N, fps, width: W, height: H, sample, T: TL.T };
  }
  async function makeVideo(fmt, onProgress) {
    if (fmt === 'mp4' && !Mp4.supported()) throw new Error('このブラウザでは MP4 を作れません。GIF をお試しください');
    const f = await videoFrames(fmt);
    return (fmt === 'mp4' ? Mp4 : Gif).encode(Object.assign(f, { onProgress }));
  }
  const secText = (sec) => { const r = Math.max(1, Math.round(sec)); return r >= 60 ? `${Math.floor(r / 60)} 分 ${r % 60} 秒` : `${r} 秒`; };
  const VIDEO_KEY = 'userkit:usermovie:video';   // 前に選んだ形式(この端末だけ)
  /** 「動画で保存」の画面: 形式・カットの長さ・つなぎを選んで作り、見てから保存する */
  function videoDialog() {
    let fmt = 'mp4', busy = false, closed = false, url = '';
    try { if (localStorage.getItem(VIDEO_KEY) === 'gif') fmt = 'gif'; } catch (e) { /* 使えない環境 */ }
    if (!Mp4.supported()) fmt = 'gif';
    const s = ed.state, body = h('div.modal-body.mov-vd');
    const drop = () => { if (url) URL.revokeObjectURL(url); url = ''; };
    const ctl = U.openDialog({ title: '動画で保存', wide: true, content: body, onClose: () => { closed = true; drop(); } });
    const setV = (k, v) => { ed.set('video.' + k, v); choose(); };
    function choose() {
      drop();
      const v = s.video, V = VIDEO[fmt], z = videoSize(s, fmt), TL = timeline(s, v, document.createElement('canvas').getContext('2d'), z.w, z.h);
      const fmtSeg = h('div.seg', { role: 'group', 'aria-label': '形式' }, Object.entries(VIDEO).map(([k, x]) => h('button', {
        type: 'button', 'aria-pressed': String(fmt === k), disabled: k === 'mp4' && !Mp4.supported(),
        onclick: () => { fmt = k; try { localStorage.setItem(VIDEO_KEY, k); } catch (e) { /* 使えない環境 */ } choose(); }
      }, x.name)));
      const note = `大きさは ${z.w} × ${z.h} px、長さは約 ${secText(TL.T)}${TL.roll ? `（うちエンドロールが ${secText(TL.roll.R.dur)}）` : ''}で、1 秒に ${V.fps} コマです。`
        + (fmt === 'mp4' ? 'なめらかで、X などにそのまま載せられます。' : '色の数が少ないので少し粗くなりますが、どこでもそのまま動きます。');
      const go = h('button.btn.btn-primary', { type: 'button' }, icon('video'), '作る');
      go.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        go.disabled = true;
        go.textContent = '準備しています…';
        try {
          const blob = await makeVideo(fmt, (p) => { go.textContent = `作っています… ${Math.round(p * 100)}%`; });
          if (!closed) result(blob, TL.T);
        } catch (e) {
          console.error(e);
          U.toast(e.message || '動画を作れませんでした', 'error');
          if (!closed) choose();
        } finally { busy = false; }
      });
      body.replaceChildren(...[
        h('p.modal-lead', `${s.cuts.length} 個のカットを順に映し、字幕を替えていく動画を作ります。${TL.roll ? '最後にエンドロールを流します。' : ''}音は入りません。`),
        field('形式', fmtSeg),
        field('カットの長さ', seg('カットの長さ', Object.entries(PACES).map(([k, x]) => [k, x.label]), v.pace in PACES ? v.pace : 'normal', (x) => setV('pace', x)),
          '長さは字幕の字数に合わせて、カットごとに決めます'),
        field('つなぎ', seg('カットのつなぎ', Object.entries(TRANS), v.trans in TRANS ? v.trans : 'fade', (x) => setV('trans', x))),
        fmt === 'mp4' ? check('写真をゆっくり寄せる', v.push !== false, (x) => setV('push', x)) : h('p.hint', 'GIF では写真を動かしません。動かすとファイルがとても重くなるためです。'),
        h('p.hint', note),
        TL.T > 140 && h('p.hint.mov-warn', '2 分 20 秒を超える動画は、X に載せられないことがあります。'),
        fmt === 'gif' && TL.T > 45 && h('p.hint.mov-warn', '長い GIF は重くなります。長い動画は MP4 で作るのがおすすめです。'),
        !Mp4.supported() && h('p.hint', 'このブラウザでは MP4 を作れないため、GIF だけを選べます。'),
        h('div.modal-foot', h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, '閉じる'), go)].filter(Boolean));
      U.hydrateIcons(body);
    }
    function result(blob, T) {
      drop();
      url = URL.createObjectURL(blob);
      const ext = fmt, mb = (blob.size / 1048576).toFixed(1) + ' MB', info = h('p.hint'), name = `${baseName()}.${ext}`;
      let media;
      if (ext === 'mp4') {
        media = h('video.mov-vd-out', { src: url, autoplay: true, loop: true, playsinline: true, controls: true });
        media.muted = true;
        media.addEventListener('loadedmetadata', () => { info.textContent = `${media.videoWidth} × ${media.videoHeight} px・${media.duration.toFixed(1)} 秒・MP4・${mb}`; });
      } else {
        media = h('img.mov-vd-out', { src: url, alt: '作った GIF' });
        media.addEventListener('load', () => { info.textContent = `${media.naturalWidth} × ${media.naturalHeight} px・約 ${secText(T)}・GIF・${mb}`; });
      }
      body.replaceChildren(media, info, h('div.modal-foot',
        h('button.btn.btn-outline', { type: 'button', onclick: choose }, '作り直す'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => U.saveImage(blob, name) }, icon('download'), '保存する')));
      U.hydrateIcons(body);
    }
    choose();
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
    'カットを足すと、1 枚ずつ保存できるほか、縦に並べた 1 枚にして会話の流れを見せられます。',
    '「動画で保存」では、カットを順に映して字幕を替えていく動画を、MP4 か GIF で作れます。音は入りません。',
    'カットの並びの「エンドロール」を押すと、最後に役と名前を流せます。話者の名前から下書きを作ります。'
  ]));
  U.hydrateIcons(document);
  // 確かめ用: canvas(i) = カット i を書き出しの大きさで描いた canvas(書体と写真を待つ)
  window.__usermovie = {
    ed, view, wrapJa, jaLines, splitText, cleanLine, punctToSpace, layout: () => last, geom,
    canvas: async (i, W, H) => { const s = ed.state, c = s.cuts[i == null ? view.cur : i], sc = screenOf(s); await ready([c]); return renderCut(c, W || sc.w, H || sc.h); },
    refresh: () => { renderAll(); },
    // 動画: plan(fmt) = 時間割、frames(fmt) = videoFrames の結果(frame(i) で i コマ目)、make(fmt) = Blob
    plan: (fmt) => { const z = videoSize(ed.state, fmt || 'mp4'); return timeline(ed.state, ed.state.video, document.createElement('canvas').getContext('2d'), z.w, z.h); },
    frames: (fmt) => videoFrames(fmt || 'mp4'), make: (fmt, onProgress) => makeVideo(fmt || 'mp4', onProgress), cutSec,
    roll: (W, H) => renderRoll(W || screenOf(ed.state).w, H || screenOf(ed.state).h),
    loadLog: (text, name) => { LOG = buildLog(parseLog(text, name)); renderPanel(); showLog(); }
  };
  ed.load().then(() => { renderAll(); });
})();
