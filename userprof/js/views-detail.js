/* userの詳細: プロフィール / 年表 / 設定メモ / 画像 */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};

  const TABS = [
    { id: 'profile', label: 'プロフィール', icon: 'user' },
    { id: 'zeta', label: 'zetaプロフ', icon: 'file' },
    { id: 'timeline', label: '年表', icon: 'list' },
    { id: 'notes', label: '設定メモ', icon: 'edit' },
    { id: 'images', label: '画像', icon: 'image' }
  ];

  /* ------------------------------------------------ 小さな部品 */
  const copyBtn = (getText, label, cls) => h('button.btn.btn-outline.btn-sm' + (cls || ''), {
    type: 'button',
    onclick: () => {
      const t = typeof getText === 'function' ? getText() : getText;
      t ? U.copyText(t) : U.toast('コピーする内容がありません', 'error');
    }
  }, icon('copy'), label || 'コピー');

  const iconBtn = (name, label, onclick, extra) => h('button.btn.btn-ghost.btn-icon' + (extra || ''), {
    type: 'button', title: label, 'aria-label': label, onclick
  }, icon(name));

  function sectionHead(title, ...actions) {
    return h('div.sec-head', h('h2', title), h('div.sec-actions', actions));
  }
  const emptyBox = (msg, action) => h('div.empty.small', h('p', msg), action);

  /** 入力ダイアログ (年表・メモ用) */
  function entryDialog({ title, fields, values, onSubmit }) {
    const inputs = {};
    const err = h('p.field-error', { role: 'alert' });
    const form = h('form.modal-body', { novalidate: true },
      fields.map((f) => {
        const id = 'e-' + f.key;
        const el = f.long
          ? h('textarea', { id, rows: f.rows || 5, value: values[f.key] || '', placeholder: f.placeholder })
          : h('input', { type: 'text', id, value: values[f.key] || '', placeholder: f.placeholder, autocomplete: 'off' });
        inputs[f.key] = el;
        return h('div.field', h('label', { for: id }, f.label, f.hint && h('small', f.hint)), el);
      }),
      err,
      h('div.modal-foot',
        h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, 'キャンセル'),
        h('button.btn.btn-primary', { type: 'submit' }, icon('save'), '保存する')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach((f) => { out[f.key] = inputs[f.key].value.trim(); });
      const msg = fields.find((f) => f.required && !out[f.key]);
      if (msg) { err.textContent = `${msg.label}を入力してください。`; inputs[msg.key].focus(); return; }
      if (fields.every((f) => !out[f.key])) { err.textContent = '何か入力してください。'; return; }
      onSubmit(out);
      ctl.close();
    });
    const ctl = U.openDialog({ title, content: form });
    inputs[fields[0].key].focus();
  }

  function move(arr, i, d) {
    const j = i + d;
    if (j < 0 || j >= arr.length) return false;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return true;
  }

  /* ------------------------------------------------ プロフィール */
  function tabProfile(u, refresh) {
    const rows = Store.FIELDS.filter((f) => u[f.key].trim());
    const wrap = h('div');
    wrap.append(sectionHead('プロフィール',
      copyBtn(() => Store.text.profile(u), '全項目をコピー'),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => Views.openUserForm(u, refresh) }, icon('edit'), '編集')));

    if (!rows.length && !u.bio.trim()) {
      wrap.append(emptyBox('まだ詳しいプロフィールがありません。',
        h('button.btn.btn-primary', { type: 'button', onclick: () => Views.openUserForm(u, refresh) }, icon('edit'), 'プロフィールを入力')));
      return wrap;
    }
    const grid = h('dl.facts');
    rows.forEach((f) => grid.append(
      h('div.fact' + (f.long ? '.wide' : ''),
        h('dt', f.label, h('button.mini-copy', {
          type: 'button', title: `${f.label}をコピー`, 'aria-label': `${f.label}をコピー`,
          onclick: () => U.copyText(Store.text.profile(u, [f.key]))
        }, icon('copy', 14))),
        h('dd', u[f.key]))));
    wrap.append(grid);
    if (u.bio.trim()) {
      wrap.append(h('div.bio',
        h('h3', '自由メモ・背景設定', h('button.mini-copy', {
          type: 'button', title: 'コピー', 'aria-label': '自由メモをコピー', onclick: () => U.copyText(u.bio)
        }, icon('copy', 14))),
        h('p', u.bio)));
    }
    return wrap;
  }

  /* ------------------------------------------------ 年表 */
  function tabTimeline(u, refresh) {
    const edit = (t) => entryDialog({
      title: t ? '年表を編集' : '年表を追加',
      values: t || {},
      fields: [
        { key: 'when', label: '時期', hint: '例: 10歳 / 2019年春 / 入学前', placeholder: '10歳' },
        { key: 'title', label: '出来事', required: true, placeholder: '転校して最初の友達ができた' },
        { key: 'text', label: '詳細', long: true, rows: 4 }
      ],
      onSubmit: (v) => {
        if (t) Object.assign(t, v); else u.timeline.push({ id: U.uid(), ...v });
        Store.touch(u); refresh();
      }
    });
    const wrap = h('div');
    wrap.append(sectionHead('年表',
      copyBtn(() => Store.text.timeline(u), '年表をコピー'),
      h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => edit(null) }, icon('plus'), '追加')));
    if (!u.timeline.length) {
      wrap.append(emptyBox('生い立ちや出来事を、時系列で書き留められます。',
        h('button.btn.btn-primary', { type: 'button', onclick: () => edit(null) }, icon('plus'), '年表を追加')));
      return wrap;
    }
    const list = h('ol.timeline');
    u.timeline.forEach((t, i) => list.append(h('li.tl-item',
      h('div.tl-body',
        h('div.tl-top', t.when && h('span.tl-when', t.when), h('strong', t.title)),
        t.text && h('p', t.text)),
      h('div.row-actions',
        iconBtn('up', '上へ', () => { if (move(u.timeline, i, -1)) { Store.touch(u); refresh(); } }, i === 0 ? '.is-off' : ''),
        iconBtn('down', '下へ', () => { if (move(u.timeline, i, 1)) { Store.touch(u); refresh(); } }, i === u.timeline.length - 1 ? '.is-off' : ''),
        iconBtn('edit', '編集', () => edit(t)),
        iconBtn('trash', '削除', async () => {
          if (await U.confirmDialog({ title: '年表を削除', message: `「${t.title || t.when}」を削除しますか?`, okLabel: '削除する', danger: true })) {
            u.timeline.splice(i, 1); Store.touch(u); refresh();
          }
        }, '.danger')))));
    wrap.append(list);
    return wrap;
  }

  /* ------------------------------------------------ 設定メモ */
  function tabNotes(u, refresh) {
    const edit = (n) => entryDialog({
      title: n ? '設定メモを編集' : '設定メモを追加',
      values: n || {},
      fields: [
        { key: 'title', label: 'タイトル', placeholder: '口調・話し方 / 秘密 / 約束事 など' },
        { key: 'text', label: '内容', long: true, rows: 8, required: true }
      ],
      onSubmit: (v) => {
        if (n) Object.assign(n, v); else u.notes.push({ id: U.uid(), ...v });
        Store.touch(u); refresh();
      }
    });
    const wrap = h('div');
    wrap.append(sectionHead('設定メモ',
      copyBtn(() => Store.text.notes(u), 'すべてコピー'),
      h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => edit(null) }, icon('plus'), '追加')));
    if (!u.notes.length) {
      wrap.append(emptyBox('口調や秘密、約束事など、プロフィールに収まらない設定を残せます。',
        h('button.btn.btn-primary', { type: 'button', onclick: () => edit(null) }, icon('plus'), '設定メモを追加')));
      return wrap;
    }
    u.notes.forEach((n, i) => wrap.append(h('article.note',
      h('div.note-head',
        h('h3', n.title || 'メモ'),
        h('div.row-actions',
          iconBtn('copy', 'コピー', () => U.copyText(`【${n.title || 'メモ'}】\n${n.text}`)),
          iconBtn('up', '上へ', () => { if (move(u.notes, i, -1)) { Store.touch(u); refresh(); } }, i === 0 ? '.is-off' : ''),
          iconBtn('down', '下へ', () => { if (move(u.notes, i, 1)) { Store.touch(u); refresh(); } }, i === u.notes.length - 1 ? '.is-off' : ''),
          iconBtn('edit', '編集', () => edit(n)),
          iconBtn('trash', '削除', async () => {
            if (await U.confirmDialog({ title: '設定メモを削除', message: `「${n.title || 'メモ'}」を削除しますか?`, okLabel: '削除する', danger: true })) {
              u.notes.splice(i, 1); Store.touch(u); refresh();
            }
          }, '.danger'))),
      h('p', n.text))));
    return wrap;
  }

  /* ------------------------------------------------ 画像 */
  function tabImages(u, refresh) {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    const addFiles = async (files) => {
      const list = [...files].filter((f) => f.type.startsWith('image/'));
      if (!list.length) return U.toast('画像ファイルを選んでください', 'error');
      let ok = 0;
      for (const f of list) {
        try {
          const id = U.uid();
          await Images.put(id, await Images.fromFile(f));
          u.images.push({ id, caption: '' });
          ok++;
        } catch (e) { console.error(e); U.toast(`「${f.name}」を追加できませんでした`, 'error'); }
      }
      if (ok) { Store.touch(u); U.toast(`${ok}枚の画像を追加しました`); refresh(); }
    };
    input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });

    const pick = () => input.click();
    const wrap = h('div');
    wrap.append(sectionHead('画像', input,
      h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: pick }, icon('upload'), '画像を追加')));

    const drop = h('div.dropzone', { tabindex: 0, role: 'button', 'aria-label': '画像を追加', onclick: pick,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } },
      icon('image', 26), h('p', '画像をここにドロップ、またはクリックして選択'),
      h('small', '長辺1280pxに縮小してブラウザ内に保存します。先頭の画像がアイコンになります。'));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));
    wrap.append(drop);

    if (u.images.length) {
      const grid = h('div.gallery');
      u.images.forEach((im, i) => {
        const pic = h('button.pic', { type: 'button', 'aria-label': '拡大して見る', 'data-avatar': im.id });
        pic.addEventListener('click', async () => {
          const url = await Images.url(im.id);
          if (url) U.openDialog({ title: im.caption || '画像', wide: true, content: h('div.modal-body.lightbox', h('img', { src: url, alt: im.caption || u.name })) });
        });
        grid.append(h('figure.shot',
          pic,
          h('figcaption',
            h('button.caption', { type: 'button', title: 'キャプションを編集', onclick: () => entryDialog({
              title: 'キャプション', values: { caption: im.caption },
              fields: [{ key: 'caption', label: 'キャプション', placeholder: '例: 制服姿 / 3年後' }],
              onSubmit: (v) => { im.caption = v.caption; Store.touch(u); refresh(); }
            }) }, im.caption || 'キャプションを追加'),
            h('div.row-actions',
              i === 0 ? h('span.badge', icon('star', 14), 'アイコン')
                : iconBtn('star', 'アイコンにする', () => { u.images.unshift(u.images.splice(i, 1)[0]); Store.touch(u); refresh(); }),
              iconBtn('trash', '削除', async () => {
                if (await U.confirmDialog({ title: '画像を削除', message: 'この画像を削除しますか?', okLabel: '削除する', danger: true })) {
                  await Images.remove(im.id).catch(() => {});
                  u.images.splice(i, 1); Store.touch(u); refresh();
                }
              }, '.danger')))));
      });
      wrap.append(grid);
      Views.hydrateGallery(grid);
    }
    return wrap;
  }
  Views.hydrateGallery = function (root) {
    root.querySelectorAll('.pic[data-avatar]').forEach(async (el) => {
      const url = await Images.url(el.dataset.avatar).catch(() => null);
      if (url) el.style.backgroundImage = `url("${url}")`;
    });
  };

  /* ------------------------------------------------ 詳細画面 */
  function renderDetail(app, id, tabId) {
    const u = Store.getUser(id);
    if (!u) {
      app.replaceChildren(
        h('nav.crumbs', h('span', '現在地'), h('a', { href: '#/' }, 'user一覧')),
        emptyBox('このuserは見つかりませんでした。', h('a.btn.btn-primary', { href: '#/' }, 'user一覧へ戻る')));
      return;
    }
    const tab = TABS.some((t) => t.id === tabId) ? tabId : 'profile';
    const refresh = () => {
      const y = window.scrollY;
      renderDetail(app, id, tab);
      window.scrollTo(0, y);
    };

    const avatar = h('span.hero-avatar', { 'data-avatar': u.images[0] ? u.images[0].id : '' }, u.name.slice(0, 1));
    const hero = h('header.hero', { style: Store.markStyle(u) },
      avatar,
      h('div.hero-main',
        h('h1', u.name),
        h('div.chips',
          h('span.chip.chip-plot', u.plot || 'プロット未設定'),
          u.partners.map((p) => h('span.chip', icon('link', 13), p))),
        h('p.hero-date', `更新 ${U.fmtDate(u.updatedAt)}`)),
      h('div.hero-actions',
        copyBtn(() => Store.text.all(u), '全部コピー'),
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => Views.openUserForm(u, refresh) }, icon('edit'), '編集'),
        h('button.btn.btn-outline.btn-sm.btn-danger-o', { type: 'button', onclick: async () => {
          if (await U.confirmDialog({ title: 'userを削除', message: `「${u.name}」のプロフィール・zetaプロフ・年表・設定メモ・画像をすべて削除します。元に戻せません。`, okLabel: '削除する', danger: true })) {
            await Store.deleteUser(u.id);
            U.toast('削除しました');
            location.hash = '#/';
          }
        } }, icon('trash'), '削除')));

    const tabs = h('div.tabs', { role: 'tablist' }, TABS.map((t) => h('a.tab' + (t.id === tab ? '.active' : ''), {
      href: `#/user/${u.id}/${t.id}`, role: 'tab', 'aria-selected': t.id === tab ? 'true' : 'false'
    }, icon(t.icon, 16), t.label)));

    const panel = h('section.panel.tab-panel', { role: 'tabpanel' });
    panel.append(({
      profile: () => tabProfile(u, refresh),
      zeta: () => Views.tabZeta(u, refresh),
      timeline: () => tabTimeline(u, refresh),
      notes: () => tabNotes(u, refresh),
      images: () => tabImages(u, refresh)
    })[tab]());

    app.replaceChildren(
      h('nav.crumbs', { 'aria-label': 'パンくず' }, h('span', '現在地'), h('a', { href: '#/' }, 'user一覧'), h('strong', u.name)),
      hero, tabs, panel);
    Views.hydrateAvatars(hero);
  }

  Views.renderDetail = renderDetail;
})();
