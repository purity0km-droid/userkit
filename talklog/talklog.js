/* talklog ページ: ブックマークレットの用意 と 書き出したログのビューア */
(function () {
  'use strict';
  const { h, icon } = U;

  Kit.mountBar('talklog');
  document.body.append(Kit.footer());
  U.hydrateIcons(document);

  /* ---------------------------------------------------------------- 端末ごとの手順 */
  const tabs = [...document.querySelectorAll('.dev-tabs button')];
  const showDev = (dev) => {
    tabs.forEach((b) => b.setAttribute('aria-pressed', b.dataset.dev === dev ? 'true' : 'false'));
    document.querySelectorAll('[data-dev-panel]').forEach((p) => { p.hidden = p.dataset.devPanel !== dev; });
  };
  tabs.forEach((b) => b.addEventListener('click', () => showDev(b.dataset.dev)));
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) showDev('ios');
  else if (/Android/.test(ua)) showDev('android');

  /* ---------------------------------------------------------------- ブックマークレット */
  const COLLECTOR = new URL('collector.js', location.href).href;
  const bmShort = "javascript:(function(){window.__talklogAuto=true;var s=document.createElement('script');" +
    "s.src='" + COLLECTOR + "?'+Date.now();document.body.appendChild(s);})();";
  const drag = document.getElementById('bm-drag');
  drag.href = bmShort;
  drag.addEventListener('click', (e) => {
    e.preventDefault();
    U.toast('このボタンはブックマークバーへドラッグして使います');
  });

  let fullCache = null;
  async function bmFull() {
    if (fullCache) return fullCache;
    const code = await fetch(COLLECTOR, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.text(); });
    fullCache = 'javascript:' + encodeURIComponent('window.__talklogAuto=true;' + code);
    return fullCache;
  }
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.copy === 'bm') return U.copyText(bmShort, 'コピーしました。ブックマークのURL欄に貼り付けてください');
    try { U.copyText(await bmFull(), '全部入り版をコピーしました'); } catch (e) { U.toast('本体を読み込めませんでした', 'error'); }
  }));

  /* ---------------------------------------------------------------- ビューア */
  const fileIn = document.getElementById('log-file');
  const view = document.getElementById('log-view');
  document.getElementById('open-log').addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    try {
      showLog(parseLog(await f.text(), f.name));
    } catch (e) {
      view.replaceChildren(h('p.field-error', e.message));
    }
  });
  view.addEventListener('dragover', (e) => e.preventDefault());

  /** talklog の書き出し(HTML/JSON)を読む。ほかのツールの chatlog 形式も読めるようにしておく */
  function parseLog(text, name) {
    let data = null;
    const t = text.trim();
    if (t.startsWith('{')) {
      data = JSON.parse(t);
    } else {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const node = doc.getElementById('talklog-data') || doc.getElementById('chatlog-data');
      if (!node) throw new Error('トークのデータが見つかりませんでした。talklog で書き出したファイルを選んでください。');
      data = JSON.parse(node.textContent);
    }
    const s = (v) => (v == null ? '' : String(v));
    if (Array.isArray(data.items)) {
      return {
        title: s(data.title) || name, savedAt: s(data.savedAt),
        items: data.items.map((x) => ({ kind: ['speech', 'narration', 'info'].includes(x.kind) ? x.kind : 'speech', name: s(x.name), right: !!x.right, body: s(x.body) }))
      };
    }
    if (Array.isArray(data.turns)) {
      // 他ツールの形式: { who:'自分'|'相手', name, body, kind? }
      return {
        title: s(data.title) || name, savedAt: s(data.savedAt),
        items: data.turns.map((x) => {
          const narr = x.name === '地の文';
          return { kind: x.kind === 'info' ? 'info' : narr ? 'narration' : 'speech', name: narr ? '' : s(x.name), right: x.who === '自分', body: s(x.body) };
        })
      };
    }
    throw new Error('読み取れない形式のファイルです。');
  }

  function bodyNodes(body) {
    return body.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const act = /^\*[^*].*\*$/.test(l) && !l.includes('**');
      const p = h('p' + (act ? '.act' : ''));
      // **太字** と *斜体* を、テキストのまま安全に組み立てる
      l.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).forEach((part) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) p.append(h('b', part.slice(2, -2)));
        else if (/^\*[^*]+\*$/.test(part)) p.append(h('i', part.slice(1, -1)));
        else if (part) p.append(part);
      });
      return p;
    });
  }

  function toText(log, items) {
    const lines = [`【${log.title}】`];
    if (log.savedAt) lines.push(`保存: ${new Date(log.savedAt).toLocaleString('ja-JP')} ／ ${items.length}件`);
    lines.push('');
    items.forEach((x) => {
      if (x.kind === 'narration') lines.push('(地の文) ' + x.body.replace(/\n/g, '\n　'));
      else if (x.kind === 'info') lines.push('[インフォボックス]\n' + x.body);
      else lines.push(`${x.name || (x.right ? 'あなた' : '相手')}：\n${x.body}`);
      lines.push('');
    });
    return lines.join('\n');
  }

  function showLog(log) {
    const st = { q: '', narr: true, info: true };
    const q = h('input', { type: 'search', placeholder: '発言を検索', 'aria-label': '発言を検索' });
    const narr = h('input', { type: 'checkbox', checked: true });
    const info = h('input', { type: 'checkbox', checked: true });
    const count = h('span.hint');
    const list = h('div.log-list');
    const names = {};
    log.items.forEach((x) => { if (x.kind === 'speech') { const k = x.name || (x.right ? 'あなた' : '相手'); names[k] = (names[k] || 0) + 1; } });
    const filtered = () => log.items.filter((x) => {
      if (x.kind === 'narration' && !st.narr) return false;
      if (x.kind === 'info' && !st.info) return false;
      return !st.q || U.norm(x.body + ' ' + x.name).includes(U.norm(st.q));
    });
    const draw = () => {
      const items = filtered();
      count.textContent = `${items.length} / ${log.items.length}件`;
      list.replaceChildren(...items.map((x) => {
        const cls = x.kind === 'narration' ? 'nar' : x.kind === 'info' ? 'info' : (x.right ? 'me' : 'them');
        return h('div.m.' + cls, x.name && x.kind !== 'narration' && h('div.nm', x.name), h('div.bb', bodyNodes(x.body)));
      }));
      if (!items.length) list.append(h('p.hint.center', '当てはまる発言がありません。'));
    };
    q.addEventListener('input', () => { st.q = q.value.trim(); draw(); });
    narr.addEventListener('change', () => { st.narr = narr.checked; draw(); });
    info.addEventListener('change', () => { st.info = info.checked; draw(); });

    view.replaceChildren(
      h('div.log-meta',
        h('h3', log.title),
        h('p.hint', [log.savedAt && `保存: ${new Date(log.savedAt).toLocaleString('ja-JP')}`, `全${log.items.length}件`,
          Object.entries(names).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' ・ ')].filter(Boolean).join(' ／ '))),
      h('div.log-tools',
        q,
        h('label.check', narr, '地の文'),
        h('label.check', info, 'インフォボックス'),
        count,
        h('span.tools-right',
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => U.copyText(toText(log, filtered())) }, icon('copy'), 'コピー'),
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => U.download(`${U.safeName(log.title, 'talk')}.txt`, toText(log, filtered()), 'text/plain;charset=utf-8') }, icon('download'), 'テキストで保存'),
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => window.print() }, icon('file'), '印刷・PDF'))),
      list);
    draw();
    view.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
})();
