/*
 * 紹介文のマークダウンを、zeta の詳細ページに近い見え方で組む (DOM を組むだけで HTML の文字列は使わない)。
 * 使える書き方: # 見出し / **太字** / *斜体* / ~~取り消し線~~ / `コード` / ``` コードブロック / > 引用 / - ・1. 箇条書き /
 * --- 区切り線 / [文字](URL) とURLのリンク / {{user}} {{char}}。
 * zeta の詳細ページ(2026-11-02 に確かめた)は white-space: pre-wrap で、改行はそのまま改行になる。
 * 表(| 項目 | 内容 |)は zeta では表にならず字のまま出る(2026-11-02 にユーザーが zeta で確かめた)ので、組まずにふつうの段落にする。
 * 画像の記法 ![](URL) は zeta では何も表示されない(同日ユーザーが確かめた)ので出さず、img に数える。zeta の画像は文と別のまとまりで入れる。
 * 太字・斜体の始まりと終わりは CommonMark の決まり(記号の隣では効かないことがある)に合わせ、効かなかった ** は warn に数える
 */
(function () {
  'use strict';
  const { h } = U;

  const nl = (s) => String(s || '').replace(/\r\n?/g, '\n');
  const SPACE = /\s/u;
  const PUNCT = /[\p{P}\p{S}]/u;

  // 行の種類
  const RE_HEAD = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*#*[ \t]*$/;
  const RE_QUOTE = /^ {0,3}> ?(.*)$/;
  const RE_HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  const RE_UL = /^ {0,3}[-*+][ \t]+(.*)$/;
  const RE_OL = /^ {0,3}(\d{1,9})[.)][ \t]+(.*)$/;
  const RE_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  const RE_INDENT = /^(?: {4}|\t)/;
  const startsBlock = (l) => RE_HEAD.test(l) || RE_QUOTE.test(l) || RE_HR.test(l) || RE_UL.test(l) || RE_OL.test(l) || RE_FENCE.test(l);

  /** 文 → DocumentFragment。stats.warn = 効かなかった ** の数 */
  function render(src, stats) {
    stats = stats || { warn: 0 };
    const frag = document.createDocumentFragment();
    frag.append(...blocks(nl(src).split('\n'), stats));
    return frag;
  }

  function blocks(lines, stats) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      let m;
      if (!l.trim()) { i++; continue; }
      if ((m = RE_FENCE.exec(l)) && !(m[1][0] === '`' && m[2].includes('`'))) {
        // ``` から同じ記号の同じ長さ以上の行まで(閉じが無ければ最後まで)
        const mark = m[1];
        const body = [];
        i++;
        while (i < lines.length && !new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}[ \\t]*$`).test(lines[i])) body.push(lines[i++]);
        i++;
        out.push(h('pre.md-pre', body.join('\n')));
        continue;
      }
      if (RE_INDENT.test(l)) {
        // 4つ以上の空白で始まる行はコードブロック (空行をはさんでも続く)
        const body = [];
        while (i < lines.length && (RE_INDENT.test(lines[i]) || !lines[i].trim())) body.push(lines[i++].replace(RE_INDENT, ''));
        while (body.length && !body[body.length - 1].trim()) body.pop();
        out.push(h('pre.md-pre', body.join('\n')));
        continue;
      }
      if (RE_HR.test(l)) { out.push(h('hr.md-hr')); i++; continue; }
      if ((m = RE_HEAD.exec(l))) {
        const lv = Math.min(m[1].length, 3);
        out.push(h(`p.md-h.md-h${lv}`, inline(m[2] || '', stats)));
        i++;
        continue;
      }
      if (RE_QUOTE.test(l)) {
        const inner = [];
        while (i < lines.length && (m = RE_QUOTE.exec(lines[i]))) { inner.push(m[1]); i++; }
        out.push(h('blockquote.md-quote', h('span.md-bar'), h('div.md-qbody', blocks(inner, stats))));
        continue;
      }
      if (RE_UL.test(l) || RE_OL.test(l)) {
        const ordered = !RE_UL.test(l);
        const re = ordered ? RE_OL : RE_UL;
        const items = [];
        const first = ordered ? Number(RE_OL.exec(l)[1]) : 1;
        while (i < lines.length && (m = re.exec(lines[i]))) { items.push(ordered ? m[2] : m[1]); i++; }
        out.push(h(ordered ? 'ol.md-list' : 'ul.md-list', { start: ordered && first !== 1 ? first : null },
          items.map((t) => h('li', inline(t, stats)))));
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i]))) { para.push(lines[i].replace(/^[ \t]+/, '')); i++; }
      out.push(h('p.md-p', inline(para.join('\n').replace(/[ \t]+$/, ''), stats)));
    }
    return out;
  }

  /* ---------- 行の中 ---------- */
  const isSp = (c) => !c || SPACE.test(c);      // 端も空白と同じに扱う
  const isPu = (c) => !!c && PUNCT.test(c);
  /** CommonMark の left-flanking / right-flanking (* の連なり) */
  const canOpen = (prev, next) => !isSp(next) && (!isPu(next) || isSp(prev) || isPu(prev));
  const canClose = (prev, next) => !isSp(prev) && (!isPu(prev) || isSp(next) || isPu(next));

  /** s[i] から始まる mark(** か * か ~~) の対になる閉じの位置。無ければ -1 */
  function findClose(s, i, mark) {
    const flank = mark !== '~~';
    for (let j = s.indexOf(mark, i + mark.length); j >= 0; j = s.indexOf(mark, j + 1)) {
      if (j === i + mark.length) continue;                         // 中身が空
      if (mark === '*' && (s[j - 1] === '*' || s[j + 1] === '*')) continue;   // ** の片割れ
      if (s[j - 1] === '\\') continue;
      if (!flank) { if (!isSp(s[j - 1])) return j; continue; }
      if (canClose(s[j - 1], s[j + mark.length])) return j;
    }
    return -1;
  }

  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : null);
  /** リンク。中の字は、URLだけのリンクならそのまま、[文字](URL) なら太字などを組む(リンクの中にリンクは作らない) */
  const link = (text, url, stats, raw) => {
    const href = safeUrl(url);
    const body = raw ? text : inline(text, stats, true);
    return href ? h('a.md-link', { href, target: '_blank', rel: 'noopener noreferrer' }, body) : h('span.md-link', body);
  };

  function inline(s, stats, noLink) {
    const out = [];
    let buf = '';
    const push = (node) => { if (buf) { out.push(buf); buf = ''; } out.push(node); };
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      let m;
      if (c === '\\' && i + 1 < s.length && /[!-\/:-@\[-`{-~]/.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
      if (c === '`') {
        // 同じ数の ` で閉じる。中の改行は空白にし、両端の空白は1つずつ外す
        const run = /^`+/.exec(s.slice(i))[0];
        const re = new RegExp(`(?<!\`)${run}(?!\`)`, 'g');
        re.lastIndex = i + run.length;
        const end = re.exec(s);
        if (end) {
          let code = s.slice(i + run.length, end.index).replace(/\n/g, ' ');
          if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
          push(h('code.md-code', code));
          i = end.index + run.length;
          continue;
        }
        buf += run;
        i += run.length;
        continue;
      }
      if (c === '{' && s[i + 1] === '{') {
        m = /^\{\{\s*(user|char)\s*\}\}/i.exec(s.slice(i, i + 16));
        if (m) { push(h('span.md-var', `{{${m[1]}}}`)); i += m[0].length; continue; }
      }
      if (c === '!' && s[i + 1] === '[' && (m = /^!\[([^\]\n]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(s.slice(i)))) {
        // 画像の記法。zeta では何も表示されない
        if (stats) stats.img = (stats.img || 0) + 1;
        i += m[0].length;
        continue;
      }
      if (!noLink && c === '[' && (m = /^\[([^\]\n]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(s.slice(i)))) {
        push(link(m[1], m[2], stats));
        i += m[0].length;
        continue;
      }
      if (!noLink && c === '<' && (m = /^<(https?:\/\/[^\s<>]+)>/i.exec(s.slice(i)))) { push(link(m[1], m[1], stats, true)); i += m[0].length; continue; }
      if (!noLink && (c === 'h' || c === 'H') && !/[A-Za-z0-9]/.test(s[i - 1] || '') && (m = /^https?:\/\/[^\s<>「」『』（）、。]+/i.exec(s.slice(i)))) {
        const url = m[0].replace(/[.,:;!?'")\]]+$/, '');
        push(link(url, url, stats, true));
        i += url.length;
        continue;
      }
      if (c === '~' && s[i + 1] === '~' && !isSp(s[i + 2])) {
        const j = findClose(s, i, '~~');
        if (j > 0) { push(h('del', inline(s.slice(i + 2, j), stats, noLink))); i = j + 2; continue; }
      }
      if (c === '*' && s.startsWith('***', i) && s[i + 3] !== '*' && canOpen(s[i - 1], s[i + 3])) {
        const j = findClose(s, i + 1, '**');   // ***太字の斜体***
        if (j > 0 && s[j + 2] === '*' && s[j - 1] !== '*') {
          push(h('strong', h('em', inline(s.slice(i + 3, j), stats, noLink))));
          i = j + 3;
          continue;
        }
      }
      if (c === '*') {
        const mark = s[i + 1] === '*' ? '**' : '*';
        const prev = s[i - 1], next = s[i + mark.length];
        if (canOpen(prev, next) && !(mark === '**' && s[i + 2] === '*')) {
          const j = findClose(s, i, mark);
          if (j > 0) {
            push(h(mark === '**' ? 'strong' : 'em', inline(s.slice(i + mark.length, j), stats, noLink)));
            i = j + mark.length;
            continue;
          }
        }
        if (mark === '**') {
          // 対になる ** はあるのに、記号の隣で効かなかったもの
          const k = s.indexOf('**', i + 2);
          if (k > 0 && !s.slice(i + 2, k).includes('\n')) stats.warn++;
          buf += '**';
          i += 2;
          continue;
        }
      }
      buf += c;
      i++;
    }
    if (buf) out.push(buf);
    return out;
  }

  /** マークダウンにしない文 ({{user}} だけ色を付ける。改行は入れ物の pre-wrap で出す) */
  function plain(src) {
    return nl(src).split(/(\{\{\s*(?:user|char)\s*\}\})/i).filter(Boolean)
      .map((part) => (/^\{\{/.test(part) ? h('span.md-var', part.replace(/\s+/g, '')) : part));
  }

  window.MiniMd = { render, plain };
})();
