/* usersns: SNS風の画面 — セットログ風のVlog(2〜4人) / インスタ風の投稿(タグ付け) / インスタ風のストーリー /
 *  LINE風のトーク / Twitter風のプロフィールと投稿一覧 / Twitter風のリプのやり取り
 *  画面は上の切り替えで行き来する。内容はまとめて1つの状態に持ち、自動で保存する。
 *  画面はスマホの画面幅(430px)で組み、書き出す画像の見た目を端末で変えない。
 */
(function () {
  'use strict';
  const { h, icon } = U;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

  Kit.mountBar('usersns');

  const W = 430;          // 画面の幅(大きめのスマホの画面幅)
  const FRAME_H = 764;    // 縦 9:16 の高さ
  const SCREEN_H = 932;   // スマホ1画面の高さ(ステータスバーからホームバーまで)
  const MODES = [
    ['vlog', 'Vlog', 'セットログ風・2〜4人'], ['post', 'インスタ投稿', 'タグ付けできる通常の投稿'], ['story', 'ストーリー', 'インスタ風のストーリー'],
    ['line', 'LINE', 'LINE風のトーク画面(1対1・グループ)'], ['xprof', 'Twitterプロフ', 'Twitter風のプロフィールと投稿一覧'], ['xthread', 'Twitterリプ', 'Twitter風のリプのやり取り']
  ];

  /* ---------------------------------------------------------------- 画面の中のアイコン(線画SVG) */
  const SNS_ICONS = {
    heart: '<path d="M12 20.3C6.4 16.4 2.5 12.9 2.5 8.6c0-2.8 2.1-4.9 4.8-4.9 1.9 0 3.6 1.1 4.7 2.8 1.1-1.7 2.8-2.8 4.7-2.8 2.7 0 4.8 2.1 4.8 4.9 0 4.3-3.9 7.8-9.5 11.7z"/>',
    comment: '<path d="M20.5 16.6A9 9 0 1 0 16.6 20.5l4.9 1z"/>',
    send: '<path d="M21.5 2.8 10.4 13.6M21.5 2.8 14.6 21l-4.2-7.4L3 9.3z"/>',
    save: '<path d="M19 21.2 12 15.5l-7 5.7V2.8h14z"/>',
    more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    back: '<path d="M15.5 4.5 8 12l7.5 7.5"/>',
    close: '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
    music: '<path d="M9 18V5.6l11-2.2v12.4"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="15.8" r="2.5"/>',
    pin: '<path d="M12 21.5s-7-6.4-7-11.6a7 7 0 0 1 14 0c0 5.2-7 11.6-7 11.6z"/><circle cx="12" cy="9.8" r="2.4"/>',
    person: '<circle cx="12" cy="8" r="4" fill="currentColor" stroke="none"/><path d="M4 20.5c.9-4.1 4.1-6.5 8-6.5s7.1 2.4 8 6.5z" fill="currentColor" stroke="none"/>',
    verified: '<path d="M12 1.8l2.4 1.9 3-.4 1 2.9 2.8 1.2-.4 3 1.9 2.4-1.9 2.4.4 3-2.8 1.2-1 2.9-3-.4-2.4 1.9-2.4-1.9-3 .4-1-2.9-2.8-1.2.4-3L1.3 12l1.9-2.4-.4-3 2.8-1.2 1-2.9 3 .4z" fill="#0095f6" stroke="none"/><path d="m8.2 12.3 2.6 2.6 5-5.2" stroke="#fff" stroke-width="2.2"/>',
    // LINE風
    search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m15.8 15.8 4.7 4.7"/>',
    phone: '<path d="M7.1 3.2h2.6l1.5 4.3-2.2 1.6a12.4 12.4 0 0 0 5.9 5.9l1.6-2.2 4.3 1.5v2.6a2.1 2.1 0 0 1-2.2 2.1C10.6 18.5 5.5 13.4 5 5.4a2.1 2.1 0 0 1 2.1-2.2z"/>',
    menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    plus: '<path d="M12 4.5v15M4.5 12h15"/>',
    camera: '<path d="M3.5 8.6a2 2 0 0 1 2-2h2.3l1.6-2.1h5.2l1.6 2.1h2.3a2 2 0 0 1 2 2v8.9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.8" r="3.6"/>',
    photo: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.7" r="1.7"/><path d="m20.5 15.8-4.9-4.9-9.6 8.6"/>',
    smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 14.2a4.2 4.2 0 0 0 6.8 0"/><circle cx="9.2" cy="10" r=".9" fill="currentColor" stroke="none"/><circle cx="14.8" cy="10" r=".9" fill="currentColor" stroke="none"/>',
    mic: '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.8 11.2a6.2 6.2 0 0 0 12.4 0M12 17.4v3.1"/>',
    // Twitter風
    arrowL: '<path d="M20 12H4.5M10.5 5.5 4 12l6.5 6.5"/>',
    reply: '<path d="M12 3.6c4.7 0 8.5 3 8.5 6.9 0 3.3-2.8 6.1-6.6 6.8L9 20.6v-3.4c-3.2-.9-5.5-3.6-5.5-6.7 0-3.9 3.8-6.9 8.5-6.9z"/>',
    repost: '<path d="M4.5 10.5V8.2a2.7 2.7 0 0 1 2.7-2.7h11.3M15.5 2.5l3 3-3 3M19.5 13.5v2.3a2.7 2.7 0 0 1-2.7 2.7H5.5M8.5 21.5l-3-3 3-3"/>',
    views: '<path d="M5 20.5V13M10 20.5V4.5M15 20.5V9.5M20 20.5V15"/>',
    bookmark: '<path d="M6 3.5h12v17.2l-6-4.4-6 4.4z"/>',
    share: '<path d="M12 15V3.8M7.6 8.1 12 3.7l4.4 4.4M4.5 13.5v5.2a1.8 1.8 0 0 0 1.8 1.8h11.4a1.8 1.8 0 0 0 1.8-1.8v-5.2"/>',
    lock: '<rect x="5" y="10.2" width="14" height="10.3" rx="2.2" fill="currentColor"/><path d="M8.2 10.2V8a3.8 3.8 0 0 1 7.6 0v2.2"/>',
    link: '<path d="M10.2 13.8a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1.1 1.1M13.8 10.2a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1.1-1.1"/>',
    balloon: '<path d="M12 3.3c3.1 0 5.6 2.6 5.6 5.9 0 3.6-2.7 6.5-5.6 6.5S6.4 12.8 6.4 9.2c0-3.3 2.5-5.9 5.6-5.9z"/><path d="m10.9 15.6-.9 1.5h4l-.9-1.5M12 17.1c0 1.8-1.6 2-1.6 3.8"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.8h17M8 3v3.6M16 3v3.6"/>',
    tack: '<path d="M9 3.5h6l-1 5.2 3.2 3.2v1.6H6.8v-1.6L10 8.7zM12 13.5v7"/>',
    home: '<path d="M3.5 10.6 12 3.6l8.5 7v9.4a1 1 0 0 1-1 1h-5v-6.5h-5V21h-5a1 1 0 0 1-1-1z"/>',
    bell: '<path d="M6 16.6V11a6 6 0 0 1 12 0v5.6l1.6 2.1H4.4zM9.8 20.8a2.3 2.3 0 0 0 4.4 0"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="m3.6 6.6 8.4 6.3 8.4-6.3"/>',
    chat: '<path d="M12 3.6c5 0 9 3.4 9 7.7S17 19 12 19c-1.1 0-2.2-.2-3.2-.5L4 20.6l1.3-4C3.9 15.2 3 13.4 3 11.3 3 7 7 3.6 12 3.6z"/>',
    people: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.8 19.5c.7-3.5 3.2-5.5 6.2-5.5s5.5 2 6.2 5.5"/><path d="M15.5 5.3a3.3 3.3 0 0 1 0 6.4M17.5 14.3c2 .6 3.3 2.4 3.7 5.2"/>'
  };
  // Twitter風の認証バッジ(青 = 認証済み、金 = 企業など)
  const BADGE_PATH = 'M12 1.8l2.4 1.9 3-.4 1 2.9 2.8 1.2-.4 3 1.9 2.4-1.9 2.4.4 3-2.8 1.2-1 2.9-3-.4-2.4 1.9-2.4-1.9-3 .4-1-2.9-2.8-1.2.4-3L1.3 12l1.9-2.4-.4-3 2.8-1.2 1-2.9 3 .4z';
  const BADGE_COLORS = { blue: '#1d9bf0', gold: '#e2b719' };
  function xBadge(kind, size) {
    const s = svg('', size || 18, 'x-badge');
    s.innerHTML = `<path d="${BADGE_PATH}" fill="${BADGE_COLORS[kind] || BADGE_COLORS.blue}" stroke="none"/><path d="m8.2 12.3 2.6 2.6 5-5.2" stroke="#fff" stroke-width="2.2"/>`;
    return s;
  }
  function svg(name, size, cls) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'sns-ic' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = SNS_ICONS[name] || '';
    return s;
  }
  // ステータスバーの電波・Wi-Fi・電池
  const SB_ICONS =
    '<svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
    '<svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.2A10.2 10.2 0 0 0 8 .5 10.2 10.2 0 0 0 .8 3.4L2 4.6a8.5 8.5 0 0 1 6-2.4z"/><path d="M8 5.7c1.4 0 2.6.5 3.6 1.4l1.2-1.2A6.8 6.8 0 0 0 8 4a6.8 6.8 0 0 0-4.8 1.9l1.2 1.2c1-.9 2.2-1.4 3.6-1.4z"/><path d="M8 9.2c.5 0 1 .2 1.3.5L8 11 6.7 9.7c.3-.3.8-.5 1.3-.5z"/></svg>' +
    '<svg viewBox="0 0 27 13" width="27" height="13"><rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.4"/><path d="M25 4.3v4.4a2.2 2.2 0 0 0 0-4.4z" opacity=".4"/></svg>';

  // ストーリーの背景(画像がないとき)
  const BGS = [
    ['sunset', 'linear-gradient(165deg, #fcd25b 0%, #f0597e 52%, #7b3fe4 100%)', '夕焼け'],
    ['peach', 'linear-gradient(165deg, #ffd8b0 0%, #ff8fa3 100%)', 'ピーチ'],
    ['sky', 'linear-gradient(165deg, #9cc4ff 0%, #def0ff 100%)', 'そら'],
    ['mint', 'linear-gradient(165deg, #d9f7b0 0%, #7fd6b8 100%)', 'ミント'],
    ['lilac', 'linear-gradient(165deg, #e8d9ff 0%, #a084f5 100%)', 'ライラック'],
    ['night', 'linear-gradient(165deg, #34365f 0%, #0d0e1f 100%)', '夜'],
    ['cream', '#efe6d4', 'クリーム'],
    ['black', '#141414', '黒']
  ];
  const bgOf = (id) => (BGS.find((b) => b[0] === id) || BGS[0])[1];
  const TEXT_COLORS = ['#ffffff', '#000000', '#ff3b5c', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#af52de', '#ff7eb6'];
  const lumOf = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 1;
    const n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };

  // ストーリーのスタンプ
  const STICKERS = {
    text: { label: '文字', ph: 'テキスト', text: '', style: 'plain' },
    mention: { label: 'メンション', ph: 'username', text: 'username', style: 'white' },
    hashtag: { label: 'ハッシュタグ', ph: 'hashtag', text: 'hashtag', style: 'white' },
    location: { label: '場所', ph: '場所', text: '場所', style: 'white' }
  };
  function newSticker(type) {
    const t = STICKERS[type] ? type : 'text';
    const d = STICKERS[t];
    return { id: U.uid(), type: t, text: d.text, style: d.style, x: 50, y: 50, size: 1, rot: 0, color: '#ffffff', font: 'classic', align: 'center' };
  }

  // LINE風: 背景の色(着せかえの「基本」に近い青を最初に)。暗い色にすると、吹き出しや文字も暗い画面用になる
  const LINE_BGS = [
    ['#8cabd8', 'ブルー'], ['#7494c0', 'こいブルー'], ['#ece7dd', 'ベージュ'], ['#f6d6dc', 'ピンク'],
    ['#d3e8cc', 'ミント'], ['#dcd4ef', 'ラベンダー'], ['#ffffff', '白'], ['#1e2024', 'ダーク']
  ];
  const LINE_ME = '#8de055';   // 自分の吹き出し(緑)
  const LINE_RATIOS = { square: 1, wide: 4 / 3, tall: 3 / 4 };
  const isCenter = (m) => m.from === 'date' || m.from === 'sys';
  const newPerson = () => ({ id: U.uid(), name: '', avatar: null });
  const newMsg = (from) => ({ id: U.uid(), from: from || 'me', kind: 'text', text: '', image: null, ratio: 'square', time: '', read: true });

  // Twitter風: 「ポスト」(今のX)と「ツイート」(以前のTwitter)の言葉
  const X_WORDS = {
    post: {
      title: 'ポスト', repost: 'リポスト', quote: '引用', reposted: 'さんがリポストしました', pinned: '固定されたポスト',
      replyPh: '返信をポスト', tabs: ['ポスト', '返信', 'ハイライト', 'メディア'], locked: 'ポストは非公開です'
    },
    tweet: {
      title: 'ツイート', repost: 'リツイート', quote: '引用ツイート', reposted: 'さんがリツイートしました', pinned: '固定されたツイート',
      replyPh: '返信をツイート', tabs: ['ツイート', 'ツイートと返信', 'メディア', 'いいね'], locked: 'ツイートは非公開です'
    }
  };
  const X_MEDIA = { wide: 16 / 9, square: 1, tall: 4 / 5 };
  const newAccount = () => ({ id: U.uid(), name: '', handle: '', avatar: null, badge: 'none', locked: false });
  const newCounts = () => ({ reply: '', repost: '', quote: '', like: '', view: '', bookmark: '' });
  const newXPost = (acc) => ({
    id: U.uid(), acc: acc || '', label: 'none', text: '', time: '3時間', media: 'none', image: null, replyTo: '', link: true,
    liked: false, reposted: false, bookmarked: false, c: newCounts()
  });

  /* ---------------------------------------------------------------- 初期値 */
  const today = () => { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const todayLong = () => { const d = new Date(); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
  const vlogPerson = () => ({ name: '', image: null, caption: '', time: '19:00' });
  function lineDefaults() {
    const p = Object.assign(newPerson(), { id: 'l1' });
    const msg = (from, text, time) => Object.assign(newMsg(from), { text, time });
    return {
      title: '', group: false, members: '3', readN: '2', unread: '', clock: '9:41', height: 'screen',
      bg: LINE_BGS[0][0], bgImage: null, me: LINE_ME,
      show: { bar: true, head: true, input: true, read: true, time: true, names: true },
      people: [p],
      msgs: [msg('date', '今日', ''), msg(p.id, 'おつかれさま', '18:02'), msg('me', 'おつかれ！いま帰ってるところ', '18:05'), msg(p.id, '気をつけて帰ってね', '18:06')]
    };
  }
  function threadDefaults() {
    const posts = [newXPost('a1'), Object.assign(newXPost('a2'), { time: '2時間' }), Object.assign(newXPost('a1'), { time: '1時間' })];
    return {
      focus: posts[0].id, stats: 'icons', time: '午後3:12', date: todayLong(), clock: '9:41', height: 'auto',
      show: { bar: true, reply: true }, posts
    };
  }
  const defaults = () => ({
    mode: 'vlog',
    vlog: {
      count: 3, timePos: 'center', mark: 'vlog', gap: false,
      show: { name: true, mark: true, time: true, caption: true },
      people: range(4).map(vlogPerson)
    },
    post: {
      ratio: 'square', pages: 1, page: 1, liked: false, saved: false,
      show: { bar: true, ring: true, verified: false, location: true, tags: true, dark: false },
      user: { name: 'username', avatar: null }, location: '', image: null, tags: [],
      clock: '9:41', likes: 'いいね！128件', caption: '', comments: 'コメント12件をすべて見る', date: today()
    },
    story: {
      segs: 3, cur: 2, prog: 40, bg: 'sunset', image: null,
      show: { frame: true, reply: true, shade: true, music: false },
      user: { name: 'username', avatar: null }, time: '3時間', music: '', reply: 'メッセージを送信', clock: '9:41',
      stickers: []
    },
    line: lineDefaults(),
    // Twitter風の2画面で共通: アカウント・配色・言葉
    x: {
      theme: 'light', words: 'post', views: true,
      accounts: [Object.assign(newAccount(), { id: 'a1' }), Object.assign(newAccount(), { id: 'a2' })]
    },
    xprof: {
      acc: 'a1', banner: null, bio: '', location: '', link: '', birth: '', joined: '', following: '', followers: '',
      button: 'edit', followsYou: false, view: 'posts', tab: 0, clock: '9:41', height: 'auto', notif: '', dm: '',
      show: { bar: true, nav: true, fab: true },
      posts: [Object.assign(newXPost('a1'), { label: 'pinned', time: '9月1日' }), newXPost('a1')]
    },
    xthread: threadDefaults()
  });
  function merge(base, over) {
    if (!isObj(over)) return base;
    for (const [k, v] of Object.entries(over)) {
      if (isObj(base[k]) && isObj(v)) merge(base[k], v);
      else if (v !== undefined) base[k] = v;
    }
    return base;
  }
  function migrate(s) {
    const out = merge(defaults(), s);
    if (!MODES.some(([m]) => m === out.mode)) out.mode = 'vlog';
    const ppl = Array.isArray(out.vlog.people) ? out.vlog.people : [];
    out.vlog.people = range(4).map((i) => Object.assign(vlogPerson(), ppl[i]));
    if (!Array.isArray(out.post.tags)) out.post.tags = [];
    out.story.stickers = (Array.isArray(out.story.stickers) ? out.story.stickers : []).map((st) => Object.assign(newSticker(st && st.type), st));
    // LINE風
    const ln = out.line;
    ln.people = (Array.isArray(ln.people) && ln.people.length ? ln.people : lineDefaults().people).map((p) => Object.assign(newPerson(), p));
    ln.msgs = (Array.isArray(ln.msgs) ? ln.msgs : []).map((m) => Object.assign(newMsg(m && m.from), m));
    // Twitter風
    const accs = Array.isArray(out.x.accounts) && out.x.accounts.length ? out.x.accounts : defaults().x.accounts;
    out.x.accounts = accs.map((a) => Object.assign(newAccount(), a));
    ['xprof', 'xthread'].forEach((k) => {
      out[k].posts = (Array.isArray(out[k].posts) ? out[k].posts : []).map((p) => {
        const q = Object.assign(newXPost(p && p.acc), p);
        q.c = Object.assign(newCounts(), p && p.c);
        return q;
      });
    });
    return out;
  }

  /* ---------------------------------------------------------------- 画面の骨組み */
  const app = document.getElementById('app');
  const toolbar = h('div.ed-toolbar');
  const tip = h('p.ed-tip', '文字は押してそのまま書けます。画像はクリック・ドラッグ・貼り付け(Ctrl+V)で入れ、ホイールや2本指で拡大、ドラッグで位置を合わせられます。人数や表示は設定の欄(画面の右、スマホでは下)で切り替えます。内容はこのブラウザに自動で保存されます。');
  const left = h('div.sns-left');
  const side = h('aside.sns-side.panel', { 'aria-label': '設定' });
  app.append(toolbar, tip, h('div.sns-work', left, side));

  const ed = Ed.create({ app: 'usersns', version: 1, width: W, defaults, migrate, render, mount: left });
  let selected = null;   // 選んでいるストーリーのスタンプ(id)

  /* ---------------------------------------------------------------- 共通の部品 */
  function statusBar(p) {
    const icons = h('span.sb-icons');
    icons.innerHTML = SB_ICONS;
    return h('div.sb', ed.text(p, { cls: 'sb-time', ph: '9:41', label: '時刻' }), icons);
  }
  /** 別の場所の入力をそのまま映す文字(ユーザー名など) */
  const mirror = (p, fb) => h('span', { 'data-mirror': p, 'data-fb': fb }, ed.get(p) || fb);
  /** p の値を、同じ印(data-mirror)の文字・入力欄すべてに映す(except は書いている本人) */
  function syncMirrors(p, except) {
    const v = ed.get(p) || '';
    document.querySelectorAll(`[data-mirror="${p}"]`).forEach((n) => {
      if (n === except) return;
      if (n.tagName === 'INPUT') n.value = v;
      else if (n.classList.contains('ed-text')) { n.textContent = v; n.classList.toggle('is-empty', !v.trim()); }
      else n.textContent = v || n.dataset.fb;
    });
  }
  function liveMirror(el, p) {
    el.dataset.mirror = p;
    el.addEventListener('input', () => syncMirrors(p, el));
    return el;
  }
  const syncText = (p, o) => liveMirror(ed.text(p, o), p);
  /** #ハッシュタグ・@メンション(o.urls なら URL も)に色を付ける文字(書いている間はそのまま、離れたら色付け) */
  const RICH = /([#＃][^\s#＃@＠,，、。.!！?？]+|[@＠][A-Za-z0-9._]+)/;
  const RICH_URL = /(https?:\/\/[^\s]+|[#＃][^\s#＃@＠,，、。.!！?？]+|[@＠][A-Za-z0-9_]+)/;
  function richText(p, o) {
    const el = ed.text(p, o);
    const paint = () => {
      const v = ed.get(p) || '';
      if (!v) return;
      const parts = v.split(o.urls ? RICH_URL : RICH);
      el.replaceChildren(...parts.map((t, i) => (i % 2 ? h('span.' + (o.link || 'ig-link'), t) : t)).filter((x) => x !== ''));
    };
    el.addEventListener('blur', paint);
    paint();
    return el;
  }
  /** 押すと選べる項目(LINEのメッセージ・Twitterのポスト)。選ぶと設定の欄にその項目の設定が出る */
  function pickable(el, id) {
    el.classList.add('sns-item');
    el.dataset.id = id;
    if (id === selected) el.classList.add('sel');
    el.addEventListener('pointerdown', () => setSelected(id));
    return el;
  }
  const homeBar = () => h('div.sns-home', h('i'));
  /** 設定の欄の入力で、画面を少し待ってから描き直す(打つたびに作り直さない) */
  let drawTimer = 0;
  const drawSoon = () => { clearTimeout(drawTimer); drawTimer = setTimeout(() => drawSheet(), 150); };
  /**
   * ドラッグで動かせるようにする(タグ・スタンプ)。item.x / item.y は枠に対する位置(%)。
   * 少し動かすまではドラッグにしない(押しただけなら文字を書ける)。
   */
  function draggable(el, item, o) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || (e.target.closest && e.target.closest('.ed-ui'))) return;
      if (o.pick) o.pick();
      const r = o.box().getBoundingClientRect();
      const g = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: item.x, y0: item.y, w: r.width || 1, hh: r.height || 1, moved: false };
      const move = (ev) => {
        if (ev.pointerId !== g.id) return;
        const dx = ev.clientX - g.sx, dy = ev.clientY - g.sy;
        if (!g.moved) {
          if (Math.hypot(dx, dy) < 5) return;
          g.moved = true;
          if (el.contains(document.activeElement)) document.activeElement.blur();
          el.classList.add('dragging');
          document.body.classList.add('sns-dragging');
        }
        const sel = window.getSelection();
        if (sel && sel.rangeCount) sel.removeAllRanges();
        item.x = clamp(g.x0 + (dx / g.w) * 100, 0, 100);
        item.y = clamp(g.y0 + (dy / g.hh) * 100, 0, 100);
        o.place();
      };
      const up = (ev) => {
        if (ev.pointerId !== g.id) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (g.moved) { el.classList.remove('dragging'); document.body.classList.remove('sns-dragging'); ed.dirty(); }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });
  }

  /* ---------------------------------------------------------------- Vlog(セットログ風) */
  function renderVlog(v) {
    const n = clamp(v.count | 0, 2, 4);
    const R = W / (FRAME_H / n);
    return h('div.sns-sheet.vl-sheet' + (v.gap ? '.gap' : ''), { 'data-n': n },
      v.people.slice(0, n).map((p, i) => {
        const pp = `vlog.people.${i}`;
        const time = () => ed.text(`${pp}.time`, { cls: 'vl-time', ph: '19:00', label: `${i + 1}人目の時刻` });
        return h('div.vl-panel',
          ed.image(`${pp}.image`, { ratio: R, label: `${i + 1}人目の画像`, max: 1400 }),
          h('div.vl-over',
            v.show.name && ed.text(`${pp}.name`, { cls: 'vl-name', ph: '名前', label: `${i + 1}人目の名前` }),
            h('div.vl-mid',
              h('div.vl-l', v.show.mark && h('span.vl-mark', v.mark || 'vlog')),
              h('div.vl-c',
                v.show.time && v.timePos !== 'right' && time(),
                v.show.caption && ed.text(`${pp}.caption`, { cls: 'vl-cap', ph: 'キャプション', multi: true, label: `${i + 1}人目のキャプション` })),
              h('div.vl-r', v.show.time && v.timePos === 'right' && time()))));
      }));
  }

  /* ---------------------------------------------------------------- インスタ風の投稿 */
  const RATIOS = { square: 1, portrait: 4 / 5, landscape: 1.91 };
  function renderPost(p) {
    const pages = clamp(p.pages | 0, 1, 10), page = clamp(p.page | 0, 1, pages);
    const name = liveMirror(ed.text('post.user.name', { cls: 'ig-uname', ph: 'username', label: 'ユーザー名' }), 'post.user.name');
    const toggle = (k, label, iconName) => h(`button.ig-btn.ig-${k}` + (p[k] ? '.on' : ''), {
      type: 'button', 'aria-label': `${label}(押して切り替え)`, 'aria-pressed': String(!!p[k]), title: `${label}(押して切り替え)`,
      onclick: () => ed.set(`post.${k}`, !p[k], { rerender: true })
    }, svg(iconName, 26));
    return h('div.sns-sheet.ig-post' + (p.show.dark ? '.dark' : ''),
      p.show.bar && statusBar('post.clock'),
      p.show.bar && h('div.ig-nav', svg('back', 26), h('div.ig-nav-title', h('small', mirror('post.user.name', 'username')), h('b', '投稿')), h('span')),
      h('div.ig-head',
        h('div.ig-ava' + (p.show.ring ? '.ring' : ''), ed.image('post.user.avatar', { ratio: 1, round: true, compact: true, label: 'アイコン', max: 400 })),
        h('div.ig-who',
          h('div.ig-name-row', name, p.show.verified && svg('verified', 14, 'ig-verified')),
          p.show.location && ed.text('post.location', { cls: 'ig-loc', ph: '位置情報', label: '位置情報' })),
        svg('more', 22)),
      h('div.ig-media',
        ed.image('post.image', { ratio: RATIOS[p.ratio] || 1, label: '投稿の写真', max: 1600 }),
        pages > 1 && h('span.ig-count', `${page}/${pages}`),
        p.tags.length > 0 && h('span.ig-person', svg('person', 14)),
        p.show.tags && h('div.ig-tags', p.tags.map(tagEl))),
      h('div.ig-actions',
        h('div.ig-act-l', toggle('liked', 'いいね', 'heart'), svg('comment', 25), svg('send', 25)),
        pages > 1 && h('div.ig-dots', range(pages).map((i) => h('i' + (i === page - 1 ? '.on' : '')))),
        toggle('saved', '保存', 'save')),
      ed.text('post.likes', { cls: 'ig-likes', ph: 'いいね！128件', label: 'いいねの数' }),
      h('div.ig-cap', h('b', mirror('post.user.name', 'username')), ' ',
        richText('post.caption', { cls: 'ig-cap-text', ph: 'キャプション(#ハッシュタグ・@メンションに色が付きます)', multi: true, label: 'キャプション' })),
      ed.text('post.comments', { cls: 'ig-more', ph: 'コメント12件をすべて見る', label: 'コメントの数' }),
      ed.text('post.date', { cls: 'ig-date', ph: today(), label: '日付' }));
  }
  /** 写真の上のタグ(ドラッグで動かす・押して名前を書き換える) */
  function tagEl(t, i) {
    const tags = ed.state.post.tags;
    const el = h('div.ig-tag',
      ed.text(`post.tags.${i}.t`, { cls: 'ig-tag-t', ph: 'username', label: 'タグのユーザー名' }),
      h('button.ig-tag-x.ed-ui', {
        type: 'button', title: 'タグを消す', 'aria-label': 'タグを消す',
        onclick: (e) => { e.stopPropagation(); tags.splice(tags.indexOf(t), 1); ed.set('post.tags', tags, { rerender: true }); }
      }, icon('close', 10)));
    const place = () => { el.style.left = t.x + '%'; el.style.top = t.y + '%'; };
    place();
    draggable(el, t, { box: () => el.parentNode, place });
    return el;
  }

  /* ---------------------------------------------------------------- インスタ風のストーリー */
  function renderStory(s) {
    const segs = clamp(s.segs | 0, 1, 10), cur = clamp(s.cur | 0, 1, segs);
    const frame = h('div.st-frame', { style: { background: bgOf(s.bg) } },
      ed.image('story.image', { ratio: W / FRAME_H, label: '背景の画像', max: 1600 }),
      s.show.shade && h('div.st-shade'),
      h('div.st-layer', s.stickers.map(stickerEl)),
      h('div.st-top',
        h('div.st-bars', range(segs).map((i) => h('span.st-bar' + (i === cur - 1 ? '.cur' : ''),
          h('i', { style: { width: (i < cur - 1 ? 100 : i === cur - 1 ? clamp(s.prog, 0, 100) : 0) + '%' } })))),
        h('div.st-head',
          h('div.st-ava', ed.image('story.user.avatar', { ratio: 1, round: true, compact: true, label: 'アイコン', max: 400 })),
          h('div.st-who',
            h('div.st-name-row',
              ed.text('story.user.name', { cls: 'st-name', ph: 'username', label: 'ユーザー名' }),
              ed.text('story.time', { cls: 'st-time', ph: '3時間', label: '投稿してからの時間' })),
            s.show.music && h('div.st-music', svg('music', 12), ed.text('story.music', { cls: 'st-music-t', ph: '曲名 · アーティスト', label: '音楽' }))),
          h('span.st-head-r', svg('more', 24), svg('close', 26)))));
    // 何かを選んでいる間に背景を押したときは、選ぶのをやめるだけにする(画像を選ぶ画面を開かない)
    frame.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
    if (!s.show.frame) return h('div.sns-sheet.st-sheet', frame);
    return h('div.sns-sheet.st-sheet.framed',
      statusBar('story.clock'),
      frame,
      h('div.st-foot',
        s.show.reply && h('div.st-reply', ed.text('story.reply', { cls: 'st-reply-t', ph: 'メッセージを送信', label: '返信欄の文字' })),
        s.show.reply && svg('heart', 27),
        s.show.reply && svg('send', 27),
        h('span.st-home')));
  }
  const placeSticker = (el, st) => {
    el.style.left = st.x + '%';
    el.style.top = st.y + '%';
    el.style.transform = `translate(-50%, -50%) rotate(${st.rot || 0}deg) scale(${st.size || 1})`;
  };
  function stickerEl(st, i) {
    const d = STICKERS[st.type] || STICKERS.text;
    const isText = st.type === 'text';
    const txt = ed.text(`story.stickers.${i}.text`, { cls: 'st-t', ph: d.ph, multi: isText, label: d.label });
    const el = h(`div.st-sticker.t-${st.type}.s-${st.style}.f-${st.font}.a-${st.align}` + (st.id === selected ? '.sel' : ''),
      { 'data-id': st.id, style: { '--c': st.color, '--ink': lumOf(st.color) > 0.62 ? '#111111' : '#ffffff' } },
      h('div.st-inner',
        st.type === 'location' && svg('pin', 0, 'st-pin'),
        h('div.st-g', st.type === 'mention' && h('span.st-pre', '@'), st.type === 'hashtag' && h('span.st-pre', '#'), txt)),
      h('button.st-x.ed-ui', {
        type: 'button', title: 'スタンプを消す', 'aria-label': 'スタンプを消す',
        onclick: (e) => { e.stopPropagation(); removeSticker(st.id); }
      }, icon('close', 12)));
    placeSticker(el, st);
    draggable(el, st, { box: () => el.parentNode, place: () => placeSticker(el, st), pick: () => setSelected(st.id) });
    let wheelTimer = 0;
    el.addEventListener('wheel', (e) => {
      if (selected !== st.id) return;
      e.preventDefault();
      st.size = clamp(st.size * Math.exp(-e.deltaY * 0.0015), 0.3, 4);
      placeSticker(el, st);
      ed.dirty();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(renderSide, 150);
    }, { passive: false });
    return el;
  }
  function stickerNode(id) {
    return ed.sheet ? ed.sheet.querySelector(`.st-sticker[data-id="${id}"]`) : null;
  }
  function setSelected(id) {
    if (selected === id) return;
    selected = id;
    if (ed.sheet) ed.sheet.querySelectorAll('.st-sticker, .sns-item').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
    renderSide();
  }
  function addSticker(type) {
    const a = ed.state.story.stickers;
    const st = newSticker(type);
    st.y = 36 + (a.length % 5) * 7;
    a.push(st);
    selected = st.id;
    ed.set('story.stickers', a, { rerender: true });
    const t = stickerNode(st.id);
    const txt = t && t.querySelector('.st-t');
    if (!txt) return;
    txt.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(txt);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function removeSticker(id) {
    const s = ed.state.story;
    s.stickers = s.stickers.filter((x) => x.id !== id);
    if (selected === id) selected = null;
    ed.set('story.stickers', s.stickers, { rerender: true });
  }

  /* ---------------------------------------------------------------- LINE風のトーク */
  // 吹き出しのしっぽ(最初の1つだけに付く)
  function lineTail() {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 10 14');
    s.setAttribute('class', 'ln-tail');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<path d="M10 0H1.6C.5 0 .1 1.2 1 1.9 4.6 5 7.6 9 10 14z"/>';
    return s;
  }
  const personIndex = (l, id) => Math.max(0, l.people.findIndex((p) => p.id === id));
  const personAvatar = (i) => ed.image(`line.people.${i}.avatar`, { ratio: 1, round: true, compact: true, label: 'アイコン', max: 400, onChange: () => ed.rerender() });

  function renderLine(l) {
    const dark = lumOf(l.bg) < 0.4;
    const list = h('div.ln-list', l.msgs.map((m, i) => lineRow(l, m, i, l.msgs[i - 1])));
    const body = h('div.ln-body', list);
    // 1画面に入りきらないときは、いちばん新しいメッセージが下に来るように(古いものは上に隠れる)
    if (l.height === 'screen') new ResizeObserver(() => body.classList.toggle('over', list.offsetHeight > body.clientHeight + 1)).observe(list);
    const bgImg = l.bgImage && l.bgImage.src;
    return h('div.sns-sheet.ln-sheet' + (dark ? '.dark' : '') + (l.height === 'screen' ? '.screen' : ''),
      { style: { '--ln-bg': l.bg, '--ln-me': l.me || LINE_ME, backgroundImage: bgImg ? `url("${bgImg}")` : '' } },
      l.show.bar && statusBar('line.clock'),
      l.show.head && h('div.ln-head',
        svg('back', 26),
        l.unread && h('span.ln-unread', l.unread),
        h('div.ln-title-row',
          ed.text('line.title', { cls: 'ln-title', ph: l.group ? 'グループ名' : '名前', label: 'トークの名前' }),
          l.group && h('span.ln-count', `(${l.members || ''})`)),
        h('span.ln-head-r', svg('search', 23), svg('phone', 23), svg('menu', 23))),
      body,
      l.show.input && h('div.ln-input',
        svg('plus', 25), svg('camera', 25), svg('photo', 25),
        h('div.ln-field', h('span', 'Aa'), svg('smile', 22)),
        svg('mic', 25)),
      l.height === 'screen' && homeBar());
  }
  function lineRow(l, m, i, prev) {
    const path = `line.msgs.${i}`;
    if (isCenter(m)) {
      const date = m.from === 'date';
      return pickable(h('div.ln-row.ln-center',
        ed.text(`${path}.text`, { cls: date ? 'ln-date' : 'ln-sys', ph: date ? '今日' : 'お知らせ', multi: !date, label: date ? '日付' : 'お知らせ' })), m.id);
    }
    const me = m.from === 'me';
    const first = !prev || prev.from !== m.from || isCenter(prev);
    const meta = h('div.ln-meta',
      me && l.show.read && m.read && h('span.ln-read', l.group ? `既読 ${l.readN || ''}`.trim() : '既読'),
      l.show.time && ed.text(`${path}.time`, { cls: 'ln-time', ph: '12:00', label: '時刻' }));
    let content;
    if (m.kind === 'image') content = h('div.ln-pic', ed.image(`${path}.image`, { ratio: LINE_RATIOS[m.ratio] || 1, label: '写真', max: 1200 }));
    else if (m.kind === 'stamp') content = h('div.ln-stamp', ed.image(`${path}.image`, { ratio: 1, label: 'スタンプ', max: 480 }));
    else content = h('div.ln-bub' + (first ? '.tail' : ''), first && lineTail(), ed.text(`${path}.text`, { cls: 'ln-text', ph: 'メッセージ', multi: true, label: 'メッセージ' }));
    if (me) return pickable(h('div.ln-row.me' + (first ? '.first' : ''), h('div.ln-line', meta, content)), m.id);
    const pi = personIndex(l, m.from);
    return pickable(h('div.ln-row.them' + (first ? '.first' : ''),
      h('div.ln-ava', first && personAvatar(pi)),
      h('div.ln-col',
        first && l.group && l.show.names && h('div.ln-name', mirror(`line.people.${pi}.name`, '名前')),
        h('div.ln-line', content, meta))), m.id);
  }

  /* ---------------------------------------------------------------- Twitter風(共通) */
  const xw = () => X_WORDS[ed.state.x.words] || X_WORDS.post;
  function accAt(id) {
    const a = ed.state.x.accounts;
    const i = Math.max(0, a.findIndex((x) => x.id === id));
    return [a[i], i];
  }
  const accName = (i) => mirror(`x.accounts.${i}.name`, '名前');
  const accHandle = (i) => h('span.x-hd', '@', mirror(`x.accounts.${i}.handle`, 'username'));
  const accMarks = (a) => [a.badge && a.badge !== 'none' && xBadge(a.badge), a.locked && svg('lock', 16, 'x-lock')];
  const xAva = (i) => h('div.x-ava', ed.image(`x.accounts.${i}.avatar`, { ratio: 1, round: true, compact: true, label: 'アイコン', max: 400, onChange: () => ed.rerender() }));
  const xRich = (p, o) => richText(p, Object.assign({ urls: true, link: 'x-link' }, o));
  const xMedia = (p, path) => p.media && p.media !== 'none' && h('div.x-media', ed.image(`${path}.image`, { ratio: X_MEDIA[p.media] || 16 / 9, label: '画像', max: 1600 }));

  /** いいね等の列。o.counts: 数を横に出す / o.big: 詳しい表示用 / o.views: 表示回数を出す */
  function xActions(p, path, o) {
    const size = o.big ? 22 : 18.5;
    const cnt = (k, label) => o.counts && ed.text(`${path}.c.${k}`, { cls: 'x-n', ph: '0', label: `${label}の数` });
    const tg = (k, label, ic, cls) => h(`button.x-ab.${cls}`, {
      type: 'button', title: `${label}(押して切り替え)`, 'aria-label': `${label}(押して切り替え)`, 'aria-pressed': String(!!p[k]),
      onclick: () => ed.set(`${path}.${k}`, !p[k], { rerender: true })
    }, svg(ic, size));
    const W_ = xw();
    return h('div.x-acts' + (o.big ? '.big' : ''),
      h('div.x-act.a-reply', h('span.x-ab', svg('reply', size)), cnt('reply', '返信')),
      h('div.x-act.a-rt' + (p.reposted ? '.on' : ''), tg('reposted', W_.repost, 'repost', 'rt'), cnt('repost', W_.repost)),
      h('div.x-act.a-like' + (p.liked ? '.on' : ''), tg('liked', 'いいね', 'heart', 'like'), cnt('like', 'いいね')),
      o.views && h('div.x-act.a-view', h('span.x-ab', svg('views', size)), cnt('view', '表示')),
      h('div.x-act-r',
        h('div.x-act.a-bm' + (p.bookmarked ? '.on' : ''), tg('bookmarked', 'ブックマーク', 'bookmark', 'bm'), cnt('bookmark', 'ブックマーク')),
        h('span.x-ab', svg('share', size))));
  }
  /** 一覧・返信のポスト。o.up / o.down: 上下のポストと線でつなぐ / o.by: リポストした人(アカウントの番号) */
  function xPost(p, path, o) {
    const W_ = xw();
    const [a, ai] = accAt(p.acc);
    const label = p.label === 'pinned' ? h('div.x-label', svg('tack', 15), W_.pinned)
      : p.label === 'repost' ? h('div.x-label', svg('repost', 15), h('span', mirror(`x.accounts.${o.by || 0}.name`, '名前'), W_.reposted))
        : null;
    return pickable(h('article.x-post' + (o.up ? '.up' : '') + (o.down ? '.down' : ''),
      label,
      h('div.x-row',
        h('div.x-side', xAva(ai)),
        h('div.x-main',
          h('div.x-head',
            h('span.x-name', accName(ai)), accMarks(a),
            h('span.x-handle', accHandle(ai)),
            h('span.x-dot', '·'),
            ed.text(`${path}.time`, { cls: 'x-time', ph: '3時間', label: '時間' }),
            svg('more', 18, 'x-more')),
          p.replyTo && h('div.x-replyto', '返信先: ', h('span.x-link', p.replyTo)),
          xRich(`${path}.text`, { cls: 'x-text', ph: '本文', multi: true, label: '本文' }),
          xMedia(p, path),
          xActions(p, path, { counts: true, views: ed.state.x.views })))), p.id);
  }

  /* ---------------------------------------------------------------- Twitter風のプロフィールと投稿一覧 */
  const X_BUTTONS = { follow: ['フォロー', 'solid'], following: ['フォロー中', 'outline'], edit: ['プロフィールを編集', 'outline'] };
  function renderXProf(pr) {
    const x = ed.state.x, W_ = xw();
    const [a, ai] = accAt(pr.acc);
    const base = `x.accounts.${ai}`;
    const btn = X_BUTTONS[pr.button];
    const meta = (ic, p, ph, link) => h('span.xp-mi', svg(ic, 17), ed.text(p, { cls: 'xp-mt' + (link ? '.x-link' : ''), ph, label: ph }));
    const locked = pr.view === 'locked';
    const scroll = h('div.x-scroll',
      h('div.xp-banner' + (pr.show.bar ? '' : '.nobar'),
        ed.image('xprof.banner', { ratio: W / 150, label: 'ヘッダー画像', max: 1600 }),
        pr.show.bar && h('div.xp-sb', statusBar('xprof.clock')),
        h('div.xp-nav', h('span.xp-circ', svg('arrowL', 20)), h('span.xp-r', h('span.xp-circ', svg('search', 20)), h('span.xp-circ', svg('more', 20))))),
      h('div.xp-head',
        h('div.xp-ava', ed.image(`${base}.avatar`, { ratio: 1, round: true, compact: true, label: 'アイコン', max: 400, onChange: () => ed.rerender() })),
        btn && h(`span.xp-btn.${btn[1]}`, btn[0])),
      h('div.xp-info',
        h('div.xp-name', syncText(`${base}.name`, { cls: 'xp-nm', ph: '名前', label: '名前' }), accMarks(a)),
        h('div.xp-handle', '@', syncText(`${base}.handle`, { cls: 'xp-hd', ph: 'username', label: 'ユーザー名' }), pr.followsYou && h('span.xp-chip', 'フォローされています')),
        xRich('xprof.bio', { cls: 'xp-bio', ph: '自己紹介', multi: true, label: '自己紹介' }),
        h('div.xp-meta',
          meta('pin', 'xprof.location', '場所'),
          meta('link', 'xprof.link', 'リンク', true),
          meta('balloon', 'xprof.birth', '誕生日: 1月1日'),
          meta('calendar', 'xprof.joined', '2020年1月から利用しています')),
        h('div.xp-counts',
          h('span', ed.text('xprof.following', { cls: 'xp-cn', ph: '0', label: 'フォロー中の数' }), 'フォロー中'),
          h('span', ed.text('xprof.followers', { cls: 'xp-cn', ph: '0', label: 'フォロワーの数' }), 'フォロワー'))),
      locked
        ? h('div.xp-locked', h('b', W_.locked),
          h('p', '承認されたフォロワーだけが、', h('span', '@', mirror(`${base}.handle`, 'username')), `さんの${W_.title}を見られます。「フォロー」を押して、フォローリクエストを送りましょう。`))
        : [
          h('div.xp-tabs', W_.tabs.map((t, i) => h('button.xp-tab' + (i === (pr.tab | 0) ? '.on' : ''), {
            type: 'button', title: 'このタブを選んだ表示にする', onclick: () => ed.set('xprof.tab', i, { rerender: true })
          }, h('span', t)))),
          h('div.xp-posts', pr.posts.map((p, i) => xPost(p, `xprof.posts.${i}`, { by: ai })))
        ]);
    return h(`div.sns-sheet.x-sheet.xp-sheet.t-${x.theme}` + (pr.height === 'screen' ? '.screen' : ''),
      scroll,
      pr.show.nav && h('div.x-bnav',
        pr.show.fab && h('span.x-fab', svg('plus', 26)),
        // メッセージのマークは、言葉が「ポスト」なら吹き出し(今のチャット)、「ツイート」なら封筒(以前のDM)。数は右上の青い丸
        h('div.x-bnav-i', ['home', 'search', 'people', 'bell', x.words === 'tweet' ? 'mail' : 'chat'].map((n) => {
          const cnt = String((n === 'bell' ? pr.notif : n === 'mail' || n === 'chat' ? pr.dm : '') || '').trim();
          return h('span.x-bn', svg(n, 26, n === 'home' ? 'on' : ''), cnt && h('b.x-notif', cnt));
        })),
        homeBar()));
  }

  /* ---------------------------------------------------------------- Twitter風のリプのやり取り */
  /** 大きく表示するポスト(やり取りの中心) */
  function xFocus(p, path, o) {
    const t = ed.state.xthread, x = ed.state.x, W_ = xw();
    const [a, ai] = accAt(p.acc);
    const row = t.stats === 'row';
    const stat = (k, label) => h('span.x-stat', ed.text(`${path}.c.${k}`, { cls: 'x-sn', ph: '0', label: `${label}の数` }), `件の${label}`);
    return pickable(h('article.x-focus' + (o.up ? '.up' : ''),
      h('div.x-fhead',
        h('div.x-side', xAva(ai)),
        h('div.x-fwho',
          h('div.x-fname', h('span.x-name', accName(ai)), accMarks(a)),
          h('div.x-handle', accHandle(ai))),
        svg('more', 18, 'x-more')),
      p.replyTo && h('div.x-replyto', '返信先: ', h('span.x-link', p.replyTo)),
      xRich(`${path}.text`, { cls: 'x-ftext', ph: '本文', multi: true, label: '本文' }),
      xMedia(p, path),
      h('div.x-fmeta',
        ed.text('xthread.time', { cls: 'x-fm', ph: '午後3:12', label: '時刻' }),
        h('span', '·'),
        ed.text('xthread.date', { cls: 'x-fm', ph: todayLong(), label: '日付' }),
        x.views && [h('span.x-fv-dot', '·'), h('span.x-fv', ed.text(`${path}.c.view`, { cls: 'x-sn', ph: '0', label: '表示の数' }), '件の表示')]),
      row && h('div.x-stats', stat('repost', W_.repost), stat('quote', W_.quote), stat('like', 'いいね'), stat('bookmark', 'ブックマーク')),
      xActions(p, path, { counts: !row, big: true, views: false })), p.id);
  }
  function renderXThread(t) {
    const x = ed.state.x, W_ = xw();
    const n = t.posts.length;
    const f = Math.max(0, t.posts.findIndex((p) => p.id === t.focus));
    const list = t.posts.map((p, i) => {
      const path = `xthread.posts.${i}`;
      if (i < f) return xPost(p, path, { up: i > 0, down: true });   // 元のポストより前(さかのぼった分)は線でつながる
      if (i === f) return xFocus(p, path, { up: f > 0 });
      return xPost(p, path, { up: i - 1 > f && t.posts[i - 1].link, down: p.link && i + 1 < n });
    });
    return h(`div.sns-sheet.x-sheet.xt-sheet.t-${x.theme}` + (t.height === 'screen' ? '.screen' : ''),
      t.show.bar && statusBar('xthread.clock'),
      h('div.x-nav', svg('arrowL', 22), h('b', W_.title), h('span')),
      h('div.x-scroll', list),
      t.show.reply && h('div.x-replybar', h('span.x-replyph', W_.replyPh)),
      t.height === 'screen' && homeBar());
  }

  /* ---------------------------------------------------------------- 画面を組む */
  function render() {
    const s = ed.state;
    if (s.mode === 'post') return renderPost(s.post);
    if (s.mode === 'story') return renderStory(s.story);
    if (s.mode === 'line') return renderLine(s.line);
    if (s.mode === 'xprof') return renderXProf(s.xprof);
    if (s.mode === 'xthread') return renderXThread(s.xthread);
    return renderVlog(s.vlog);
  }

  /* ---------------------------------------------------------------- 設定の欄 */
  const sec = (title, ...body) => h('section.sns-sec', h('h3', title), ...body);
  const segOf = (opts, cur, pick, label) => h('div.seg', { role: 'group', 'aria-label': label },
    opts.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(v === cur), onclick: () => pick(v) }, text)));
  function checkOf(p, label) {
    const cb = h('input', { type: 'checkbox', checked: !!ed.get(p) });
    cb.addEventListener('change', () => { ed.set(p, cb.checked); drawSheet(); });
    return h('label.check', cb, label);
  }
  function numOf(p, label, min, max) {
    const inp = h('input', { type: 'number', min, max, step: 1, value: ed.get(p), inputmode: 'numeric', 'aria-label': label });
    inp.addEventListener('change', () => ed.set(p, clamp(Math.round(Number(inp.value)) || min, min, max), { rerender: true }));
    return h('label.sns-num', h('span', label), inp);
  }
  function sliderOf(label, min, max, value, onInput, fmt) {
    const out = h('output', fmt(value));
    const r = h('input', { type: 'range', min, max, step: 1, value, 'aria-label': label });
    r.addEventListener('input', () => { const v = Number(r.value); out.textContent = fmt(v); onInput(v); });
    return h('label.sns-range', h('span', label), r, out);
  }
  /** 入力欄の文字を、画面の中の同じ印の文字にすぐ映す */
  function liveInput(value, ph, label, onInput) {
    const inp = h('input', { type: 'text', value, placeholder: ph, 'aria-label': label });
    inp.addEventListener('input', () => onInput(inp.value));
    return inp;
  }

  function sideVlog(v) {
    const time = liveInput(v.people[0].time || '', '19:00', 'すべてのコマの時刻', (t) => {
      v.people.forEach((p) => { p.time = t; });
      ed.dirty();
      if (ed.sheet) ed.sheet.querySelectorAll('.vl-time').forEach((el) => { el.textContent = t; el.classList.toggle('is-empty', !t.trim()); });
    });
    const mark = liveInput(v.mark, 'vlog', '左のマークの文字', (t) => {
      ed.set('vlog.mark', t);
      if (ed.sheet) ed.sheet.querySelectorAll('.vl-mark').forEach((el) => { el.textContent = t || 'vlog'; });
    });
    return [
      sec('人数',
        segOf([[2, '2人'], [3, '3人'], [4, '4人']], v.count, (n) => ed.set('vlog.count', n, { rerender: true }), '人数'),
        h('p.hint', '縦長の画面を人数分に上下で分けます。画像のないコマは、撮っていない時間のように黒い画面になります。')),
      sec('時刻',
        time,
        segOf([['center', '中央'], ['right', '右']], v.timePos, (x) => ed.set('vlog.timePos', x, { rerender: true }), '時刻の位置'),
        h('p.hint', 'ここに入れると、すべてのコマの時刻をそろえます(コマごとに画面の上で書き換えることもできます)。グループのログは中央、1人のログは右に出ます。')),
      sec('表示',
        checkOf('vlog.show.name', '名前'),
        checkOf('vlog.show.caption', 'キャプション'),
        checkOf('vlog.show.time', '時刻'),
        checkOf('vlog.show.mark', '左のマーク'),
        mark,
        checkOf('vlog.gap', 'コマの間に細い線'))
    ];
  }

  function sidePost(p) {
    const addTag = () => {
      p.tags.push({ id: U.uid(), t: 'username', x: 50, y: 40 + (p.tags.length % 4) * 10 });
      p.show.tags = true;
      ed.set('post.tags', p.tags, { rerender: true });
    };
    return [
      sec('写真',
        segOf([['square', '正方形'], ['portrait', '縦長 4:5'], ['landscape', '横長']], p.ratio, (r) => ed.set('post.ratio', r, { rerender: true }), '写真の形'),
        h('div.sns-row', numOf('post.pages', '枚数', 1, 10), numOf('post.page', '何枚目', 1, 10)),
        h('p.hint', '2枚以上にすると、右上の「1/3」と写真の下の点が出ます。')),
      sec('タグ付け',
        h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: addTag }, icon('plus'), 'タグを追加'),
        checkOf('post.show.tags', '写真の上にタグを出す'),
        h('p.hint', 'タグはドラッグで動かせます。名前は押して書き換え、×で消せます。キャプションの #ハッシュタグ と @メンション には色が付きます。')),
      sec('反応',
        checkOf('post.liked', 'いいね済み(赤いハート)'),
        checkOf('post.saved', '保存済み'),
        h('p.hint', '画面のハートや保存のマークを押しても切り替わります。')),
      sec('表示',
        checkOf('post.show.bar', 'ステータスバーと上の見出し'),
        checkOf('post.show.ring', 'アイコンのまわりの輪'),
        checkOf('post.show.verified', '認証バッジ'),
        checkOf('post.show.location', '位置情報'),
        checkOf('post.show.dark', 'ダークモード'))
    ];
  }

  function stickerControls(st) {
    const isText = st.type === 'text';
    const set = (k, v) => { st[k] = v; ed.dirty(); ed.rerender(); };
    const live = () => { const el = stickerNode(st.id); if (el) placeSticker(el, st); ed.dirty(); };
    const out = [
      sliderOf('大きさ', 30, 400, Math.round(st.size * 100), (v) => { st.size = v / 100; live(); }, (v) => v + '%'),
      sliderOf('回転', -45, 45, Math.round(st.rot || 0), (v) => { st.rot = v; live(); }, (v) => v + '°'),
      segOf(isText ? [['plain', '文字だけ'], ['box', '背景つき']] : [['white', '白'], ['color', 'カラー'], ['clear', '透明']], st.style, (v) => set('style', v), 'スタイル')
    ];
    if (isText) {
      out.push(
        segOf([['classic', 'ふつう'], ['serif', '明朝'], ['mono', 'タイプ'], ['strong', '太字']], st.font, (v) => set('font', v), '字体'),
        segOf([['left', '左'], ['center', '中央'], ['right', '右']], st.align, (v) => set('align', v), 'そろえ'),
        h('div.sns-sw', { role: 'group', 'aria-label': '色' },
          TEXT_COLORS.map((c) => h('button', { type: 'button', title: c, 'aria-label': `色 ${c}`, 'aria-pressed': String((st.color || '').toLowerCase() === c), style: { '--c': c }, onclick: () => set('color', c) })),
          h('button.sns-sw-more', {
            type: 'button', title: 'ほかの色(画像からスポイトも)', 'aria-label': 'ほかの色を選ぶ',
            onclick: async () => { const v = await Ed.pickColor({ value: st.color, title: '文字の色', sources: ed.images() }); if (v) set('color', v); }
          }, icon('plus', 14))));
    }
    out.push(h('div.sns-row',
      h('button.btn.btn-outline.btn-sm', {
        type: 'button', onclick: () => { const a = ed.state.story.stickers; a.push(a.splice(a.indexOf(st), 1)[0]); ed.set('story.stickers', a, { rerender: true }); }
      }, icon('up'), 'いちばん前へ'),
      h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => removeSticker(st.id) }, icon('trash'), '削除')));
    return out;
  }

  function sideStory(s) {
    const st = s.stickers.find((x) => x.id === selected);
    return [
      sec('スタンプを追加',
        h('div.sns-add', Object.entries(STICKERS).map(([type, d]) => h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addSticker(type) }, icon('plus'), d.label))),
        h('p.hint', 'スタンプは画面の上でドラッグして動かし、押して文字を書き換えます。選んだスタンプはホイールでも大きさを変えられます(Deleteキーで削除)。')),
      st && sec(`選んだスタンプ(${(STICKERS[st.type] || STICKERS.text).label})`, ...stickerControls(st)),
      sec('上のバー',
        h('div.sns-row', numOf('story.segs', '枚数', 1, 10), numOf('story.cur', '何枚目', 1, 10)),
        sliderOf('進み', 0, 100, clamp(s.prog, 0, 100), (v) => {
          s.prog = v;
          ed.dirty();
          const bar = ed.sheet && ed.sheet.querySelector('.st-bar.cur i');
          if (bar) bar.style.width = v + '%';
        }, (v) => v + '%')),
      sec('背景(画像がないとき)',
        h('div.sns-sw.sns-bg', { role: 'group', 'aria-label': '背景' }, BGS.map(([id, css, name]) => h('button', {
          type: 'button', title: name, 'aria-label': `背景 ${name}`, 'aria-pressed': String(s.bg === id), style: { '--c': css },
          onclick: () => ed.set('story.bg', id, { rerender: true })
        })))),
      sec('表示',
        checkOf('story.show.frame', '画面の上下(ステータスバー・返信欄)'),
        checkOf('story.show.reply', '返信欄'),
        checkOf('story.show.shade', '上を少し暗く'),
        checkOf('story.show.music', '音楽'))
    ].filter(Boolean);
  }

  /* ---------- LINE・Twitter の設定で使う部品 ---------- */
  const lab = (t) => h('div.sns-lab', t);
  /** 文字の欄(打つと少し待って画面を描き直す) */
  function fieldOf(p, label, ph, o) {
    o = o || {};
    const inp = h('input', { type: 'text', value: ed.get(p) || '', placeholder: ph || '', 'aria-label': label, inputmode: o.num ? 'numeric' : null });
    inp.addEventListener('input', () => { ed.set(p, inp.value); drawSoon(); });
    return h('label.sns-field', h('span', label), inp);
  }
  /** 名前など、画面の中のあちこちに映る文字の欄(描き直さず、映っている文字だけ書き換える) */
  function mirrorField(p, label, ph, clean) {
    const inp = h('input', { type: 'text', value: ed.get(p) || '', placeholder: ph || '', 'aria-label': label, 'data-mirror': p });
    inp.addEventListener('input', () => { ed.set(p, clean ? clean(inp.value) : inp.value); syncMirrors(p, inp); });
    return inp;
  }
  /** オブジェクトの true/false を切り替えるチェック */
  function checkProp(obj, k, label) {
    const cb = h('input', { type: 'checkbox', checked: !!obj[k] });
    cb.addEventListener('change', () => { obj[k] = cb.checked; ed.dirty(); drawSheet(); });
    return h('label.check', cb, label);
  }
  /** 色の丸(押すと、パレット・カラーコード・画像からスポイトで選べる) */
  function colorBtn(p, title, fb) {
    const v = ed.get(p) || fb;
    return h('button.sns-cbtn', {
      type: 'button', title: `${title}を変える(画像からスポイトもできます)`, 'aria-label': `${title} ${v}(押して変える)`, style: { '--c': v },
      onclick: async () => { const c = await Ed.pickColor({ value: ed.get(p) || fb, title, sources: ed.images() }); if (c) { ed.set(p, c); ed.rerender(); } }
    }, h('i'), h('span', v.toUpperCase()));
  }
  /** 選んでいる項目を、上へ・下へ・削除 */
  function itemTools(path, onRemove) {
    const arr = ed.get(path);
    const i = arr.findIndex((x) => x.id === selected);
    const mv = (d) => { const j = i + d; if (i < 0 || j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; ed.set(path, arr, { rerender: true }); };
    return h('div.sns-row',
      h('button.btn.btn-outline.btn-sm', { type: 'button', disabled: i <= 0, onclick: () => mv(-1) }, icon('up'), '上へ'),
      h('button.btn.btn-outline.btn-sm', { type: 'button', disabled: i < 0 || i >= arr.length - 1, onclick: () => mv(1) }, icon('down'), '下へ'),
      h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: onRemove }, icon('trash'), '削除'));
  }
  /** 追加した項目の文字にすぐ書き込めるようにする */
  function focusItem(id, sel) {
    const el = ed.sheet && ed.sheet.querySelector(`.sns-item[data-id="${id}"] ${sel}`);
    if (el) el.focus();
  }

  /* ---------- LINE の設定 ---------- */
  function addMsg(from) {
    const l = ed.state.line;
    const last = [...l.msgs].reverse().find((x) => !isCenter(x));
    const m = newMsg(from);
    if (from === 'date') m.text = '今日';
    else if (last) m.time = last.time;
    const i = l.msgs.findIndex((x) => x.id === selected);
    l.msgs.splice(i < 0 ? l.msgs.length : i + 1, 0, m);
    selected = m.id;
    ed.set('line.msgs', l.msgs, { rerender: true });
    if (from !== 'date') focusItem(m.id, '.ln-text, .ln-sys');
  }
  function removeMsg(id) {
    const l = ed.state.line;
    l.msgs = l.msgs.filter((x) => x.id !== id);
    if (selected === id) selected = null;
    ed.set('line.msgs', l.msgs, { rerender: true });
  }
  async function removePerson(p) {
    const l = ed.state.line;
    const used = l.msgs.some((m) => m.from === p.id);
    if (used && !(await U.confirmDialog({ title: 'メンバーを消す', message: `「${p.name || '名前なし'}」を消しますか?(この人のメッセージは、残っている最初のメンバーのものになります)`, okLabel: '消す', danger: true }))) return;
    l.people = l.people.filter((x) => x !== p);
    l.msgs.forEach((m) => { if (m.from === p.id) m.from = l.people[0].id; });
    ed.dirty();
    ed.rerender();
  }
  const personLabel = (l, p, i) => p.name || (l.group ? `メンバー${i + 1}` : '相手');
  /** ボタンなどに出す名前(名前の欄に打つと、すぐ書き換わる) */
  const personTag = (l, i) => mirror(`line.people.${i}.name`, l.group ? `メンバー${i + 1}` : '相手');

  function lineMsgControls(l, m) {
    const set = (k, v) => { m[k] = v; ed.dirty(); ed.rerender(); };
    const out = [
      lab('送った人'),
      segOf([...l.people.map((p, i) => [p.id, personTag(l, i)]), ['me', '自分'], ['date', '日付'], ['sys', 'お知らせ']], m.from, (v) => set('from', v), '送った人')
    ];
    if (!isCenter(m)) {
      out.push(lab('種類'), segOf([['text', '文字'], ['image', '写真'], ['stamp', 'スタンプ']], m.kind, (v) => set('kind', v), '種類'));
      if (m.kind === 'image') out.push(segOf([['square', '正方形'], ['wide', '横長'], ['tall', '縦長']], m.ratio, (v) => set('ratio', v), '写真の形'));
      if (m.kind === 'stamp') out.push(h('p.hint', 'スタンプは背景が透明な画像(PNG)を入れると、吹き出しなしで表示されます。'));
      if (m.from === 'me') out.push(checkProp(m, 'read', '既読を付ける'));
    }
    out.push(itemTools('line.msgs', () => removeMsg(m.id)));
    return out;
  }
  function sideLine(l) {
    const m = l.msgs.find((x) => x.id === selected);
    const dark = lumOf(l.bg) < 0.4;
    return [
      sec('メッセージを追加',
        h('div.sns-add',
          l.people.map((p, i) => h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addMsg(p.id) }, icon('plus'), personTag(l, i))),
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addMsg('me') }, icon('plus'), '自分'),
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addMsg('date') }, icon('plus'), '日付'),
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addMsg('sys') }, icon('plus'), 'お知らせ')),
        h('p.hint', '選んでいるメッセージのすぐ下に入ります(選んでいなければいちばん下)。メッセージは押すと選べて、文字はそのまま書き換えられます。続けて同じ人が送ると、アイコンとしっぽは最初の1つだけに付きます。')),
      m && sec('選んだメッセージ', ...lineMsgControls(l, m)),
      sec('トーク',
        segOf([[false, '1対1'], [true, 'グループ']], !!l.group, (v) => { l.group = v; ed.dirty(); ed.rerender(); }, 'トークの種類'),
        l.group && fieldOf('line.members', '人数', '3', { num: true }),
        l.group && fieldOf('line.readN', '既読の数', '2', { num: true }),
        fieldOf('line.unread', '戻るの横の数', '空なら出さない', { num: true }),
        h('p.hint', l.group ? 'グループでは、名前の後ろに人数が付き、既読は「既読 2」のように数が付きます。' : 'トークの名前は画面の上で押して書き換えます。')),
      sec(l.group ? 'メンバー' : '相手',
        h('div.sns-accs', l.people.map((p, i) => h('div.sns-acc',
          h('div.sns-acc-ava', personAvatar(i)),
          h('div.sns-acc-f', mirrorField(`line.people.${i}.name`, '名前', l.group ? `メンバー${i + 1}` : '名前')),
          l.group && l.people.length > 1 && h('button.sns-acc-x', { type: 'button', title: 'このメンバーを消す', 'aria-label': 'このメンバーを消す', onclick: () => removePerson(p) }, icon('trash', 14))))),
        l.group && h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { l.people.push(newPerson()); ed.set('line.people', l.people, { rerender: true }); } }, icon('plus'), 'メンバーを追加'),
        h('p.hint', l.group ? 'グループでは、吹き出しの上に名前が出ます。' : '相手の名前は、トークの名前とは別です(グループにしたときに吹き出しの上に出ます)。')),
      sec('背景と色',
        h('div.sns-sw.sns-bg', { role: 'group', 'aria-label': '背景の色' },
          LINE_BGS.map(([c, name]) => h('button', {
            type: 'button', title: name, 'aria-label': `背景 ${name}`, 'aria-pressed': String((l.bg || '').toLowerCase() === c), style: { '--c': c },
            onclick: () => ed.set('line.bg', c, { rerender: true })
          }))),
        h('div.sns-row', h('span.sns-lab', '背景の色'), colorBtn('line.bg', '背景の色', LINE_BGS[0][0])),
        h('div.sns-row', h('span.sns-lab', '自分の吹き出し'), colorBtn('line.me', '自分の吹き出しの色', LINE_ME),
          (l.me || LINE_ME).toLowerCase() !== LINE_ME && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => ed.set('line.me', LINE_ME, { rerender: true }) }, '緑に戻す')),
        h('div.sns-bgimg',
          h('div.sns-bgimg-slot', ed.image('line.bgImage', { ratio: W / SCREEN_H, compact: true, label: '背景の画像', max: 1600, onChange: () => ed.rerender() })),
          h('p.hint', '背景の画像(押して選ぶ・ドラッグ・貼り付け)。画面いっぱいに広げて表示します。' + (dark ? '' : '暗い画像のときは、背景の色を「ダーク」にすると文字が白になります。'))),
        h('p.hint', '背景の色を暗くすると、相手の吹き出しや上下の帯も暗い画面(ダークモード)用になります。')),
      sec('表示',
        segOf([['screen', 'スマホ1画面'], ['auto', '内容に合わせる']], l.height, (v) => ed.set('line.height', v, { rerender: true }), '画面の高さ'),
        h('p.hint', l.height === 'screen' ? '1画面に入りきらないときは、古いメッセージが上に隠れます(全部見たいときは「内容に合わせる」)。' : '縦に長い画像になります。'),
        checkOf('line.show.bar', 'ステータスバー'),
        checkOf('line.show.head', '上の名前の帯'),
        checkOf('line.show.input', '下の入力欄'),
        checkOf('line.show.time', '時刻'),
        checkOf('line.show.read', '既読'),
        l.group && checkOf('line.show.names', '吹き出しの上の名前'))
    ].filter(Boolean);
  }

  /* ---------- Twitter の設定 ---------- */
  async function removeAccount(a) {
    const x = ed.state.x;
    const used = ['xprof', 'xthread'].some((k) => ed.state[k].posts.some((p) => p.acc === a.id)) || ed.state.xprof.acc === a.id;
    if (used && !(await U.confirmDialog({ title: 'アカウントを消す', message: `「${a.name || '名前なし'}」を消しますか?(このアカウントのポストは、残っている最初のアカウントのものになります)`, okLabel: '消す', danger: true }))) return;
    x.accounts = x.accounts.filter((y) => y !== a);
    const first = x.accounts[0].id;
    ['xprof', 'xthread'].forEach((k) => ed.state[k].posts.forEach((p) => { if (p.acc === a.id) p.acc = first; }));
    if (ed.state.xprof.acc === a.id) ed.state.xprof.acc = first;
    ed.dirty();
    ed.rerender();
  }
  const accLabel = (a, i) => a.name || `アカウント${i + 1}`;
  const accTag = (i) => mirror(`x.accounts.${i}.name`, `アカウント${i + 1}`);
  function sideAccounts() {
    const x = ed.state.x;
    return sec('アカウント',
      h('div.sns-accs', x.accounts.map((a, i) => h('div.sns-acc',
        h('div.sns-acc-ava', ed.image(`x.accounts.${i}.avatar`, { ratio: 1, round: true, compact: true, label: 'アイコン', max: 400, onChange: () => ed.rerender() })),
        h('div.sns-acc-f',
          mirrorField(`x.accounts.${i}.name`, '名前', `アカウント${i + 1}の名前`),
          h('div.sns-at', h('span', '@'), mirrorField(`x.accounts.${i}.handle`, 'ユーザー名(@のあと)', 'username', (v) => v.replace(/^[@＠]+/, '').replace(/\s/g, ''))),
          h('div.sns-row',
            segOf([['none', 'なし'], ['blue', '青'], ['gold', '金']], a.badge || 'none', (v) => { a.badge = v; ed.dirty(); ed.rerender(); }, '認証バッジ'),
            checkProp(a, 'locked', '鍵'))),
        x.accounts.length > 1 && h('button.sns-acc-x', { type: 'button', title: 'このアカウントを消す', 'aria-label': 'このアカウントを消す', onclick: () => removeAccount(a) }, icon('trash', 14))))),
      h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { x.accounts.push(newAccount()); ed.set('x.accounts', x.accounts, { rerender: true }); } }, icon('plus'), 'アカウントを追加'),
      h('p.hint', '名前・@ユーザー名・アイコンは、プロフィールとリプの画面で共通です。バッジの「青」は認証済み、「金」は企業などのマーク。「鍵」は非公開アカウント(名前の横に鍵)。'));
  }
  function sideXLook(where) {
    const x = ed.state.x, s = ed.state[where];
    return sec('見た目',
      lab('画面の色'),
      segOf([['light', 'ライト'], ['dim', 'ダークブルー'], ['dark', 'ブラック']], x.theme, (v) => ed.set('x.theme', v, { rerender: true }), '画面の色'),
      lab('言葉'),
      segOf([['post', 'ポスト(今のX)'], ['tweet', 'ツイート(以前)']], x.words, (v) => ed.set('x.words', v, { rerender: true }), '言葉'),
      lab('画面の高さ'),
      segOf([['auto', '内容に合わせる'], ['screen', 'スマホ1画面']], s.height, (v) => ed.set(`${where}.height`, v, { rerender: true }), '画面の高さ'),
      checkOf('x.views', '表示回数(棒グラフのマーク)'),
      h('p.hint', '色・言葉・表示回数は、プロフィールとリプの画面で共通です。'));
  }
  /** 選んだポストの設定 */
  function sideXPost(where, p) {
    const x = ed.state.x, W_ = xw();
    const set = (k, v) => { p[k] = v; ed.dirty(); ed.rerender(); };
    const reply = h('input', { type: 'text', value: p.replyTo || '', placeholder: '@username(空なら出さない)', 'aria-label': '返信先' });
    reply.addEventListener('input', () => { p.replyTo = reply.value; ed.dirty(); drawSoon(); });
    const out = [
      lab('アカウント'),
      segOf(x.accounts.map((a, i) => [a.id, accTag(i)]), accAt(p.acc)[0].id, (v) => set('acc', v), 'アカウント')
    ];
    if (where === 'xprof') out.push(lab('上のラベル'), segOf([['none', 'なし'], ['pinned', '固定'], ['repost', W_.repost]], p.label, (v) => set('label', v), '上のラベル'));
    out.push(
      h('label.sns-field', h('span', '返信先'), reply),
      lab('画像'),
      segOf([['none', 'なし'], ['wide', '横長'], ['square', '正方形'], ['tall', '縦長']], p.media || 'none', (v) => set('media', v), '画像'),
      lab('反応(マークを押しても切り替わります)'),
      checkProp(p, 'liked', 'いいね済み(ピンクのハート)'),
      checkProp(p, 'reposted', `${W_.repost}済み(緑)`),
      checkProp(p, 'bookmarked', 'ブックマーク済み(青)'));
    if (where === 'xthread') {
      const t = ed.state.xthread;
      const i = t.posts.indexOf(p), f = t.posts.findIndex((q) => q.id === t.focus);
      if (p.id !== t.focus) out.push(h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => ed.set('xthread.focus', p.id, { rerender: true }) }, icon('zoomin'), 'このポストを大きく表示する'));
      if (i > f && i < t.posts.length - 1) out.push(checkProp(p, 'link', '下のポストと線でつなぐ(やり取り)'));
    }
    out.push(itemTools(`${where}.posts`, () => removePost(where, p.id)));
    return sec(`選んだ${W_.title}`, ...out);
  }
  function addPost(where, acc, o) {
    const s = ed.state[where];
    const p = Object.assign(newXPost(acc), o);
    const i = s.posts.findIndex((x) => x.id === selected);
    s.posts.splice(i < 0 ? s.posts.length : i + 1, 0, p);
    selected = p.id;
    ed.set(`${where}.posts`, s.posts, { rerender: true });
    focusItem(p.id, '.x-text, .x-ftext');
  }
  function removePost(where, id) {
    const s = ed.state[where];
    s.posts = s.posts.filter((x) => x.id !== id);
    if (where === 'xthread' && s.focus === id && s.posts.length) s.focus = s.posts[0].id;
    if (selected === id) selected = null;
    ed.set(`${where}.posts`, s.posts, { rerender: true });
  }
  function sideXProf(pr) {
    const x = ed.state.x, W_ = xw();
    const p = pr.posts.find((q) => q.id === selected);
    const [a] = accAt(pr.acc);
    const other = x.accounts.find((y) => y.id !== a.id);
    return [
      sec('プロフィール',
        lab('だれのプロフィール'),
        segOf(x.accounts.map((y, i) => [y.id, accTag(i)]), a.id, (v) => ed.set('xprof.acc', v, { rerender: true }), 'だれのプロフィール'),
        lab('右上のボタン'),
        segOf([['edit', 'プロフィールを編集'], ['follow', 'フォロー'], ['following', 'フォロー中'], ['none', 'なし']], pr.button, (v) => ed.set('xprof.button', v, { rerender: true }), '右上のボタン'),
        checkOf('xprof.followsYou', '「フォローされています」を付ける'),
        lab('下に出すもの'),
        segOf([['posts', `${W_.title}の一覧`], ['locked', '非公開(フォロー前に見た画面)']], pr.view, (v) => ed.set('xprof.view', v, { rerender: true }), '下に出すもの'),
        h('p.hint', '名前・自己紹介・場所などは画面の上で押して書き換えます(空の項目は画像に出ません)。ヘッダー画像は押して選びます。タブは押すと選んだ表示になります。')),
      pr.view !== 'locked' && sec(`${W_.title}を追加`,
        h('div.sns-add',
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addPost('xprof', a.id) }, icon('plus'), W_.title),
          h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addPost('xprof', (other || a).id, { label: 'repost' }) }, icon('plus'), W_.repost)),
        h('p.hint', `${W_.title}は押すと選べます。いいね等の数は、マークの横を押して書き換えます(空なら数を出しません)。`)),
      p && sideXPost('xprof', p),
      sideAccounts(),
      sideXLook('xprof'),
      sec('表示',
        checkOf('xprof.show.bar', 'ステータスバー'),
        checkOf('xprof.show.nav', '下のメニュー'),
        pr.show.nav && fieldOf('xprof.notif', '通知の数', '空なら出さない'),
        pr.show.nav && fieldOf('xprof.dm', x.words === 'tweet' ? 'DMの数' : 'チャットの数', '空なら出さない'),
        pr.show.nav && h('p.hint', `下のメニューのベル(通知)と${x.words === 'tweet' ? '封筒(DM)' : '吹き出し(チャット)'}の右上に、青い丸で出ます(例: 3、20+)。メッセージのマークは、言葉を「ポスト」にすると吹き出し、「ツイート」にすると封筒になります。`),
        pr.show.nav && checkOf('xprof.show.fab', '投稿ボタン(右下の丸)'))
    ].filter(Boolean);
  }
  function sideXThread(t) {
    const x = ed.state.x, W_ = xw();
    const p = t.posts.find((q) => q.id === selected);
    return [
      sec(`${W_.title}を追加`,
        h('div.sns-add', x.accounts.map((a, i) => h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => addPost('xthread', a.id) }, icon('plus'), accTag(i)))),
        h('p.hint', `選んでいる${W_.title}のすぐ下に入ります。大きく表示する${W_.title}(やり取りの元)より上は、さかのぼったリプとして線でつながります。下は返信で、「下のポストと線でつなぐ」でやり取りの線を付けられます。`)),
      p && sideXPost('xthread', p),
      sec('数の出し方',
        segOf([['icons', 'マークの横'], ['row', '文字で並べる']], t.stats, (v) => ed.set('xthread.stats', v, { rerender: true }), '数の出し方'),
        h('p.hint', t.stats === 'row'
          ? `大きいポストの数を「12 件の${W_.repost}」のように並べます(以前の表示)。数は押して書き換え、空にすると出ません。`
          : '数はマークの横を押して書き換えます。空にすると数を出しません。')),
      sideAccounts(),
      sideXLook('xthread'),
      sec('表示',
        checkOf('xthread.show.bar', 'ステータスバー'),
        checkOf('xthread.show.reply', '下の返信欄'))
    ].filter(Boolean);
  }

  function renderSide() {
    const s = ed.state;
    const y = side.scrollTop;
    const parts = s.mode === 'post' ? sidePost(s.post) : s.mode === 'story' ? sideStory(s.story)
      : s.mode === 'line' ? sideLine(s.line) : s.mode === 'xprof' ? sideXProf(s.xprof) : s.mode === 'xthread' ? sideXThread(s.xthread)
        : sideVlog(s.vlog);
    side.replaceChildren(...parts);
    side.scrollTop = y;
  }

  /* ---------------------------------------------------------------- ツールバー */
  const modeSeg = h('div.seg.sns-modes', { role: 'group', 'aria-label': '作る画面' },
    MODES.map(([id, label, sub]) => h('button', {
      type: 'button', 'data-mode': id, title: sub,
      onclick: () => { if (id !== ed.state.mode) { selected = null; ed.set('mode', id, { rerender: true }); } }
    }, label)));
  const syncToolbar = () => modeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === ed.state.mode)));

  async function importTo(apply, label) {
    const r = await Ed.pickUserprof();
    if (!r) return;
    apply(r.user, r.image ? Object.assign({}, r.image) : null);
    await ed.save();
    ed.rerender();
    U.toast(`「${r.user.name || 'user'}」を${label}に読み込みました`);
  }
  /** userprof から読み込む先 [ボタンの名前, (user, 画像) => 入れる] */
  function importTargets(s) {
    const into = (o, imgKey) => (u, img) => { o.name = u.name || o.name; if (img) o[imgKey] = img; };
    if (s.mode === 'vlog') return range(clamp(s.vlog.count | 0, 2, 4)).map((i) => [`${i + 1}人目`, into(s.vlog.people[i], 'image')]);
    if (s.mode === 'line') return s.line.people.map((p, i) => [personLabel(s.line, p, i), into(p, 'avatar')]);
    if (s.mode === 'xprof' || s.mode === 'xthread') return s.x.accounts.map((a, i) => [accLabel(a, i), into(a, 'avatar')]);
    return [['アカウント', into(s[s.mode].user, 'avatar')]];
  }
  const imp = ed.popover('userprofから', 'book', (close) => {
    const s = ed.state;
    const lead = s.mode === 'vlog' ? 'userprof に保存した user の名前と1枚目の画像を、何人目のコマに読み込むか選んでください。'
      : s.mode === 'line' ? 'userprof に保存した user の名前と1枚目の画像を、どの人の名前とアイコンに読み込むか選んでください。'
        : s.mode === 'xprof' || s.mode === 'xthread' ? 'userprof に保存した user の名前と1枚目の画像を、どのアカウントの名前とアイコンに読み込むか選んでください。'
          : 'userprof に保存した user の名前と1枚目の画像を、アカウントの名前とアイコンに読み込みます。';
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('p.hint', lead),
      importTargets(s).map(([label, apply]) => h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { close(); importTo(apply, label); } }, `${label}に読み込む`)));
  });

  async function clearMode() {
    const m = ed.state.mode;
    const name = MODES.find(([id]) => id === m)[1];
    const isX = m === 'xprof' || m === 'xthread';
    const note = isX ? '(ほかの画面はそのままです。アカウントの名前・アイコンは2つのTwitterの画面で共通なので残します)' : '(ほかの画面はそのままです)';
    if (!(await U.confirmDialog({ title: 'クリア', message: `「${name}」の画面の入力と画像を消して、最初の状態に戻しますか?${note}`, okLabel: '消す', danger: true }))) return;
    ed.state[m] = defaults()[m];
    if (m === 'xprof') ed.state.xprof.acc = ed.state.x.accounts[0].id;
    selected = null;
    await ed.save();
    ed.rerender();
  }
  function fileName() {
    const s = ed.state;
    let who;
    if (s.mode === 'vlog') who = s.vlog.people.slice(0, s.vlog.count).map((p) => p.name).filter(Boolean).join('_');
    else if (s.mode === 'line') who = s.line.title || s.line.people.map((p) => p.name).filter(Boolean).join('_');
    else if (s.mode === 'xprof') who = accAt(s.xprof.acc)[0].name;
    else if (s.mode === 'xthread') who = accAt((s.xthread.posts.find((p) => p.id === s.xthread.focus) || {}).acc)[0].name;
    else who = s[s.mode].user.name;
    return `usersns_${s.mode}_${U.safeName(who, U.stamp())}.png`;
  }
  toolbar.append(
    modeSeg,
    imp,
    h('span.spacer'),
    h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: ed.saveJson, title: '3つの画面の入力内容をまとめてファイルに保存' }, icon('save'), '保存'),
    ed.fileButton('読み込み', ed.loadJson),
    h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: clearMode, title: 'いま開いている画面だけを最初の状態に戻す' }, icon('trash'), 'クリア'),
    ed.exportButton(fileName));

  /* ---------------------------------------------------------------- 選ぶ・やめる */
  let swallowClick = false;
  document.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    if (!selected) return;
    const t = e.target;
    if (t.closest && t.closest('.st-sticker, .sns-item, .sns-side, dialog, .ed-pop')) return;
    swallowClick = !!(t.closest && t.closest('.st-frame'));
    setSelected(null);
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      toolbar.querySelector('.btn-primary').click();
      return;
    }
    if (!selected) return;
    if (e.target.closest && e.target.closest('[contenteditable],input,textarea,select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    else if (e.key === 'Escape') setSelected(null);
  });
  function removeSelected() {
    const m = ed.state.mode;
    if (m === 'story') removeSticker(selected);
    else if (m === 'line') removeMsg(selected);
    else if (m === 'xprof' || m === 'xthread') removePost(m, selected);
  }

  /* ---------------------------------------------------------------- 起動 */
  document.body.append(Kit.footer('実在のSNS・アプリとは関係のない、見た目を似せたファンメイドの画面メーカーです。'));
  // 画面を作り直すときは、設定の欄とツールバーもそろえる
  const drawSheet = ed.rerender;
  ed.rerender = () => { drawSheet(); renderSide(); syncToolbar(); };
  ed.load().then(() => { ed.rerender(); U.hydrateIcons(document); });
  window.__usersns = ed;   // 動作確認用
})();
