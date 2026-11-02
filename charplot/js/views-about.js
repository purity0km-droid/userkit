/* 紹介のタブ: カバー・簡単な紹介・ハッシュタグ・紹介文(マークダウン)を書いて、zeta の詳細ページに近い見え方で確かめる */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};
  const ui = () => Views.ui;
  const L = Store.LIMIT;

  /* ------------------------------------------------ ハッシュタグ */
  function tagsEditor(p, save) {
    const max = Store.MAX.tags;
    const box = h('div.tags-edit');
    const count = h('span.pf-count');
    const input = h('input', { type: 'text', placeholder: 'タグを入れて Enter', autocomplete: 'off', 'aria-label': 'ハッシュタグを足す' });
    const addTags = (text) => {
      const list = [...new Set(String(text).split(/[\s,、#＃]+/).map((t) => t.trim()).filter((t) => t && !p.tags.includes(t)))];
      if (!list.length) return 0;
      const room = max - p.tags.length;
      if (room <= 0) { U.toast(`ハッシュタグは${max}個までです`, 'error'); return 0; }
      if (list.length > room) U.toast(`ハッシュタグは${max}個までなので、${room}個だけ入れます`);
      p.tags.push(...list.slice(0, room));
      save();
      draw();
      return list.length;
    };
    const draw = () => {
      const full = p.tags.length >= max;
      count.textContent = `${p.tags.length} / ${max}`;
      count.classList.toggle('over', p.tags.length > max);
      input.disabled = full;
      input.placeholder = full ? '' : 'タグを入れて Enter';
      box.replaceChildren(
        ...p.tags.map((t, i) => h('span.tag-chip', '#' + t,
          h('button', { type: 'button', title: 'このタグを外す', 'aria-label': `#${t} を外す`, onclick: () => { p.tags.splice(i, 1); save(); draw(); input.focus(); } }, icon('close', 13)))),
        input);
    };
    input.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
        e.preventDefault();
        if (addTags(input.value)) input.value = '';
      } else if (e.key === 'Backspace' && !input.value && p.tags.length) {
        p.tags.pop(); save(); draw(); input.focus();
      }
    });
    input.addEventListener('paste', (e) => {
      const t = e.clipboardData && e.clipboardData.getData('text');
      if (t && /[\s#＃,、]/.test(t.trim())) { e.preventDefault(); addTags(t); }
    });
    input.addEventListener('blur', () => { if (input.value.trim() && addTags(input.value)) input.value = ''; });
    draw();
    return h('div.pf', h('div.pf-head', h('label', 'ハッシュタグ', h('small', '#をつけると見つけてもらいやすくなります')),
      count, ui().copyBtn(() => p.tags.map((t) => '#' + t).join(' '), 'タグをまとめてコピー')), box);
  }

  /* ------------------------------------------------ 書き方のボタン (最後に触った紹介文の欄に効く) */
  function mdTools(getTa) {
    const apply = (fn) => {
      const ta = getTa();
      if (!ta) return U.toast('先に紹介文の欄を押してください', 'error');
      const { selectionStart: a, selectionEnd: b, value: v } = ta;
      const r = fn(v, a, b);
      ta.value = r.value;
      ta.focus();
      ta.setSelectionRange(r.a, r.b);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const wrap = (mark, fill) => apply((v, a, b) => {
      const t = v.slice(a, b) || fill;
      return { value: v.slice(0, a) + mark + t + mark + v.slice(b), a: a + mark.length, b: a + mark.length + t.length };
    });
    /** 選んだ行(なければカーソルの行)の頭に付ける */
    const prefix = (mark) => apply((v, a, b) => {
      const s = v.lastIndexOf('\n', a - 1) + 1;
      const e = v.indexOf('\n', b); const end = e < 0 ? v.length : e;
      const lines = v.slice(s, end).split('\n').map((l) => mark + l.replace(/^(#{1,3} |> )/, ''));
      const t = lines.join('\n');
      return { value: v.slice(0, s) + t + v.slice(end), a: s, b: s + t.length };
    });
    const insert = (text) => apply((v, a, b) => ({ value: v.slice(0, a) + text + v.slice(b), a: a + text.length, b: a + text.length }));
    /** 選んだ所を ``` の行ではさむ (選んでいなければ空のコードブロックを入れる) */
    const fence = () => apply((v, a, b) => {
      const t = v.slice(a, b) || 'コード';
      const before = a && v[a - 1] !== '\n' ? '\n' : '';
      const after = v[b] && v[b] !== '\n' ? '\n' : '';
      const out = `${before}\`\`\`\n${t}\n\`\`\`${after}`;
      const start = a + before.length + 4;
      return { value: v.slice(0, a) + out + v.slice(b), a: start, b: start + t.length };
    });
    const linkIt = () => apply((v, a, b) => {
      const t = v.slice(a, b) || 'リンクの文字';
      const out = `[${t}](https://)`;
      return { value: v.slice(0, a) + out + v.slice(b), a: a + t.length + 3, b: a + t.length + 11 };
    });
    // 記法の一覧 (選ぶ欄に並べる順)
    const SYNTAX = [
      ['h1', '大見出し', '# 文字', () => prefix('# ')],
      ['h2', '中見出し', '## 文字', () => prefix('## ')],
      ['h3', '小見出し', '### 文字', () => prefix('### ')],
      ['b', '太字', '**文字**', () => wrap('**', '太字')],
      ['i', '斜体', '*文字*', () => wrap('*', '斜体')],
      ['s', '取り消し線', '~~文字~~', () => wrap('~~', '取り消し')],
      ['code', '文中のコード', '`文字`', () => wrap('`', 'コード')],
      ['fence', 'コードブロック', '```', fence],
      ['quote', '引用', '> 文字', () => prefix('> ')],
      ['ul', '箇条書き', '- 文字', () => prefix('- ')],
      ['ol', '番号つきの箇条書き', '1. 文字', () => prefix('1. ')],
      ['hr', '区切り線', '---', () => insert('\n---\n')],
      ['link', 'リンク', '[文字](URL)', linkIt],
      ['user', '{{user}}', 'ユーザーの名前', () => insert('{{user}}')]
    ];
    const run = (id) => SYNTAX.find((x) => x[0] === id)[3]();
    const btn = (label, title, id) => h('button', { type: 'button', title, onmousedown: (e) => e.preventDefault(), onclick: () => run(id) }, label);
    const pick = h('select.md-pick', { 'aria-label': '記法を選んで入れる', onchange: (e) => {
      const id = e.target.value;
      e.target.value = '';
      if (id) run(id);
    } }, h('option', { value: '' }, '記法を選ぶ…'), SYNTAX.map(([id, label, code]) => h('option', { value: id }, `${label}　${code}`)));
    return h('div.md-tools', { role: 'toolbar', 'aria-label': '書き方' },
      btn(h('b', 'B'), '太字 **文字**', 'b'),
      btn(h('i', 'I'), '斜体 *文字*', 'i'),
      btn(h('s', 'S'), '取り消し線 ~~文字~~', 's'),
      btn(h('code', '`'), '文中のコード `文字`', 'code'),
      btn('```', 'コードブロック', 'fence'),
      btn('引用', '引用 > 文字', 'quote'),
      pick);
  }

  const CHEAT = [
    ['# 大見出し', '大きな見出しになる。## で中くらい、### で小さくなる'],
    ['**太字**', '太字になり、明るい字で表示される'],
    ['*斜体*', '斜体になり、少し暗い字で表示される'],
    ['~~取り消し線~~', '取り消し線が付く'],
    ['`コード`', '等幅の字の小さな囲みになる'],
    ['```\nコード\n```', '``` の行ではさんだ所が、角の丸い薄い囲みになる'],
    ['> 文', '左に細い線が付く。続けた行は1つの囲みになる'],
    ['- 項目', '箇条書きになる。1. で始めると番号つきになる'],
    ['---', '区切り線になる'],
    ['[文字](URL)', 'リンクになる。URLだけ書いてもリンクになる'],
    ['{{user}}', 'ユーザーの名前に置き換わる。紫の字で表示される']
  ];

  /* ------------------------------------------------ プレビュー */
  function detailPreview(p, stats, state) {
    const page = h('div.zp');
    const covers = p.cover;
    const main = covers[Math.min(state.cover || 0, Math.max(0, covers.length - 1))] || (p.characters[0] && p.characters[0].images[0]) || '';
    page.append(h('div.zp-hero', { 'data-img': main || null },
      h('div.zp-hero-in',
        covers.length > 1 && h('div.zp-thumbs', covers.map((id, i) => h('button.zp-thumb' + (main === id ? '.on' : ''), {
          type: 'button', 'data-img': id, 'aria-label': `カバー画像${i + 1}`, onclick: () => { state.cover = i; state.redraw(); }
        }))),
        h('p.zp-title', p.title.trim() || '(題名なし)'),
        p.short.trim() && h('p.zp-short', p.short),
        p.tags.length > 0 && h('p.zp-tags', p.tags.map((t) => '#' + t).join(' ')))));

    // 詳細ページの並び: 紹介 → プロット(キャラ) → イントロ → クリエイターコメント
    const body = h('div.zp-body');
    const md = (text) => h('div.zp-md', MiniMd.render(text, stats));
    const plain = (text) => h('div.zp-md', h('p.md-p', MiniMd.plain(text)));
    const sec = (title, ...kids) => body.append(h('section.zp-sec', h('h3.zp-h', title), ...kids));
    if (p.aboutCustom) {
      const blocks = p.about.filter((b) => (b.kind === 'image' ? b.image : b.text.trim()));
      sec('紹介', blocks.length ? blocks.map((b) => (b.kind === 'image' ? h('div.zp-img', ui().img(b.image, null, '紹介文の画像')) : md(b.text)))
        : h('p.zp-empty', 'ここに紹介文が表示されます。'));
    } else {
      sec('紹介', p.description.trim() ? plain(p.description) : h('p.zp-empty', 'プロンプトの説明がここに表示されます。'));
    }
    const chars = p.characters.filter((c) => c.name.trim() || c.images.length || (p.aboutCustom ? p.aboutChars[c.id] : c.profile));
    if (chars.length) {
      sec('プロット', chars.map((c) => {
        const text = p.aboutCustom ? p.aboutChars[c.id] || '' : c.profile;
        return h('div.zp-char',
          c.images.length > 0 && h('div.zp-imgs', c.images.map((id) => ui().img(id, null, c.name))),
          h('p.zp-name', c.name.trim() || 'キャラ'),
          text.trim() && (p.aboutCustom ? md(text) : plain(text)));
      }));
    }
    if (p.intro.length) sec('イントロ', Views.chatPreview(p));
    if (p.comment.trim()) sec('クリエイターコメント', plain(p.comment));
    page.append(body);
    ui().hydrate(page);
    return page;
  }

  function coverPreview(p) {
    const id = p.cover[0] || (p.characters[0] && p.characters[0].images[0]) || '';
    const card = h('div.zp-cardview',
      h('div.zp-card',
        h('span.zp-card-img', { 'data-img': id || null }, !id && icon('image', 28)),
        h('p.zp-card-title', p.title.trim() || '(題名なし)'),
        p.short.trim() && h('p.zp-card-short', p.short)),
      h('p.zp-note', '一覧に並ぶときの見え方の目安です。'));
    ui().hydrate(card);
    return card;
  }

  /* ------------------------------------------------ タブ本体 */
  function tabAbout(ctx) {
    const { p, save } = ctx;
    const redraw = (removed) => { save(); if (removed === true) Store.flush().then(Store.gcImages); ctx.redraw(); };
    const meter = ui().meter({ label: '紹介文の字数', limit: L.about, note: '本文とキャラごとの欄の合計です。' });
    const warn = h('p.md-warn', { hidden: true, role: 'status' });

    // プレビュー
    const pv = h('div.pv-body');
    const view = { mode: 'detail', cover: 0, redraw: () => drawPreview() };
    let raf = 0;
    const drawPreview = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const stats = { warn: 0, img: 0 };
        pv.replaceChildren(view.mode === 'cover' ? coverPreview(p) : detailPreview(p, stats, view));
        if (view.mode !== 'cover') {
          const notes = [
            stats.warn && `太字にならない ** が${stats.warn}か所あります。「**「大事」**です」のように、閉じる ** の前が記号で後ろが文字のときは、マークダウンの決まりで太字になりません。「「**大事**」です」のように ** をかぎかっこの内側に入れると、太字になります。`,
            stats.img && `画像の記法 ![](URL) が${stats.img}か所あります。zetaでは何も表示されないので、画像は「画像」のボタンで入れてください。`
          ].filter(Boolean);
          warn.hidden = !notes.length;
          warn.textContent = notes.join('\n');
        }
        meter.set(Store.aboutCount(p));
      });
    };
    const pvSeg = h('div.seg.pv-mode', { role: 'group', 'aria-label': 'プレビューの種類' },
      [['detail', '詳細ページ'], ['cover', 'カバー']].map(([m, label]) => h('button', {
        type: 'button', 'aria-pressed': view.mode === m ? 'true' : 'false', onclick: (e) => {
          view.mode = m;
          pvSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'));
          drawPreview();
        }
      }, label)));

    const onText = () => { save(); drawPreview(); };
    let lastTa = null;
    const f = (o, obj, key) => {
      const fd = ui().field({ ...o, value: obj[key] || '', onInput: (v) => { obj[key] = v; onText(); } });
      if (o.md) fd.input.dataset.md = '1';   // 書き方のボタンが効く欄
      return fd.el;
    };

    // 紹介文の本文 (文と画像のまとまり)
    const blocks = p.about.map((b, i) => {
      const tools = ui().rowTools(p.about, b, redraw, { delLabel: 'このまとまりを消す', confirm: b.kind === 'text' && b.text.trim() ? 'この文のまとまりを消しますか?' : null });
      if (b.kind === 'image') {
        return h('div.pcard.ab-block', h('div.pcard-head', h('b', icon('image', 15), `画像`), tools), h('div.im-pic', { 'data-img': b.image }));
      }
      return h('div.pcard.ab-block', h('div.pcard-head', h('b', `本文 ${i + 1}`), tools),
        f({ label: '文', rows: 8, md: true, copyLabel: 'コピー', ph: '詳細ページに表示する内容。この内容はAIモデルには影響しません' }, b, 'text'));
    });
    const charSecs = p.characters.map((c, i) => h('div.pcard.ab-char',
      f({ label: `## ${c.name.trim() || `キャラ${i + 1}`}`, sub: 'このキャラの欄', rows: 8, md: true, copyLabel: 'コピー', ph: '詳細ページのこのキャラの欄に表示する内容' }, p.aboutChars, c.id)));

    const fromPrompt = async () => {
      const has = p.about.some((b) => b.kind === 'text' && b.text.trim()) || p.characters.some((c) => (p.aboutChars[c.id] || '').trim());
      if (has && !(await U.confirmDialog({ title: 'プロンプトから入れる', message: 'いまの紹介文の本文とキャラの欄を、プロンプトの説明とキャラのプロフィールに置き換えます。画像のまとまりは残します。', okLabel: '置き換える' }))) return;
      p.about = [{ id: U.uid(), kind: 'text', text: p.description, image: '' }, ...p.about.filter((b) => b.kind === 'image')];
      p.characters.forEach((c) => { p.aboutChars[c.id] = c.profile; });
      redraw();
      U.toast('プロンプトから入れました');
    };
    const addImage = () => ui().pickFiles(true, async (files) => {
      const got = await ui().saveFiles(files);
      if (!got.length) return;
      p.about.push(...got.map((id) => ({ id: U.uid(), kind: 'image', text: '', image: id })));
      redraw();
    });

    const custom = h('label.check.st-toggle',
      h('input', { type: 'checkbox', checked: p.aboutCustom, onchange: (e) => { p.aboutCustom = e.target.checked; redraw(); } }),
      h('span', '紹介文をカスタム', h('small', 'プロンプトの代わりに紹介文を公開します。外すと、プロンプトの説明とキャラのプロフィールが表示されます')));

    const edit = h('div.split-edit',
      h('section.psec', h('div.psec-head', h('h2', 'カバー'), h('small', '先頭がメインの画像になります')),
        ui().imageStrip({ ids: p.cover, main: true, label: 'カバー画像を足す', onChange: (removed) => { view.cover = 0; save(); drawPreview(); if (removed) Store.flush().then(Store.gcImages); } }),
        f({ label: '簡単な紹介', limit: L.short, rows: 2, ph: '題名と一緒に公開される紹介文' }, p, 'short'),
        tagsEditor(p, () => { save(); drawPreview(); })),
      h('section.psec', h('div.psec-head', h('h2', '紹介文')),
        custom,
        p.aboutCustom && [
          meter.el,
          h('div.ab-bar', mdTools(() => lastTa),
            h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: fromPrompt, title: 'プロンプトの説明とキャラのプロフィールを入れる' }, icon('refresh'), 'プロンプトから入れる')),
          warn,
          ...blocks,
          h('div.im-add',
            h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { p.about.push({ id: U.uid(), kind: 'text', text: '', image: '' }); redraw(); } }, icon('plus'), '文のまとまり'),
            h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: addImage }, icon('image'), '画像')),
          ...charSecs,
          !p.characters.length && h('p.hint', 'プロンプトのタブでキャラを足すと、キャラごとの欄がここに表示されます。'),
          h('details.fold.cheat', h('summary', '使える書き方'),
            h('dl.cheat-list', CHEAT.map(([code, desc]) => [h('dt', h('code', code)), h('dd', desc)])),
            h('p.hint', 'zetaの詳細ページに近づけた見え方です。細かい所はzetaのプレビューでも確かめてください。'))
        ]),
      h('section.psec', h('div.psec-head', h('h2', '追加情報')),
        f({ label: 'クリエイターコメント', limit: L.comment, rows: 3 }, p, 'comment')));
    edit.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.md) lastTa = e.target; });

    const wrap = h('div.split.about');
    const preview = h('div.split-preview', pvSeg, h('div.phone', pv));
    wrap.append(ui().previewSwitch(wrap), edit, preview);
    drawPreview();
    return wrap;
  }

  Views.tabAbout = tabAbout;
})();
