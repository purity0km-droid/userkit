/* userline: プロフィール・年表・まとめ・関係を1枚にしたタイムライン風ペアカード */
(function () {
  'use strict';
  const { h, icon } = U;

  Kit.mountBar('userline');

  const person = () => ({
    image: null, intro: '', name: '',
    tags: [{ t: '' }],
    items: [{ k: '', v: '' }, { k: '', v: '' }, { k: '', v: '' }],
    desc: ''
  });
  const defaults = () => ({
    theme: 'basic', label: '', title: '',
    show: { profile: true, timeline: true, banner: true, summary: true, relation: true, foot: true },
    people: [person(), person()],
    banner: null,
    timeline: [{ t: '', d: '' }, { t: '', d: '' }, { t: '', d: '' }],
    summary: '',
    relations: [{ a: null, b: null, an: '', bn: '', ab: '', ba: '' }],
    foot: ''
  });
  function migrate(s) {
    const d = defaults();
    const out = Object.assign(d, s || {});
    out.show = Object.assign(defaults().show, s && s.show);
    out.people = (Array.isArray(s && s.people) && s.people.length ? s.people : defaults().people).slice(0, 4).map((p) => Object.assign(person(), p));
    if (!Array.isArray(out.timeline)) out.timeline = [];
    if (!Array.isArray(out.relations)) out.relations = [];
    return out;
  }

  const app = document.getElementById('app');
  const toolbar = h('div.ed-toolbar');
  const tip = h('p.ed-tip', '文字は押してそのまま書けます。画像の枠はクリック・ドラッグ・貼り付け(Ctrl+V)で追加、ホイールや2本指で拡大、ドラッグで位置を合わせられます。人物は4人まで増やせます。内容はこのブラウザに自動で保存されます。');
  app.append(toolbar, tip);

  const ed = Ed.create({ app: 'userline', version: 1, width: 760, defaults, migrate, render, mount: app });

  /* ---------------------------------------------------------------- シート */
  const section = (title, ...body) => h('section.ul-sec', h('h2.ul-sec-title', h('span', title)), ...body);

  function personCard(p, i, pp) {
    return h('article.ul-person',
      ed.image(`${pp}.image`, { ratio: 4 / 5, label: '人物の画像' }),
      h('div.ul-person-body',
        ed.text(`${pp}.intro`, { cls: 'ul-intro', ph: '紹介・肩書き' }),
        ed.text(`${pp}.name`, { cls: 'ul-name', ph: '名前' }),
        ed.list(`${pp}.tags`, (t, j, tp) => h('div.ul-tag', ed.text(`${tp}.t`, { ph: 'タグ' })),
          { cls: 'ul-tags', add: () => ({ t: '' }), addLabel: '', max: 6 }),
        h('div.ul-rule'),
        ed.list(`${pp}.items`, (it, j, ip) => h('div.ul-item', ed.text(`${ip}.k`, { cls: 'k', ph: '項目' }), ed.text(`${ip}.v`, { cls: 'v', ph: '内容', multi: true })),
          { cls: 'ul-items', add: () => ({ k: '', v: '' }), addLabel: '項目', max: 10 }),
        ed.text(`${pp}.desc`, { cls: 'ul-desc', ph: '説明', multi: true })));
  }

  function render() {
    const s = ed.state;
    const n = s.people.length;
    return h('div.line-sheet', { style: Ed.themeVars(s.theme) },
      h('header.ul-head',
        h('span.ul-accent'),
        ed.text('label', { cls: 'ul-label', ph: 'ラベル' }),
        ed.text('title', { cls: 'ul-title', ph: 'タイトル' })),

      s.show.profile && section('PROFILE',
        ed.list('people', personCard, { cls: 'ul-people.cols-' + Math.min(n, 2), add: person, addLabel: '人物', max: 4, rmLabel: '人物を削除', removable: n > 1 })),

      s.show.timeline && section('TIMELINE',
        s.show.banner && h('div.ul-banner', ed.image('banner', { ratio: 16 / 7, label: '場面の画像' })),
        h('div.ul-card',
          ed.list('timeline', (t, j, tp) => h('div.ul-tl', h('span.ul-dot'),
            h('div.ul-tl-body', ed.text(`${tp}.t`, { cls: 'ul-tl-title', ph: '出来事' }), ed.text(`${tp}.d`, { cls: 'ul-tl-text', ph: '内容', multi: true }))),
          { cls: 'ul-tls', add: () => ({ t: '', d: '' }), addLabel: 'タイムライン', max: 20 }))),

      s.show.summary && section('SUMMARY',
        h('div.ul-card', ed.text('summary', { cls: 'ul-summary', ph: 'ふたりの関係をひとことで', multi: true }))),

      s.show.relation && section('RELATION',
        h('div.ul-card',
          ed.list('relations', (r, j, rp) => h('div.ul-rel',
            h('div.ul-rel-who', ed.image(`${rp}.a`, { ratio: 1, round: true, compact: true, label: '左の人' }), ed.text(`${rp}.an`, { cls: 'ul-rel-name', ph: 'Character' })),
            h('div.ul-rel-mid',
              ed.text(`${rp}.ab`, { cls: 'ul-rel-label', ph: '関係・気持ち' }),
              h('span.ul-arrow.right'),
              h('span.ul-arrow.left'),
              ed.text(`${rp}.ba`, { cls: 'ul-rel-label', ph: '関係・気持ち' })),
            h('div.ul-rel-who', ed.image(`${rp}.b`, { ratio: 1, round: true, compact: true, label: '右の人' }), ed.text(`${rp}.bn`, { cls: 'ul-rel-name', ph: 'Character' }))),
          { cls: 'ul-rels', add: () => ({ a: null, b: null, an: '', bn: '', ab: '', ba: '' }), addLabel: '関係', max: 6 }))),

      s.show.foot && ed.text('foot', { cls: 'ul-foot', ph: '下の一文' }));
  }

  /* ---------------------------------------------------------------- userprof から */
  async function importFrom(i) {
    const r = await Ed.pickUserprof();
    if (!r) return;
    const u = r.user;
    while (ed.state.people.length <= i) ed.state.people.push(person());
    const p = ed.state.people[i];
    p.name = u.name || p.name;
    if (u.plot) p.intro = u.plot;
    const items = [['年齢', u.age], ['性別', u.gender], ['身長', u.height], ['職業', u.occupation], ['好き', u.likes], ['苦手', u.dislikes]]
      .filter(([, v]) => v && String(v).trim()).map(([k, v]) => ({ k, v: String(v) }));
    if (items.length) p.items = items;
    if (u.personality) p.tags = String(u.personality).split(/[、,。・\s]+/).filter(Boolean).slice(0, 4).map((t) => ({ t }));
    if (u.bio) p.desc = u.bio;
    if (r.image) p.image = r.image;
    // 関係の欄の名前と丸い画像にも入れる
    const rel = ed.state.relations[0];
    if (rel && i < 2) {
      if (i === 0) { if (!rel.an) rel.an = u.name; if (!rel.a && r.image) rel.a = Object.assign({}, r.image); }
      else { if (!rel.bn) rel.bn = u.name; if (!rel.b && r.image) rel.b = Object.assign({}, r.image); }
    }
    await ed.save();
    ed.rerender();
    renderToolbar();
    U.toast(`「${u.name}」を読み込みました`);
  }

  /* ---------------------------------------------------------------- ツールバー */
  function renderToolbar() {
    const n = ed.state.people.length;
    const imp = ed.popover('userprofから', 'book', (close) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('p.hint', 'userprof に保存した user を、何人目の人物に読み込むか選んでください。'),
      Array.from({ length: Math.min(4, n + 1) }, (_, i) => h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { close(); importFrom(i); } },
        i < n ? `${i + 1}人目に読み込む` : `${i + 1}人目として追加`))));
    toolbar.replaceChildren(
      Ed.themePicker(ed, 'theme'),
      Ed.showPicker(ed, 'show', [['profile', 'PROFILE'], ['timeline', 'TIMELINE'], ['banner', 'TIMELINEの画像'], ['summary', 'SUMMARY'], ['relation', 'RELATION'], ['foot', '下の一文']]),
      imp,
      h('span.spacer'),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: ed.saveJson, title: '入力内容をファイルに保存' }, icon('save'), '保存'),
      ed.fileButton('読み込み', ed.loadJson),
      h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => ed.reset().then(renderToolbar) }, icon('trash'), 'クリア'),
      ed.exportButton(() => `userline_${U.safeName(ed.state.title || ed.state.people.map((p) => p.name).filter(Boolean).join('_'), 'card')}.png`));
  }

  /* ---------------------------------------------------------------- 起動 */
  document.body.append(Kit.footer());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      toolbar.querySelector('.btn-primary').click();
    }
  });
  // 人物の数が変わるとツールバーの選択肢も変わる
  const origRerender = ed.rerender;
  ed.rerender = () => { origRerender(); renderToolbar(); };
  ed.load().then(() => { ed.rerender(); U.hydrateIcons(document); });
  window.__userline = ed;   // 動作確認用
})();
