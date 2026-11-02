/* バックアップ: 書き出し / 読み込み / 消されにくくする */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};

  /** 登録済みのプロットのうち、ファイルの方が新しいプロットを置き換えるか聞く。true=置き換える */
  function askReplace(newer) {
    return new Promise((resolve) => {
      let result = false;
      const names = newer.map((p) => p.title || '(題名なし)');
      const body = h('div.modal-body',
        h('p.confirm-msg', `次の${newer.length}本はこの端末にもあり、ファイルの方が新しく書き換えられています。ファイルの中身に置き換えますか?`),
        h('ul.replace-names', names.slice(0, 12).map((n) => h('li', n)), names.length > 12 && h('li', `ほか${names.length - 12}本`)),
        h('p.hint', '置き換えると、そのプロットの全部のタブ・前の版・画像が、ファイルの中身と同じになります。プロットごとに丸ごと置き換えるので、この端末だけで書き足した所は消えます。'),
        h('div.modal-foot.replace-foot',
          h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, 'この端末の中身を残す'),
          h('button.btn.btn-primary', { type: 'button', onclick: () => { result = true; ctl.close(); } }, 'ファイルの中身に置き換える')));
      const ctl = U.openDialog({ title: '新しい方に置き換える', content: body, onClose: () => resolve(result) });
    });
  }

  /** サイドバーの下の、前回のバックアップの日付 */
  Views.drawBackupAt = function () {
    const el = document.getElementById('backup-at');
    const at = Store.backupAt();
    if (el) el.textContent = at ? `バックアップ ${U.fmtDate(at)}` : 'バックアップ まだ';
  };

  function lastBackupText() {
    const at = Store.backupAt();
    if (!at) return 'まだバックアップを保存していません。';
    const days = Math.floor((Date.now() - at) / 86400000);
    return `前回のバックアップ: ${U.fmtDate(at)}(${days ? `${days}日前` : '今日'})`;
  }

  function renderBackup(app, msg) {
    const n = Store.all().length;
    const result = h('p.result' + (msg ? '.' + msg.kind : ''), { role: 'status' }, msg && msg.text);
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    const last = h('p.backup-last', lastBackupText());

    const doExport = async (btn) => {
      btn.disabled = true;
      try {
        U.download(`charplot-backup-${U.stamp()}.json`, await Store.exportBackup());
        Store.markBackup();
        last.textContent = lastBackupText();
        Views.drawBackupAt();
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
        const plan = Store.readBackup(await f.text());
        const replace = plan.newer.length ? await askReplace(plan.newer) : false;
        const { added, replaced, kept } = await Store.applyBackup(plan, replace);
        const parts = [added && `${added}本のプロットを追加しました`, replaced && `${replaced}本をファイルの新しい中身に置き換えました`].filter(Boolean);
        renderBackup(app, {
          kind: 'ok',
          text: (parts.length ? parts.join('。') + '。' : '追加・置き換えたプロットはありません。')
            + (kept ? `登録済みの${kept}本は、この端末の中身のまま残しています。` : '')
        });
      } catch (e) {
        result.textContent = e.message;
        result.classList.add('bad');
      }
    });

    const keepState = h('p.keep-state');
    const keepBtn = h('button.btn.btn-outline.btn-sm', { type: 'button', hidden: true, onclick: async () => {
      keepBtn.disabled = true;
      const ok = await navigator.storage.persist().catch(() => false);
      keepBtn.disabled = false;
      drawKeep(ok);
      if (!ok) U.toast('ブラウザが受け付けませんでした', 'error');
    } }, icon('check'), 'ブラウザに頼む');
    const drawKeep = (p) => {
      keepState.className = 'keep-state' + (p ? ' ok' : '');
      keepState.textContent = p == null ? 'このブラウザでは、データを消さないよう頼めません。'
        : p ? 'このブラウザには空き容量が減ってもデータを消さないよう頼んであります。'
          : 'まだ頼めていません。ブラウザによっては、このページをブックマークに入れたり、ホーム画面に追加したりすると受け付けられます。';
      keepBtn.hidden = p !== false;
    };
    Store.persisted().then(drawKeep);

    app.replaceChildren(
      h('nav.crumbs', { 'aria-label': 'パンくず' }, h('span', '現在地'), h('strong', 'バックアップ')),
      h('div.page-head', h('div', h('h1', 'バックアップ'),
        h('p.lead', 'バックアップはデータを復元するための予備のファイルです。'))),
      h('div.notice',
        h('p', '入力した内容はこの端末のブラウザに自動で保存されます。zetaとの自動連携や端末間の自動同期はありません。ブラウザのデータを消すと失われるため、定期的にバックアップしてください。')),
      h('section.panel.backup-card',
        h('h2', 'バックアップを書き出す'),
        h('p', `全${n}本のプロットを、前の版と画像も含めてひとつの復元用ファイル(JSON形式)に保存します。1本だけ保存するときは、プロットの画面の「ファイルに保存」を使います。`),
        last,
        h('button.btn.btn-primary', { type: 'button', disabled: !n, onclick: (e) => doExport(e.currentTarget) }, icon('download'), 'バックアップを保存')),
      h('section.panel.backup-card',
        h('h2', 'バックアップを読み込む'),
        h('p', '別の端末へ移すときも、ここから読み込みます。未登録のプロットは追加し、登録済みのプロットでファイルの方が新しいときは、置き換えるかを聞きます。'),
        file,
        h('button.btn.btn-outline', { type: 'button', onclick: () => file.click() }, icon('upload'), '復元用ファイルを選ぶ'),
        result),
      h('section.panel.backup-card',
        h('h2', '消されにくくする'),
        h('p', '端末の空き容量が減ると、ブラウザは保存してあるデータを消すことがあります。消さないようにブラウザに頼めます。受け付けるかはブラウザが決めるので、バックアップも続けてください。'),
        keepState, keepBtn),
      h('section.panel.howto',
        h('h2', '使い方'),
        h('ol',
          h('li', 'プロット一覧で「プロットを追加」を押す'),
          h('li', 'zetaの編集画面の欄を1つずつコピーして、同じ名前のタブの欄に貼る'),
          h('li', '紹介とイントロのタブで、見え方を確かめながら書く'),
          h('li', '書き直した欄は「コピー」でzetaに貼り戻す'))));
  }

  Views.renderBackup = renderBackup;
})();
