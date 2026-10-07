/* バックアップ: 書き出し / 読み込み */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};

  function renderBackup(app, msg) {
    const n = Store.users().length;
    const result = h('p.result' + (msg ? '.' + msg.kind : ''), { role: 'status' }, msg && msg.text);
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });

    const doExport = async (btn) => {
      btn.disabled = true;
      try {
        U.download(`userprof-backup-${U.stamp()}.json`, await Store.exportBackup());
        U.toast('バックアップを保存しました');
      } catch (e) {
        console.error(e);
        U.toast('バックアップを作れませんでした', 'error');
      } finally { btn.disabled = false; }
    };

    file.addEventListener('change', async () => {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      result.className = 'result';
      try {
        const { added, skipped } = await Store.importBackup(await f.text());
        renderBackup(app, {
          kind: 'ok',
          text: `${added}人のuserを追加しました` + (skipped ? `(登録済みの${skipped}人はそのまま残しています)` : '。')
        });
      } catch (e) {
        result.textContent = e.message;
        result.classList.add('bad');
      }
    });

    const exportBtn = h('button.btn.btn-primary', { type: 'button', onclick: (e) => doExport(e.currentTarget) },
      icon('download'), 'バックアップを保存');

    app.replaceChildren(
      h('nav.crumbs', { 'aria-label': 'パンくず' }, h('span', '現在地'), h('strong', 'バックアップ')),
      h('div.page-head', h('div', h('h1', 'バックアップ'),
        h('p.lead', 'バックアップ＝データを復元するための予備のファイルです。'))),
      h('div.notice',
        h('p', 'データは、「保存する」を押すと、この端末・ブラウザに保存されます。zetaとの自動連携や端末間の自動同期はありません。ブラウザのデータを消すと失われるため、定期的にバックアップしてください。')),
      h('section.panel.backup-card',
        h('h2', 'バックアップを書き出す'),
        h('p', `全${n}人のプロフィール・年表・設定メモ・画像を、ひとつの復元用ファイル(JSON形式)に保存します。`),
        exportBtn),
      h('section.panel.backup-card',
        h('h2', 'バックアップを読み込む'),
        h('p', '別の端末へ移すときもこちらから。すでに登録済みのuserはそのまま残し、未登録のuserだけ追加します。'),
        file,
        h('button.btn.btn-outline', { type: 'button', onclick: () => file.click() }, icon('upload'), '復元用ファイルを選ぶ'),
        result),
      h('section.panel.howto',
        h('h2', '使い方'),
        h('ol',
          h('li', 'user一覧でuserとプロット名を登録'),
          h('li', 'userを開いて、年表や設定メモを追加'),
          h('li', '「コピー」で必要な設定をzetaへ貼り付け'))));
  }

  Views.renderBackup = renderBackup;
})();
