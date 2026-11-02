/* ルーター (ハッシュ): #/  #/plot/<id>[/<tab>]  #/backup */
(function () {
  'use strict';

  const app = document.getElementById('app');

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    let nav = 'list';
    if (parts[0] === 'backup') {
      nav = 'backup';
      Views.renderBackup(app);
      document.title = 'バックアップ — charplot';
    } else if (parts[0] === 'plot' && parts[1]) {
      nav = 'plot';
      Views.renderPlot(app, parts[1], parts[2]);
    } else {
      Views.renderList(app);
      document.title = 'プロット一覧 — charplot';
    }
    document.querySelectorAll('.nav-item').forEach((a) => {
      const on = a.dataset.nav === nav || (nav === 'plot' && a.dataset.nav === 'list');
      a.classList.toggle('active', on);
      if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    Views.drawBackupAt();
  }

  let lastPage = null;
  window.addEventListener('hashchange', () => {
    // 同じプロットのタブ切り替えでは先頭へ戻さない
    const page = location.hash.split('/').slice(0, 3).join('/');
    Store.flush();
    route();
    if (page !== lastPage) window.scrollTo(0, 0);
    lastPage = page;
  });

  Kit.mountBar('charplot');
  document.body.append(Kit.footer());
  U.hydrateIcons(document);
  Store.load().then(() => {
    if (Store.loadError()) U.toast('保存してあるプロットを読み込めませんでした', 'error');
    route();
    lastPage = location.hash.split('/').slice(0, 3).join('/');
  });
})();
