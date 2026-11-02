/* イントロのタブ: ナレーター・セリフ・画像の並びを書いて、トーク画面に近い見え方で確かめる */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};
  const ui = () => Views.ui;

  const charOf = (p, id) => p.characters.find((c) => c.id === id) || null;
  const whoLabel = (p, who) => {
    if (who === 'n') return 'ナレーター';
    if (who === 'u') return 'ユーザー';
    const c = charOf(p, who);
    return c ? c.name.trim() || `キャラ${p.characters.indexOf(c) + 1}` : '消したキャラ';
  };

  /**
   * まとめて貼った文を分ける。
   * 「名前：セリフ」「名前「セリフ」」の行と、名前だけの行の次の行(zetaの画面からそのまま写したとき)をセリフに、ほかはナレーターにする
   */
  function parseBulk(text, p) {
    const names = new Map([['{{user}}', 'u'], ['ユーザー', 'u']]);
    p.characters.forEach((c) => { if (c.name.trim()) names.set(c.name.trim(), c.id); });
    const out = [];
    let narr = [];
    const flushNarr = () => {
      const t = narr.join('\n').replace(/^\n+|\n+$/g, '');
      if (t.trim()) out.push({ who: 'n', text: t });
      narr = [];
    };
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const t = l.trim();
      let m, who;
      if ((who = names.get(t)) && i + 1 < lines.length && lines[i + 1].trim()) {
        flushNarr();
        out.push({ who, text: lines[++i].trim() });
        continue;
      }
      if ((m = /^(.{1,20}?)\s*[:：]\s*(.+)$/.exec(t)) && (who = names.get(m[1].trim()))) {
        flushNarr();
        out.push({ who, text: m[2].trim() });
        continue;
      }
      if ((m = /^(.{1,20}?)\s*[「『](.+)[」』]$/.exec(t)) && (who = names.get(m[1].trim()))) {
        flushNarr();
        out.push({ who, text: m[2].trim() });
        continue;
      }
      narr.push(l);
    }
    flushNarr();
    return out;
  }

  function bulkDialog(ctx, done) {
    const { p } = ctx;
    const ta = h('textarea', { rows: 12, 'aria-label': 'まとめて貼る文' });
    const info = h('p.hint');
    const update = () => {
      const list = parseBulk(ta.value, p);
      const n = list.filter((m) => m.who === 'n').length;
      info.textContent = list.length ? `ナレーター${n}件・セリフ${list.length - n}件に分けます。` : '';
    };
    ta.addEventListener('input', update);
    const apply = (replace) => {
      const list = parseBulk(ta.value, p);
      if (!list.length) return U.toast('貼る文がありません', 'error');
      const msgs = list.map((m) => ({ id: U.uid(), who: m.who, text: m.text, image: '' }));
      if (replace) p.intro.splice(0, p.intro.length, ...p.intro.filter((m) => m.who === 'img'), ...msgs);
      else p.intro.push(...msgs);
      ctl.close();
      done();
      U.toast(`${msgs.length}件入れました`);
    };
    const body = h('div.modal-body',
      h('p.modal-lead', '空行と改行はそのまま残ります。「キャラ名：セリフ」と「キャラ名「セリフ」」の行はそのキャラのセリフに、「{{user}}：セリフ」の行はユーザーのセリフに、ほかの行はナレーターにします。zetaの画面から写した文では、名前だけの行の次の行もセリフにします。'),
      ta, info,
      h('div.modal-foot',
        h('button.btn.btn-outline', { type: 'button', onclick: () => apply(true), title: '文の行を貼った文に置き換えます。画像の行は先頭に残します' }, '置き換える'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => apply(false) }, icon('plus'), '後ろに足す')));
    const ctl = U.openDialog({ title: 'まとめて貼る', content: body, wide: true });
    ta.focus();
  }

  /* ------------------------------------------------ プレビュー (詳細ページのイントロに近い見え方。文はマークダウンで組む) */
  function chatPreview(p) {
    const box = h('div.zchat');
    if (!p.intro.length) {
      box.append(h('p.zp-empty', 'ここにイントロが表示されます。'));
      return box;
    }
    const md = (text) => h('div.zc-text.zp-md', MiniMd.render(text));
    p.intro.forEach((m) => {
      if (m.who === 'img') { box.append(h('div.zc-img', ui().img(m.image, null, 'イントロの画像'))); return; }
      if (m.who === 'n') { box.append(h('div.zc-narr', h('span.zc-mark', icon('menu', 15)), md(m.text))); return; }
      if (m.who === 'u') { box.append(h('div.zc-me', h('div.zc-bubble.me', md(m.text)))); return; }
      const c = charOf(p, m.who);
      const face = c && c.images[0];
      box.append(h('div.zc-char',
        h('span.zc-av', { 'data-img': face || null }, !face && whoLabel(p, m.who).slice(0, 1)),
        h('div.zc-col', h('p.zc-name', whoLabel(p, m.who)), h('div.zc-bubble', md(m.text)))));
    });
    ui().hydrate(box);
    return box;
  }
  Views.chatPreview = chatPreview;

  /* ------------------------------------------------ タブ本体 */
  function tabIntro(ctx) {
    const { p, save } = ctx;
    const meter = ui().meter({ label: 'イントロの字数', limit: Store.LIMIT.intro, note: 'ナレーターとセリフの合計です。' });
    const pv = h('div.pv-body');
    let raf = 0;
    const drawPreview = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { pv.replaceChildren(chatPreview(p)); meter.set(Store.introCount(p)); });
    };
    const redraw = (removed) => { save(); if (removed === true) Store.flush().then(Store.gcImages); ctx.redraw(); };
    const imgCount = p.intro.filter((m) => m.who === 'img').length;

    const kindOf = (who) => (who === 'n' || who === 'u' || who === 'img' ? who : 'c');

    const rows = p.intro.map((m) => {
      const tools = ui().rowTools(p.intro, m, redraw, {
        delLabel: 'この行を消す',
        extra: m.who !== 'img' && ui().copyBtn(() => m.text)
      });
      let row;
      if (m.who === 'img') {
        row = h('div.im-row', { 'data-who': 'img' },
          h('div.im-head', h('span.im-tag', icon('image', 15), '画像'), tools),
          h('div.im-pic', { 'data-img': m.image }));
      } else {
        const ta = h('textarea.im-ta', { rows: 2, value: m.text, placeholder: m.who === 'n' ? '状況の説明' : 'セリフ', 'aria-label': '中身' });
        ta.addEventListener('input', () => { m.text = ta.value; save(); drawPreview(); });
        const sel = h('select.im-who', { 'aria-label': 'だれの行か' },
          [['n', 'ナレーター'], ['u', 'ユーザー'], ...p.characters.map((c) => [c.id, whoLabel(p, c.id)]),
            ...(['n', 'u'].includes(m.who) || charOf(p, m.who) ? [] : [[m.who, '消したキャラ']])]
            .map(([v, label]) => h('option', { value: v, selected: v === m.who }, label)));
        row = h('div.im-row', { 'data-who': kindOf(m.who) }, h('div.im-head', sel, tools), ta);
        sel.addEventListener('change', () => { m.who = sel.value; row.dataset.who = kindOf(m.who); save(); drawPreview(); });
      }
      return row;
    });

    const add = (who) => { p.intro.push({ id: U.uid(), who, text: '', image: '' }); redraw(); };
    const addImage = () => ui().pickFiles(false, async (files) => {
      const got = await ui().saveFiles(files);
      if (!got.length) return;
      p.intro.push({ id: U.uid(), who: 'img', text: '', image: got[0] });
      redraw();
    });

    const wrap = h('div.split');
    const edit = h('div.split-edit',
      meter.el,
      h('p.tab-lead', '行ごとに、ナレーター・ユーザー・キャラのどれかを選びます。zetaの画面から写した文は「まとめて貼る」で分けられます。'),
      h('div.im-list', rows.length ? rows : h('p.hint', 'まだ行がありません。下のボタンで足すか、まとめて貼ってください。')),
      h('div.im-add',
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => add('n') }, icon('plus'), 'ナレーター'),
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => add(p.characters[0] ? p.characters[0].id : 'n'), disabled: !p.characters.length, title: p.characters.length ? null : '先にプロンプトのタブでキャラを足してください' }, icon('plus'), 'キャラのセリフ'),
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => add('u') }, icon('plus'), 'ユーザー'),
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: addImage, disabled: imgCount >= Store.MAX.introImages }, icon('image'), `画像(${imgCount}/${Store.MAX.introImages})`),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => bulkDialog(ctx, () => redraw()) }, icon('list'), 'まとめて貼る')));
    const preview = h('div.split-preview', h('div.phone', h('p.phone-cap', 'イントロ'), pv),
      h('p.hint', 'zetaの詳細ページのイントロに近づけた見え方です。細かい所はzetaのプレビューで確かめてください。'));
    wrap.append(ui().previewSwitch(wrap), edit, preview);
    drawPreview();
    return wrap;
  }

  Views.tabIntro = tabIntro;
  Views.parseIntro = parseBulk;
})();
