/* userpair: 2人(または1人)のキャラシートを作って画像で保存 */
(function () {
  'use strict';
  const { h, icon } = U;

  Kit.mountBar('userpair');

  const person = () => ({
    name: '', sub: '',
    tags: [{ k: 'AGE', v: '' }, { k: 'GENDER', v: '' }, { k: 'HEIGHT', v: '' }, { k: 'MOTIF', v: '' }],
    desc: [{ k: '', v: '' }, { k: '', v: '' }, { k: '', v: '' }, { k: '', v: '' }],
    groups: [{ title: '', items: ['', '', ''] }],
    note: '',
    face: null, sd: null, full: null,
    colors: [{ label: 'HAIR', list: ['#3b3340', '#6b5a72'] }, { label: 'EYES', list: ['#b0476a', '#e48aa6'] }]
  });
  const defaults = () => ({
    mode: 2, theme: 'basic', title: '', sub: '', foot: '',
    show: { tags: true, desc: true, group: true, note: true, colors: true, sd: true, full: false, relation: true, head: true, foot: true },
    people: [person(), person()],
    rel: { ab: '', ba: '', a: null, b: null }
  });
  // 保存データの形を今の形にそろえる (古い保存や手で書き換えたJSONでも壊れないように)
  function migrate(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    out.show = Object.assign(defaults().show, s && s.show);
    out.rel = Object.assign(defaults().rel, s && s.rel);
    out.people = (Array.isArray(s && s.people) ? s.people : []).slice(0, 2).map((p) => Object.assign(person(), p));
    while (out.people.length < 2) out.people.push(person());
    out.mode = out.mode === 1 ? 1 : 2;
    return out;
  }

  const app = document.getElementById('app');
  const toolbar = h('div.ed-toolbar');
  const tip = h('p.ed-tip', '文字は押してそのまま書けます。画像の枠はクリック・ドラッグ・貼り付け(Ctrl+V)で追加、ホイールや2本指で拡大、ドラッグで位置を合わせられます。内容はこのブラウザに自動で保存されます。');
  app.append(toolbar, tip);

  const ed = Ed.create({ app: 'userpair', version: 1, width: 880, defaults, migrate, render, mount: app });

  /* ---------------------------------------------------------------- シート */
  function card(i) {
    const p = `people.${i}`;
    const s = ed.state.show;
    const main = h('div.pc-main',
      s.tags && ed.list(`${p}.tags`, (t, j, tp) => h('div.pc-tag', ed.text(`${tp}.k`, { cls: 'k', ph: 'ITEM' }), ed.text(`${tp}.v`, { cls: 'v', ph: '内容' })),
        { cls: 'pc-tags', add: () => ({ k: '', v: '' }), addLabel: '項目', max: 8 }),
      s.desc && h('section.pc-sec',
        h('div.pc-sec-title', h('span', 'DESCRIPTION')),
        ed.list(`${p}.desc`, (r, j, rp) => h('div.pc-row', ed.text(`${rp}.k`, { cls: 'k', ph: 'LABEL' }), ed.text(`${rp}.v`, { cls: 'v', ph: '内容を書いてください', multi: true })),
          { cls: 'pc-rows', add: () => ({ k: '', v: '' }), addLabel: '行を追加', max: 14 })),
      s.group && ed.list(`${p}.groups`, (gr, j, gp) => h('div.pc-group',
        ed.text(`${gp}.title`, { cls: 'pc-group-title', ph: 'GROUP' }),
        ed.list(`${gp}.items`, (it, k) => h('div.pc-li', ed.text(`${gp}.items.${k}`, { ph: '項目', multi: true })),
          { cls: 'pc-lis', add: () => '', addLabel: '項目', max: 12 })),
      { cls: 'pc-groups', add: () => ({ title: '', items: ['', ''] }), addLabel: 'グループ', max: 4 }),
      s.note && h('div.pc-note', h('span.pc-note-label', 'NOTE'), ed.text(`${p}.note`, { ph: 'メモ・補足', multi: true })));

    const side = h('div.pc-side',
      ed.image(`${p}.face`, { ratio: 4 / 5, label: '顔・バストアップ' }),
      s.colors && ed.list(`${p}.colors`, (c, j, cp) => h('div.pc-colors',
        ed.text(`${cp}.label`, { cls: 'pc-colors-label', ph: 'COLOR' }),
        h('div.pc-swatches',
          ed.list(`${cp}.list`, (hex, k) => h('div.pc-sw', ed.color(`${cp}.list.${k}`)), { cls: 'pc-sw-list', add: () => '#cccccc', addLabel: '', max: 5, rmLabel: '色を削除' }))),
      { cls: 'pc-colors-list', add: () => ({ label: '', list: ['#cccccc'] }), addLabel: '色グループ', max: 4 }),
      s.sd && h('div.pc-sd', ed.image(`${p}.sd`, { ratio: 1, label: 'SD・ちびキャラ' })));

    return h('article.pc-card',
      h('header.pc-bar',
        ed.text(`${p}.name`, { cls: 'pc-name', ph: 'CHARACTER NAME' }),
        ed.text(`${p}.sub`, { cls: 'pc-sub', ph: 'よみ・英字など' }),
        h('span.pc-dots', h('i'), h('i'), h('i'))),
      h('div.pc-body' + (s.full ? '.with-full' : ''),
        main, side,
        s.full && h('div.pc-full', ed.image(`${p}.full`, { ratio: 9 / 22, label: '全身' }))));
  }

  function relation() {
    const arrow = (dir) => h('span.pr-arrow.' + dir);
    return h('section.pr',
      ed.image('rel.a', { ratio: 1, round: true, label: 'A', cls: 'pr-icon' }),
      h('div.pr-mid',
        h('div.pr-line', ed.text('rel.ab', { cls: 'pr-label', ph: 'AからBへの気持ち・態度' }), arrow('right')),
        h('div.pr-line', arrow('left'), ed.text('rel.ba', { cls: 'pr-label', ph: 'BからAへの気持ち・態度' }))),
      ed.image('rel.b', { ratio: 1, round: true, label: 'B', cls: 'pr-icon' }));
  }

  function render() {
    const s = ed.state;
    return h('div.pair-sheet' + (s.mode === 1 ? '.solo' : ''), { style: Ed.themeVars(s.theme) },
      s.show.head && h('header.ps-head',
        ed.text('title', { cls: 'ps-title', ph: 'TITLE' }),
        ed.text('sub', { cls: 'ps-subtitle', ph: 'pair profile' })),
      card(0),
      s.mode === 2 && s.show.relation && relation(),
      s.mode === 2 && card(1),
      s.show.foot && ed.text('foot', { cls: 'ps-foot', ph: 'ひとこと・クレジットなど' }));
  }

  /* ---------------------------------------------------------------- userprof から */
  async function importFrom(i) {
    const r = await Ed.pickUserprof();
    if (!r) return;
    const u = r.user;
    const p = ed.state.people[i];
    p.name = u.name || p.name;
    const setTag = (k, v) => {
      if (!v) return;
      const t = p.tags.find((x) => x.k.toUpperCase() === k);
      if (t) t.v = v; else p.tags.push({ k, v });
    };
    setTag('AGE', u.age); setTag('GENDER', u.gender); setTag('HEIGHT', u.height);
    const rows = [['職業・立場', u.occupation], ['性格', u.personality], ['好きなもの', u.likes], ['嫌いなもの', u.dislikes],
      ['髪', [u.hairColor, u.hairStyle].filter(Boolean).join('・')], ['瞳', u.eyes], ['服装・雰囲気', u.style], ['家族', u.family], ['生い立ち', u.past]]
      .filter(([, v]) => v && String(v).trim()).map(([k, v]) => ({ k, v: String(v) }));
    if (rows.length) p.desc = rows;
    if (u.bio) p.note = u.bio;
    if (r.image) p.face = r.image;
    await ed.save();
    ed.rerender();
    U.toast(`「${u.name}」を読み込みました`);
  }

  /* ---------------------------------------------------------------- ツールバー */
  function renderToolbar() {
    const s = ed.state;
    const modeSeg = h('div.seg', { role: 'group', 'aria-label': '人数' },
      [[2, '2人'], [1, '1人']].map(([n, label]) => h('button', {
        type: 'button', 'aria-pressed': s.mode === n ? 'true' : 'false',
        onclick: () => { ed.set('mode', n, { rerender: true }); renderToolbar(); }
      }, label)));
    const imp = ed.popover('userprofから', 'book', (close) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('p.hint', 'userprof に保存した user のプロフィールと画像を読み込みます。'),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { close(); importFrom(0); } }, s.mode === 2 ? '上の人に読み込む' : '読み込む'),
      s.mode === 2 && h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { close(); importFrom(1); } }, '下の人に読み込む')));
    toolbar.replaceChildren(
      modeSeg,
      Ed.themePicker(ed, 'theme'),
      Ed.showPicker(ed, 'show', [['head', 'タイトル'], ['tags', 'タグ(AGEなど)'], ['desc', 'DESCRIPTION'], ['group', 'グループ'], ['note', 'NOTE'],
        ['colors', 'カラー'], ['sd', 'SD画像'], ['full', '全身画像'], ['relation', '2人の関係(矢印)'], ['foot', 'ひとこと']]),
      imp,
      h('span.spacer'),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: ed.saveJson, title: '入力内容をファイルに保存' }, icon('save'), '保存'),
      ed.fileButton('読み込み', ed.loadJson),
      h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => ed.reset().then(renderToolbar) }, icon('trash'), 'クリア'),
      ed.exportButton(() => `userpair_${U.safeName(ed.state.people.map((p) => p.name).filter(Boolean).join('_') || ed.state.title, 'sheet')}.png`));
  }

  /* ---------------------------------------------------------------- 起動 */
  document.body.append(Kit.footer());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      toolbar.querySelector('.btn-primary').click();
    }
  });
  ed.load().then(() => { renderToolbar(); ed.rerender(); U.hydrateIcons(document); });
  window.__userpair = ed;   // 動作確認用
})();
