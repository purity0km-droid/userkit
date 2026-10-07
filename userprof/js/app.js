/* ルーター (ハッシュ): #/  #/user/<id>[/<tab>]  #/backup */
(function () {
  'use strict';

  const app = document.getElementById('app');

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    let nav = 'list';
    if (parts[0] === 'backup') {
      nav = 'backup';
      Views.renderBackup(app);
    } else if (parts[0] === 'user' && parts[1]) {
      Views.renderDetail(app, parts[1], parts[2]);
    } else {
      Views.renderList(app);
    }
    document.querySelectorAll('.nav-item').forEach((a) => {
      const on = a.dataset.nav === nav;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const titles = { list: 'user一覧', backup: 'バックアップ' };
    const u = parts[0] === 'user' ? Store.getUser(parts[1]) : null;
    document.title = `${u ? u.name : titles[nav]} — userprof`;
  }

  let lastPage = null;
  window.addEventListener('hashchange', () => {
    // 同じuserのタブ切り替えでは先頭へ戻さない
    const page = location.hash.split('/').slice(0, 3).join('/');
    route();
    if (page !== lastPage) window.scrollTo(0, 0);
    lastPage = page;
  });

  Kit.mountBar('userprof');
  document.body.append(Kit.footer());
  U.hydrateIcons(document);
  Store.load();
  route();
  lastPage = location.hash.split('/').slice(0, 3).join('/');
})();
