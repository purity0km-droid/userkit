/* user一覧 と userの追加・編集フォーム */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};

  const NO_PLOT = '__none__';
  const filter = { q: '', plot: '' };   // 画面を行き来しても検索条件を保つ

  const parsePartners = (s) =>
    [...new Set(s.split(/[,、，\n]/).map((x) => x.trim()).filter(Boolean))];

  /* ------------------------------------------------ 追加・編集フォーム */
  function openUserForm(user, onSaved) {
    const isNew = !user;
    const draft = user ? JSON.parse(JSON.stringify(user)) : Store.emptyUser();
    const err = h('p.field-error', { role: 'alert' });

    const name = h('input', { type: 'text', id: 'f-name', value: draft.name, maxlength: 60, autocomplete: 'off', required: true });
    const reading = h('input', { type: 'text', id: 'f-reading', value: draft.reading, maxlength: 60, autocomplete: 'off', placeholder: 'あさぎり あかり / Akari Asagiri' });
    const plot =h('input', { type: 'text', id: 'f-plot', value: draft.plot, maxlength: 80, list: 'plot-options', autocomplete: 'off' });
    const plotList = h('datalist', { id: 'plot-options' }, Store.plots().map((p) => h('option', { value: p })));
    const partners = h('input', { type: 'text', id: 'f-partners', value: draft.partners.join('、'), autocomplete: 'off', placeholder: '、で区切って複数入力' });

    // 目印の色 (ラジオのスウォッチ + 自由に選んだ色)
    let own = typeof draft.color === 'string' ? draft.color : null;
    const ownRadio = h('input', { type: 'radio', name: 'color', value: 'own', checked: !!own });
    const ownDot = h('span');
    const ownName = h('em');
    const ownSw = h('label.swatch', ownRadio, ownDot, ownName);
    const showOwn = () => {
      ownSw.hidden = !own;
      if (!own) return;
      ownDot.style.background = own;
      ownName.textContent = own.toUpperCase();
      ownSw.title = `自由に選んだ色 ${ownName.textContent}`;
    };
    showOwn();
    const pickOwn = async () => {
      const cur = form.querySelector('input[name=color]:checked');
      const v = await ColorPick.pick({
        value: cur.value === 'own' ? own : Store.COLORS[cur.value].hex,
        title: '目印の色',
        sources: await imageSources(draft),
        emptyText: 'このuserにはまだ画像がありません。'
      });
      if (!v) return;
      own = v;
      showOwn();
      ownRadio.checked = true;
    };
    const swatches = h('div.swatches', { role: 'radiogroup', 'aria-label': '目印の色' },
      Store.COLORS.map((c, i) => h('label.swatch', { title: c.name },
        h('input', { type: 'radio', name: 'color', value: i, checked: draft.color === i }),
        h('span', { style: { background: c.hex } }),
        h('em', c.name))),
      ownSw,
      h('button.swatch-pick', { type: 'button', title: '好きな色を選ぶ(カラーコード・パレット・画像からスポイト)', onclick: pickOwn },
        icon('palette', 16), '自由に選ぶ'));

    // 詳しいプロフィール
    const detailInputs = {};
    const detailGrid = h('div.grid-2');
    Store.FIELDS.forEach((f) => {
      const el = f.long
        ? h('textarea', { id: 'f-' + f.key, rows: 2, value: draft[f.key] })
        : h('input', { type: 'text', id: 'f-' + f.key, value: draft[f.key], autocomplete: 'off' });
      detailInputs[f.key] = el;
      detailGrid.append(h('div.field' + (f.long ? '.span-2' : ''), h('label', { for: 'f-' + f.key }, f.label), el));
    });

    // 自分で足す項目 (項目名と中身)
    const extraRows = [];
    const extraList = h('div.extra-list');
    const addExtra = (x, focus) => {
      const label = h('input', { type: 'text', value: x.label, maxlength: 30, autocomplete: 'off', placeholder: '項目名', 'aria-label': '項目名' });
      const value = h('textarea', { rows: 1, value: x.value, placeholder: '中身', 'aria-label': '中身' });
      const row = { id: x.id, label, value };
      const el = h('div.extra-row', label, value,
        h('button.btn.btn-ghost.btn-icon.danger', { type: 'button', title: 'この項目を消す', 'aria-label': 'この項目を消す', onclick: () => {
          extraRows.splice(extraRows.indexOf(row), 1);
          el.remove();
        } }, icon('trash')));
      row.el = el;
      extraRows.push(row);
      extraList.append(el);
      if (focus) label.focus();
    };
    draft.extra.forEach((x) => addExtra(x));
    const extraBox = h('div.extra.span-2',
      h('p.label', '自分で足した項目', h('small', '血液型・口癖・特技など')),
      extraList,
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addExtra({ id: U.uid(), label: '', value: '' }, true) },
        icon('plus'), '項目を足す'));
    detailGrid.append(extraBox);

    const filled = Store.FIELDS.some((f) => draft[f.key].trim()) || draft.extra.length > 0;
    const details = h('details.fold', { open: filled },
      h('summary', '詳しいプロフィール', h('small', '年齢・性格・見た目など')),
      detailGrid);

    const bio = h('textarea', { id: 'f-bio', rows: 5, placeholder: '生い立ち、相手との関係、秘密など', value: draft.bio });

    const form = h('form.modal-body', { novalidate: true },
      h('p.modal-lead', '必須なのは名前だけです。画像は保存したあとに「画像」から追加できます。'),
      h('div.grid-2',
        h('div.field', h('label', { for: 'f-name' }, '名前', h('b.req', '必須')), name),
        h('div.field', h('label', { for: 'f-reading' }, '読み', h('small', 'ふりがな・英字')), reading),
        h('div.field', h('label', { for: 'f-plot' }, 'プロット名', h('small', '物語・トークの設定')), plot, plotList),
        h('div.field', h('label', { for: 'f-partners' }, '相手キャラ', h('small', '複数可')), partners),
        h('div.field.span-2', h('span.label', '目印の色'), swatches)),
      details,
      h('div.field', h('label', { for: 'f-bio' }, '自由メモ・背景設定'), bio),
      err,
      h('div.modal-foot',
        h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, icon('close'), 'キャンセル'),
        h('button.btn.btn-primary', { type: 'submit' }, icon('save'), '保存する')));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!name.value.trim()) {
        err.textContent = '名前を入力してください。';
        name.focus();
        return;
      }
      const extra = extraRows.map((r) => ({ id: r.id, label: r.label.value.trim(), value: r.value.value.trim() }))
        .filter((x) => x.label || x.value);
      const noLabel = extra.findIndex((x) => !x.label);
      if (noLabel >= 0) {
        details.open = true;
        err.textContent = '足した項目の項目名を入力してください。';
        extraRows.find((r) => r.id === extra[noLabel].id).label.focus();
        return;
      }
      draft.name = name.value.trim();
      draft.reading = reading.value.trim();
      draft.plot = plot.value.trim();
      draft.partners = parsePartners(partners.value);
      const c = form.querySelector('input[name=color]:checked').value;
      draft.color = c === 'own' ? own : Number(c);
      Store.FIELDS.forEach((f) => { draft[f.key] = detailInputs[f.key].value.trim(); });
      draft.extra = extra;
      draft.bio = bio.value.trim();
      if (!Store.saveUser(draft)) return;
      ctl.close();
      U.toast(isNew ? 'userを追加しました' : '保存しました');
      if (onSaved) onSaved(draft);
    });

    const ctl = U.openDialog({ title: isNew ? 'userを追加' : 'userを編集', content: form, wide: true });
    name.focus();
  }
  Views.openUserForm = openUserForm;

  /** user の画像を、色のスポイト用に [{ src, label }] で返す */
  async function imageSources(u) {
    const list = await Promise.all(u.images.map(async (im, i) => ({
      src: await Images.url(im.id).catch(() => null),
      label: im.caption || (i === 0 ? 'アイコン' : `画像${i + 1}`)
    })));
    return list.filter((x) => x.src);
  }

  /* ------------------------------------------------ 一覧 */
  /** 検索で見る中身。[見出し, 文]。先頭のほう(名前・プロット・相手)はカードに出ているので、当たった所を出さない */
  function searchParts(u) {
    return [
      [null, [u.name, u.reading, u.plot, u.partners.join(' ')].join(' ')],
      ...Store.FIELDS.map((f) => [f.label, u[f.key]]),
      ...u.extra.map((x) => [x.label || '項目', x.value]),
      ['自由メモ', u.bio],
      ...u.timeline.map((t) => ['年表', [t.when, t.title, t.text].filter(Boolean).join(' ')]),
      ...u.notes.map((n) => [`設定メモ「${n.title || 'メモ'}」`, n.text]),
      ['zetaに貼る文章', u.zeta.text],
      ['zetaプロフの元の文章', u.zeta.source]
    ].filter(([, t]) => t && t.trim());
  }
  /** 当たらなければ null。当たれば、カードに出す一言 { label, before, hit, after }(名前などで当たったときは hit なし) */
  function matches(u, q) {
    if (!q) return {};
    const parts = searchParts(u).map(([label, t]) => {
      const flat = t.replace(/\s+/g, ' ');
      const n = U.norm(flat);
      return { label, text: n.length === flat.length ? flat : n, n };   // 正規化で字数が変わったら正規化した文で切り出す
    });
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.every((w) => parts.some((p) => p.n.includes(w)))) return null;
    const head = parts[0] && parts[0].label === null ? parts[0] : null;
    const w = words.find((x) => !(head && head.n.includes(x)));
    const p = w && parts.find((x) => x.label !== null && x.n.includes(w));
    if (!p) return {};
    const i = p.n.indexOf(w);
    const from = Math.max(0, i - 12);
    return {
      label: p.label,
      before: (from > 0 ? '…' : '') + p.text.slice(from, i),
      hit: p.text.slice(i, i + w.length),
      after: p.text.slice(i + w.length, i + w.length + 24) + (i + w.length + 24 < p.text.length ? '…' : '')
    };
  }

  function userCard(u, found) {
    const meta = [u.age && `${u.age}`.replace(/歳$/, '') + '歳', u.gender, u.occupation].filter(Boolean).join(' / ');
    return h('a.card', { href: `#/user/${u.id}`, style: Store.markStyle(u) },
      h('span.card-avatar', { 'data-avatar': u.images[0] ? u.images[0].id : '' }, u.name.slice(0, 1)),
      h('span.card-main',
        h('strong.card-name', u.name),
        meta && h('span.card-meta', meta),
        u.partners.length > 0 && h('span.card-partners', icon('link', 14), u.partners.join('、'))),
      found && found.hit && h('span.card-hit',
        h('b', found.label), h('span', found.before, h('mark', found.hit), found.after)),
      h('span.card-date', U.fmtDate(u.updatedAt)));
  }

  /** 前のバックアップから日がたっているときの案内 */
  function backupNudge() {
    if (!Store.backupDue()) return null;
    const last = Store.backupAt();
    const days = last ? Math.floor((Date.now() - last) / 86400000) : 0;
    const box = h('div.notice.nudge',
      h('p', last
        ? `前回のバックアップから${days}日たち、その後に書き換えた user があります。ブラウザのデータを消すと失われるので、バックアップを保存しておくと安心です。`
        : 'まだバックアップを保存していません。ブラウザのデータを消すと失われるので、一度保存しておくと安心です。'),
      h('div.nudge-actions',
        h('a.btn.btn-primary.btn-sm', { href: '#/backup' }, icon('download'), 'バックアップへ'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { Store.snoozeBackup(); box.remove(); } }, 'あとで')));
    return box;
  }

  function renderList(app) {
    const all = Store.users();
    const plots = Store.plots();
    if (filter.plot && filter.plot !== NO_PLOT && !plots.includes(filter.plot)) filter.plot = '';

    const q = h('input', { type: 'search', id: 'q', value: filter.q, placeholder: '名前や設定メモの中身などで探す', autocomplete: 'off' });
    const sel = h('select', { id: 'plot-filter' },
      h('option', { value: '' }, 'すべてのプロット'),
      plots.map((p) => h('option', { value: p, selected: filter.plot === p }, p)),
      all.some((u) => !u.plot.trim()) && h('option', { value: NO_PLOT, selected: filter.plot === NO_PLOT }, 'プロット未設定'));
    const count = h('p.count');
    const results = h('div');

    const draw = () => {
      const q2 = U.norm(filter.q.trim());
      const found = new Map();
      const hit = all.filter((u) => {
        if (filter.plot === NO_PLOT && u.plot.trim()) return false;
        if (filter.plot && filter.plot !== NO_PLOT && u.plot.trim() !== filter.plot) return false;
        const m = matches(u, q2);
        if (m) found.set(u, m);
        return !!m;
      });
      count.textContent = `${hit.length} 人のuser` + (hit.length !== all.length ? `(全${all.length}人)` : '');
      results.replaceChildren();
      if (!all.length) {
        results.append(h('div.empty',
          h('div.empty-icon', icon('bubble', 34)),
          h('h3', 'userを登録してみよう'),
          h('p', 'まずは名前とプロット名だけで大丈夫です。設定はあとから追加できます。'),
          h('button.btn.btn-primary', { type: 'button', onclick: () => openUserForm(null, afterSave) }, icon('plus'), 'userを追加')));
      } else if (!hit.length) {
        results.append(h('div.empty.small', h('p', '条件に合うuserが見つかりません。')));
      } else {
        // プロットごとにまとめて表示
        const groups = new Map();
        hit.forEach((u) => {
          const key = u.plot.trim() || '';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(u);
        });
        const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'ja')));
        keys.forEach((k) => results.append(
          h('section.plot-group',
            h('h3.plot-title', h('span', k || 'プロット未設定'), h('small', `${groups.get(k).length}人`)),
            h('div.cards', groups.get(k).map((u) => userCard(u, found.get(u)))))));
        Views.hydrateAvatars(results);
      }
    };
    const afterSave = (u) => { location.hash = `#/user/${u.id}`; };

    q.addEventListener('input', () => { filter.q = q.value; draw(); });
    sel.addEventListener('change', () => { filter.plot = sel.value; draw(); });

    app.replaceChildren(
      h('nav.crumbs', { 'aria-label': 'パンくず' }, h('span', '現在地'), h('strong', 'user一覧')),
      h('div.page-head',
        h('div', h('h1', 'user一覧'), h('p.lead', 'プロットごとにプロフィールをまとめられます。')),
        h('button.btn.btn-primary', { type: 'button', onclick: () => openUserForm(null, afterSave) }, icon('plus'), 'userを追加')),
      ...[backupNudge()].filter(Boolean),
      h('div.panel.filters',
        h('div.field', h('label', { for: 'q' }, 'userを探す'), q),
        h('div.field', h('label', { for: 'plot-filter' }, 'プロットで絞り込む'), sel)),
      h('p.hint', 'user＝トークで使う自分のキャラクター ／ プロット＝物語・トークの設定'),
      count, results);
    draw();
  }

  /** data-avatar に画像IDがあるものへ画像を流し込む */
  Views.hydrateAvatars = function (root) {
    root.querySelectorAll('[data-avatar]').forEach(async (el) => {
      const id = el.dataset.avatar;
      if (!id) return;
      try {
        const url = await Images.url(id);
        if (url) { el.style.backgroundImage = `url("${url}")`; el.classList.add('has-img'); el.textContent = ''; }
      } catch (e) { /* 文字アバターのまま */ }
    });
  };

  Views.renderList = renderList;
})();
