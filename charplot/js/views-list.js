/* プロット一覧 */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};

  const filter = { q: '' };   // 画面を行き来しても検索条件を保つ

  /** 当たらなければ null。当たれば、カードに出す一言 { label, before, hit, after }(題名などで当たったときは hit なし) */
  function matches(p, q) {
    if (!q) return {};
    const parts = Store.fields(p).filter((x) => x.text.trim()).map((x) => {
      const flat = x.text.replace(/\s+/g, ' ');
      const n = U.norm(flat);
      return { label: x.label, key: x.key, text: n.length === flat.length ? flat : n, n };
    });
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.every((w) => parts.some((x) => x.n.includes(w)))) return null;
    const head = parts.filter((x) => x.key === 'title' || x.key === 'short');
    const w = words.find((x) => !head.some((y) => y.n.includes(x)));
    const x = w && parts.find((y) => y.key !== 'title' && y.key !== 'short' && y.n.includes(w));
    if (!x) return {};
    const i = x.n.indexOf(w);
    const from = Math.max(0, i - 12);
    return {
      label: x.label,
      before: (from > 0 ? '…' : '') + x.text.slice(from, i),
      hit: x.text.slice(i, i + w.length),
      after: x.text.slice(i + w.length, i + w.length + 24) + (i + w.length + 24 < x.text.length ? '…' : '')
    };
  }

  function plotCard(p, found) {
    const cover = p.cover[0] || (p.characters[0] && p.characters[0].images[0]) || '';
    const names = p.characters.map((c) => c.name.trim()).filter(Boolean);
    return h('a.card', { href: `#/plot/${p.id}/prompt` },
      h('span.card-cover', { 'data-img': cover || null }, !cover && icon('image', 22)),
      h('span.card-main',
        h('strong.card-name', p.title.trim() || '(題名なし)'),
        p.short.trim() && h('span.card-meta', p.short),
        names.length > 0 && h('span.card-partners', icon('user', 14), names.join('、'))),
      found && found.hit && h('span.card-hit', h('b', found.label), h('span', found.before, h('mark', found.hit), found.after)),
      h('span.card-date', U.fmtDate(p.updatedAt)));
  }

  function backupNudge() {
    if (!Store.backupDue()) return null;
    const last = Store.backupAt();
    const days = last ? Math.floor((Date.now() - last) / 86400000) : 0;
    const box = h('div.notice.nudge',
      h('p', last
        ? `前回のバックアップから${days}日たち、その後に書き換えたプロットがあります。ブラウザのデータを消すと失われるので、バックアップを保存しておくと安心です。`
        : 'まだバックアップを保存していません。ブラウザのデータを消すと失われるので、一度保存しておくと安心です。'),
      h('div.nudge-actions',
        h('a.btn.btn-primary.btn-sm', { href: '#/backup' }, icon('download'), 'バックアップへ'),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { Store.snoozeBackup(); box.remove(); } }, 'あとで')));
    return box;
  }

  const addPlot = () => {
    const p = Store.create();
    location.hash = `#/plot/${p.id}/prompt`;
  };

  function renderList(app) {
    const all = Store.all();
    const q = h('input', { type: 'search', id: 'q', value: filter.q, placeholder: '題名・キャラの名前・紹介文の中身などで探す', autocomplete: 'off' });
    const count = h('p.count');
    const results = h('div');

    const draw = () => {
      const q2 = U.norm(filter.q.trim());
      const found = new Map();
      const hit = all.filter((p) => { const m = matches(p, q2); if (m) found.set(p, m); return !!m; });
      count.textContent = `${hit.length} 本のプロット` + (hit.length !== all.length ? `(全${all.length}本)` : '');
      results.replaceChildren();
      if (!all.length) {
        results.append(h('div.empty',
          h('div.empty-icon', icon('book', 34)),
          h('h3', 'プロットを登録してみよう'),
          h('p', 'zetaの編集画面から、題名や説明などを1つずつコピーして貼り付けます。全部そろっていなくても大丈夫です。'),
          h('button.btn.btn-primary', { type: 'button', onclick: addPlot }, icon('plus'), 'プロットを追加')));
      } else if (!hit.length) {
        results.append(h('div.empty.small', h('p', '条件に合うプロットが見つかりません。')));
      } else {
        results.append(h('div.cards', hit.map((p) => plotCard(p, found.get(p)))));
        Views.ui.hydrate(results);
      }
    };
    q.addEventListener('input', () => { filter.q = q.value; draw(); });

    app.replaceChildren(
      h('nav.crumbs', { 'aria-label': 'パンくず' }, h('span', '現在地'), h('strong', 'プロット一覧')),
      h('div.page-head',
        h('div', h('h1', 'プロット一覧'), h('p.lead', 'zetaのプロットを編集画面と同じタブの並びで手元に残せます。')),
        h('button.btn.btn-primary', { type: 'button', onclick: addPlot }, icon('plus'), 'プロットを追加')),
      ...[backupNudge(), all.length > 0 && h('div.panel.filters', h('div.field', h('label', { for: 'q' }, 'プロットを探す'), q))].filter(Boolean),
      count, results);
    draw();
  }

  Views.renderList = renderList;
})();
