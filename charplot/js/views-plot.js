/* プロットの画面: 見出し・タブ・プロンプト/設定集/スタイル/プラグイン/設定のタブ・前の版 */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};
  const ui = () => Views.ui;
  const L = Store.LIMIT;

  // zeta の編集画面と同じ並び。short = スマホで出す短い名前
  const TABS = [
    { id: 'prompt', label: 'プロンプト', icon: 'edit' },
    { id: 'lore', label: '設定集', icon: 'book' },
    { id: 'style', label: 'スタイル', icon: 'palette' },
    { id: 'plugin', label: 'プラグイン', icon: 'sparkle' },
    { id: 'intro', label: 'イントロ', icon: 'bubble' },
    { id: 'about', label: '紹介', icon: 'eye' },
    { id: 'setting', label: '設定', icon: 'check' }
  ];
  Views.TABS = TABS;

  let lastId = null;

  function renderPlot(app, id, tab) {
    const p = Store.get(id);
    if (!p) {
      app.replaceChildren(h('div.empty', h('h3', 'プロットが見つかりません'), h('a.btn.btn-outline', { href: '#/' }, icon('left'), 'プロット一覧へ')));
      return;
    }
    if (lastId !== id) { Store.opened(p); lastId = id; }
    const cur = TABS.find((t) => t.id === tab) || TABS[0];
    const save = () => { Store.touch(p); drawHero(); };

    const hero = h('section.hero');
    const crumbTitle = h('strong');
    const drawHero = () => {
      crumbTitle.textContent = p.title.trim() || '(題名なし)';
      document.title = `${crumbTitle.textContent} — charplot`;
      const cover = p.cover[0] || (p.characters[0] && p.characters[0].images[0]) || '';
      hero.replaceChildren(
        h('span.hero-cover', { 'data-img': cover || null }, !cover && icon('image', 26)),
        h('div.hero-main',
          h('h1', p.title.trim() || '(題名なし)'),
          p.short.trim() && h('p.hero-short', p.short),
          (p.characters.length > 0 || p.tags.length > 0) && h('div.chips',
            p.characters.filter((c) => c.name.trim()).map((c) => h('span.chip', icon('user', 13), c.name)),
            p.tags.slice(0, 6).map((t) => h('span.chip.chip-tag', '#' + t))),
          h('p.hero-date', `${U.fmtDate(p.updatedAt)} に更新。入力した内容は自動で保存されます`)),
        h('div.hero-actions',
          h('button.btn.btn-outline.btn-sm', { type: 'button', title: 'いまの中身を前の版に残す', onclick: () => {
            Store.flush();
            if (Store.keep(p, 'manual')) { Store.touch(p); U.toast('いまの中身を前の版に残しました'); drawHero(); }
            else U.toast('いちばん新しい版と同じなので、残しませんでした');
          } }, icon('save'), '版を残す'),
          p.history.length > 0 && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => historyDialog(p, () => renderPlot(app, id, cur.id)) },
            icon('clock'), '前の版', h('span.hist-n', p.history.length)),
          h('button.btn.btn-ghost.btn-sm', { type: 'button', title: 'このプロットだけを復元用ファイルに保存', onclick: (e) => exportOne(p, e.currentTarget) }, icon('download'), 'ファイルに保存'),
          h('button.btn.btn-ghost.btn-sm.danger', { type: 'button', onclick: async () => {
            if (!(await U.confirmDialog({ title: 'プロットを消す', message: `「${p.title || '題名なし'}」を消しますか? 前の版と画像も消えます。`, okLabel: '消す', danger: true }))) return;
            await Store.remove(p.id);
            U.toast('消しました');
            location.hash = '#/';
          } }, icon('trash'), '消す')));
      ui().hydrate(hero);
    };
    drawHero();

    const tabs = h('nav.tabs', { 'aria-label': 'タブ' }, TABS.map((t) => h('a.tab' + (t.id === cur.id ? '.active' : ''), {
      href: `#/plot/${p.id}/${t.id}`, 'aria-current': t.id === cur.id ? 'page' : null
    }, icon(t.icon, 16), h('span', t.label))));

    const panel = h('section.panel.tab-panel');
    const ctx = { p, save, redraw: () => drawPanel(), drawHero };
    const drawPanel = () => {
      const y = window.scrollY;
      const make = { prompt: tabPrompt, lore: tabLore, style: tabStyle, plugin: tabPlugin, intro: Views.tabIntro, about: Views.tabAbout, setting: tabSetting }[cur.id];
      panel.replaceChildren(make(ctx));
      panel.dataset.tab = cur.id;
      ui().hydrate(panel);
      window.scrollTo(0, y);
    };
    drawPanel();

    app.replaceChildren(
      h('nav.crumbs', { 'aria-label': 'パンくず' }, h('a', { href: '#/' }, 'プロット一覧'), h('span', '›'), crumbTitle),
      hero, tabs, panel);
    // 狭い画面でタブの列が横に流れるとき、開いているタブが見えるように寄せる
    const on = tabs.querySelector('.active');
    if (on && tabs.scrollWidth > tabs.clientWidth) {
      const x = on.getBoundingClientRect().left - tabs.getBoundingClientRect().left + tabs.scrollLeft;
      tabs.scrollLeft = x - (tabs.clientWidth - on.offsetWidth) / 2;
    }
  }

  async function exportOne(p, btn) {
    btn.disabled = true;
    try {
      U.download(`charplot-${U.safeName(p.title, 'plot')}-${U.stamp()}.json`, await Store.exportBackup([p]));
      U.toast('このプロットをファイルに保存しました');
    } catch (e) {
      console.error(e);
      U.toast('ファイルを作れませんでした', 'error');
    } finally { btn.disabled = false; }
  }

  /* ------------------------------------------------ 見出しつきの区切り */
  const sec = (title, sub, ...body) => h('section.psec', h('div.psec-head', h('h2', title), sub && h('small', sub)), ...body);
  /** 構成が変わったら描き直し、画像を外したら使われなくなった画像を片づける */
  const changed = (ctx) => (removed) => { ctx.save(); if (removed === true) { Store.flush().then(Store.gcImages); } ctx.redraw(); };

  /* ------------------------------------------------ プロンプト */
  function tabPrompt(ctx) {
    const { p, save } = ctx;
    const promptMeter = ui().meter({ label: 'プロンプトの字数', limit: L.prompt, note: '説明・ナレーター・キャラの名前とプロフィールの合計です。題名・トークプロフィール・状況例は数えません。' });
    const exMeter = ui().meter({ label: '状況例の字数', limit: L.examples, note: '全体の字数には数えません。' });
    const totals = () => { promptMeter.set(Store.promptCount(p)); exMeter.set(Store.examplesCount(p)); };
    const redraw = changed(ctx);

    const f = (o, obj, key) => ui().field({ ...o, value: obj[key], onInput: (v) => { obj[key] = v; save(); totals(); } }).el;

    const chars = p.characters.map((c, i) => h('div.pcard',
      h('div.pcard-head', h('b', `キャラクター ${i + 1}`), ui().rowTools(p.characters, c, redraw, {
        delLabel: 'このキャラを消す', confirm: `「${c.name || 'このキャラ'}」を消しますか? 紹介文のこのキャラの欄も消えます。`,
        onRemove: () => { delete p.aboutChars[c.id]; }
      })),
      ui().imageStrip({ ids: c.images, main: true, label: 'キャラの画像を足す', onChange: (removed) => { save(); if (removed) Store.flush().then(Store.gcImages); } }),
      f({ label: '名前', limit: L.charName, line: true }, c, 'name'),
      f({ label: 'プロフィール', rows: 8, ph: 'キャラクターの外見的特徴、性格、趣味など' }, c, 'profile')));

    const profs = p.profiles.map((x, i) => h('div.pcard',
      h('div.pcard-head', h('b', `トークプロフィール ${i + 1}`), ui().rowTools(p.profiles, x, redraw, { delLabel: 'このトークプロフィールを消す', confirm: 'このトークプロフィールを消しますか?' })),
      ui().oneImage(() => x.image, (v) => { const old = x.image; x.image = v; save(); if (old) Store.flush().then(Store.gcImages); }, 'アイコン'),
      f({ label: '名前', limit: L.profName, line: true, ph: '{{user}}' }, x, 'name'),
      f({ label: '簡単な紹介', limit: L.profSummary, rows: 2 }, x, 'summary'),
      f({ label: '説明', limit: L.profDesc, rows: 5 }, x, 'description')));

    const exs = p.examples.map((e, i) => h('div.pcard',
      h('div.pcard-head', h('b', `状況例 ${i + 1}`), ui().rowTools(p.examples, e, redraw, { delLabel: 'この状況例を消す', confirm: 'この状況例を消しますか?' })),
      f({ label: '中身', rows: 6, ph: 'キャラの性格と口調が伝わるやりとりの例' }, e, 'text')));

    const addBtn = (label, list, max, make) => h('button.btn.btn-outline.btn-sm', {
      type: 'button', disabled: list.length >= max, onclick: () => { list.push(make()); redraw(); }
    }, icon('plus'), `${label}(${list.length}/${max})`);

    const el = h('div.ptab',
      promptMeter.el,
      sec('基本設定', null,
        f({ label: '題名', limit: L.title, line: true, sub: 'プロンプトの字数には数えません' }, p, 'title'),
        f({ label: '説明', rows: 6, ph: '状況、関係性、世界観など' }, p, 'description'),
        f({ label: 'ナレーター', sub: '非公開・オプション設定', rows: 4, ph: 'ストーリーを進めるナレーターの設定' }, p, 'narrator')),
      sec('キャラクター', `${p.characters.length}/${Store.MAX.chars}`, ...chars,
        addBtn('キャラクターを足す', p.characters, Store.MAX.chars, () => ({ id: U.uid(), name: '', profile: '', images: [] }))),
      sec('トークプロフィール', 'ユーザーが使うプロフィールです。字数の制限には数えません', ...profs,
        addBtn('トークプロフィールを足す', p.profiles, Store.MAX.profiles, () => ({ id: U.uid(), name: '', summary: '', description: '', image: '' }))),
      sec('状況例', null, exMeter.el, ...exs,
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { p.examples.push({ id: U.uid(), text: '' }); redraw(); } }, icon('plus'), '状況例を足す')));
    totals();
    return el;
  }

  /* ------------------------------------------------ 設定集 */
  function tabLore(ctx) {
    const { p, save } = ctx;
    const redraw = changed(ctx);
    const rows = p.lore.map((l, i) => h('div.pcard',
      h('div.pcard-head', h('b', `設定集 ${i + 1}`), ui().rowTools(p.lore, l, redraw, { delLabel: 'この設定集を消す', confirm: 'この設定集の控えを消しますか?' })),
      ui().field({ label: '名前', line: true, value: l.name, ph: '設定集の名前や作者', onInput: (v) => { l.name = v; save(); } }).el,
      ui().field({ label: 'メモ', rows: 4, value: l.memo, ph: 'キーワードと中身、連動した理由など', onInput: (v) => { l.memo = v; save(); } }).el));
    return h('div.ptab',
      h('p.tab-lead', 'zetaで連動した設定集の名前や、自分の設定集のキーワードと中身を控えておけます。'),
      ...rows,
      h('button.btn.btn-outline.btn-sm', { type: 'button', disabled: p.lore.length >= Store.MAX.lore, onclick: () => { p.lore.push({ id: U.uid(), name: '', memo: '' }); redraw(); } },
        icon('plus'), `設定集を足す(${p.lore.length}/${Store.MAX.lore})`));
  }

  /* ------------------------------------------------ スタイル */
  function tabStyle(ctx) {
    const { p, save } = ctx;
    const st = p.style;
    const item = (it) => {
      if (it.type === 'toggle') {
        return h('label.check.st-toggle', h('input', { type: 'checkbox', checked: st[it.key], onchange: (e) => { st[it.key] = e.target.checked; save(); } }), it.label);
      }
      if (it.type === 'text') {
        return ui().field({ label: it.label, rows: 2, value: st[it.key], ph: '使用しない', onInput: (v) => { st[it.key] = v; save(); } }).el;
      }
      return h('div.st-item', h('p.st-label', it.label, it.max && h('small', `${it.max}つまで`)),
        ui().chips(it.options, () => st[it.key], (v) => { st[it.key] = v; save(); }, it.max));
    };
    return h('div.ptab',
      h('p.tab-lead', 'zetaのスタイルで選んだものを、同じ並びで控えておけます。もう一度押すと外れます。'),
      ...Store.STYLE.map((g) => sec(g.label, null, ...g.items.map(item))),
      sec('メモ', null, ui().field({ label: 'スタイルのメモ', rows: 3, value: st.memo, onInput: (v) => { st.memo = v; save(); } }).el));
  }

  /* ------------------------------------------------ プラグイン */
  function tabPlugin(ctx) {
    const { p, save } = ctx;
    const redraw = changed(ctx);
    const listId = 'plugin-names';
    const rows = p.plugins.map((g, i) => h('div.pcard',
      h('div.pcard-head', h('b', `プラグイン ${i + 1}`), ui().rowTools(p.plugins, g, redraw, { delLabel: 'このプラグインを消す', confirm: 'このプラグインの控えを消しますか?' })),
      h('div.pf', h('div.pf-head', h('label', '名前')),
        h('input', { type: 'text', value: g.name, list: listId, autocomplete: 'off', placeholder: 'エンディング・ティアリストなど', oninput: (e) => { g.name = e.target.value; save(); } })),
      ui().field({ label: '設定の中身', rows: 4, value: g.memo, ph: '登録したイメージの説明・エンディングの条件・ティアの基準など', onInput: (v) => { g.memo = v; save(); } }).el));
    const used = new Set(p.plugins.map((g) => g.name.trim()));
    const quick = Store.PLUGINS.filter((n) => !used.has(n));
    return h('div.ptab',
      h('p.tab-lead', '使っているプラグインと、その設定の中身を控えておけます。'),
      h('datalist', { id: listId }, Store.PLUGINS.map((n) => h('option', { value: n }))),
      ...rows,
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { p.plugins.push({ id: U.uid(), name: '', memo: '' }); redraw(); } }, icon('plus'), 'プラグインを足す'),
      quick.length > 0 && h('details.fold.quick',
        h('summary', '名前から足す', h('small', 'zetaのプラグインの名前')),
        h('div.chips-pick', quick.map((n) => h('button.chip-pick', { type: 'button', onclick: () => { p.plugins.push({ id: U.uid(), name: n, memo: '' }); redraw(); } }, '+ ' + n)))));
  }

  /* ------------------------------------------------ 設定 */
  function tabSetting(ctx) {
    const { p, save } = ctx;
    const toggle = (key, label, sub) => h('label.check.st-toggle',
      h('input', { type: 'checkbox', checked: p.publish[key], onchange: (e) => { p.publish[key] = e.target.checked; save(); } }),
      h('span', label, sub && h('small', sub)));
    return h('div.ptab',
      sec('作成オプション', null, toggle('open', '他のユーザーにプロットを公開する', 'zetaでは、一度公開すると非公開に戻せません')),
      sec('コメント設定', null, toggle('comments', 'コメントの投稿を許可')),
      sec('自分用のメモ', null, ui().field({ label: 'メモ', rows: 6, value: p.memo, ph: '公開した日・直したい所・反応など', onInput: (v) => { p.memo = v; save(); } }).el));
  }

  /* ------------------------------------------------ 前の版 */
  const KIND = { manual: '自分で残した版', open: '開いて書き換える前', restore: '前の版に戻す前' };
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtTime = (at) => { const d = new Date(at); return `${U.fmtDate(at)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

  /** 行ごとの見比べ (a=前の版, b=いま)。[{ t: 'same'|'del'|'add', s }] */
  function lineDiff(a, b) {
    const A = a.split('\n'), B = b.split('\n');
    const n = A.length, m = B.length;
    const T = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) T[i][j] = A[i] === B[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push({ t: 'same', s: A[i] }); i++; j++; }
      else if (T[i + 1][j] >= T[i][j + 1]) out.push({ t: 'del', s: A[i++] });
      else out.push({ t: 'add', s: B[j++] });
    }
    while (i < n) out.push({ t: 'del', s: A[i++] });
    while (j < m) out.push({ t: 'add', s: B[j++] });
    return out;
  }
  /** 前の版といまで違う欄 [{ label, before, after }] */
  function changes(old, now) {
    const a = new Map(Store.fields(old).map((x) => [x.key, x]));
    const b = Store.fields(now);
    const out = [];
    b.forEach((x) => {
      const y = a.get(x.key);
      a.delete(x.key);
      if ((y ? y.text : '') !== x.text) out.push({ label: x.label, before: y ? y.text : '', after: x.text });
    });
    a.forEach((y) => { if (y.text) out.push({ label: y.label + '(いまは無い欄)', before: y.text, after: '' }); });
    return out;
  }

  function historyDialog(p, after) {
    Store.flush();
    let sel = 0;
    const items = h('div.zhist-list', { role: 'listbox', 'aria-label': '前の版' });
    const detail = h('div.zhist-detail');
    const draw = () => {
      const list = p.history;
      items.replaceChildren(...list.map((v, i) => h('button.zhist-item', {
        type: 'button', role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onclick: () => { sel = i; draw(); }
      }, h('b', fmtTime(v.at)), h('small', KIND[v.kind] || '前の版'), h('span', v.data.title || '(題名なし)'))));
      const v = list[sel];
      const diff = changes(v.data, p);
      detail.replaceChildren();
      U.append(detail, [
        h('p.zhist-sum', diff.length ? `いまの中身と違う欄が${diff.length}か所あります。` : 'いまの中身と同じです。画像の並びだけ違うことはあります。'),
        diff.length > 0 && h('p.zhist-legend', h('span.zd-del', 'この版だけにある行'), h('span.zd-add', 'いまの中身だけにある行')),
        h('div.hist-fields', diff.map((d) => h('details.hist-field', { open: diff.length <= 3 },
          h('summary', d.label),
          h('div.zdiff-lines', lineDiff(d.before, d.after).map((x) => h('div.zd-' + x.t, x.s || ' ')))))),
        h('div.zhist-actions',
          h('button.btn.btn-ghost.btn-sm.danger', { type: 'button', onclick: async () => {
            if (!(await U.confirmDialog({ title: '前の版を消す', message: `${fmtTime(v.at)} の版を消しますか?`, okLabel: '消す', danger: true }))) return;
            Store.dropVersion(p, v);
            if (!p.history.length) { ctl.close(); after(); return; }
            sel = Math.min(sel, p.history.length - 1);
            draw();
          } }, icon('trash'), 'この版を消す'),
          h('button.btn.btn-primary.btn-sm', { type: 'button', disabled: !diff.length, onclick: () => {
            Store.restore(p, v);
            ctl.close();
            U.toast('この版に戻しました。戻す前の中身も前の版に残っています');
            after();
          } }, icon('undo'), 'この版に戻す'))]);
    };
    const body = h('div.modal-body',
      h('p.modal-lead', `「版を残す」で残した版と、開いて最初に書き換える前の版を、新しい順に${Store.HISTORY}個まで残しています。戻すと、いまの中身も前の版に残ります。`),
      h('div.zhist', items, detail));
    const ctl = U.openDialog({ title: '前の版', content: body, wide: true });
    draw();
  }

  Views.renderPlot = renderPlot;
})();
