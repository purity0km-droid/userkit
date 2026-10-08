/* usersns: SNS風の画面 — セットログ風のVlog(2〜4人) / インスタ風の投稿(タグ付け) / インスタ風のストーリー
 *  3つの画面は上の切り替えで行き来する。内容は3つまとめて1つの状態に持ち、自動で保存する。
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
  const MODES = [['vlog', 'Vlog', 'セットログ風・2〜4人'], ['post', 'インスタ投稿', 'タグ付けできる通常の投稿'], ['story', 'ストーリー', 'インスタ風のストーリー']];

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
    verified: '<path d="M12 1.8l2.4 1.9 3-.4 1 2.9 2.8 1.2-.4 3 1.9 2.4-1.9 2.4.4 3-2.8 1.2-1 2.9-3-.4-2.4 1.9-2.4-1.9-3 .4-1-2.9-2.8-1.2.4-3L1.3 12l1.9-2.4-.4-3 2.8-1.2 1-2.9 3 .4z" fill="#0095f6" stroke="none"/><path d="m8.2 12.3 2.6 2.6 5-5.2" stroke="#fff" stroke-width="2.2"/>'
  };
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

  /* ---------------------------------------------------------------- 初期値 */
  const today = () => { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日`; };
  const vlogPerson = () => ({ name: '', image: null, caption: '', time: '19:00' });
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
    }
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
  function liveMirror(el, p) {
    el.addEventListener('input', () => {
      if (!ed.sheet) return;
      ed.sheet.querySelectorAll(`[data-mirror="${p}"]`).forEach((n) => { n.textContent = ed.get(p) || n.dataset.fb; });
    });
    return el;
  }
  /** #ハッシュタグ・@メンションに色を付ける文字(書いている間はそのまま、離れたら色付け) */
  function richText(p, o) {
    const el = ed.text(p, o);
    const paint = () => {
      const v = ed.get(p) || '';
      if (!v) return;
      const parts = v.split(/([#＃][^\s#＃@＠,，、。.!！?？]+|[@＠][A-Za-z0-9._]+)/);
      el.replaceChildren(...parts.map((t, i) => (i % 2 ? h('span.ig-link', t) : t)).filter((x) => x !== ''));
    };
    el.addEventListener('blur', paint);
    paint();
    return el;
  }
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
    if (ed.sheet) ed.sheet.querySelectorAll('.st-sticker').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
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

  /* ---------------------------------------------------------------- 画面を組む */
  function render() {
    const s = ed.state;
    if (s.mode === 'post') return renderPost(s.post);
    if (s.mode === 'story') return renderStory(s.story);
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

  function renderSide() {
    const s = ed.state;
    const y = side.scrollTop;
    side.replaceChildren(...(s.mode === 'post' ? sidePost(s.post) : s.mode === 'story' ? sideStory(s.story) : sideVlog(s.vlog)));
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
  const imp = ed.popover('userprofから', 'book', (close) => {
    const s = ed.state;
    const targets = s.mode === 'vlog'
      ? range(clamp(s.vlog.count | 0, 2, 4)).map((i) => [`${i + 1}人目`, (u, img) => { const p = s.vlog.people[i]; p.name = u.name || p.name; if (img) p.image = img; }])
      : [['アカウント', (u, img) => { const a = s[s.mode].user; a.name = u.name || a.name; if (img) a.avatar = img; }]];
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('p.hint', s.mode === 'vlog' ? 'userprof に保存した user の名前と1枚目の画像を、何人目のコマに読み込むか選んでください。' : 'userprof に保存した user の名前と1枚目の画像を、アカウントの名前とアイコンに読み込みます。'),
      targets.map(([label, apply]) => h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => { close(); importTo(apply, label); } }, `${label}に読み込む`)));
  });

  async function clearMode() {
    const m = ed.state.mode;
    const name = MODES.find(([id]) => id === m)[1];
    if (!(await U.confirmDialog({ title: 'クリア', message: `「${name}」の画面の入力と画像を消して、最初の状態に戻しますか?(ほかの画面はそのままです)`, okLabel: '消す', danger: true }))) return;
    ed.state[m] = defaults()[m];
    selected = null;
    await ed.save();
    ed.rerender();
  }
  function fileName() {
    const s = ed.state;
    const who = s.mode === 'vlog'
      ? s.vlog.people.slice(0, s.vlog.count).map((p) => p.name).filter(Boolean).join('_')
      : s[s.mode].user.name;
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
    if (t.closest && t.closest('.st-sticker, .sns-side, dialog, .ed-pop')) return;
    swallowClick = !!(t.closest && t.closest('.st-frame'));
    setSelected(null);
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      toolbar.querySelector('.btn-primary').click();
      return;
    }
    if (!selected || ed.state.mode !== 'story') return;
    if (e.target.closest && e.target.closest('[contenteditable],input,textarea,select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSticker(selected); }
    else if (e.key === 'Escape') setSelected(null);
  });

  /* ---------------------------------------------------------------- 起動 */
  document.body.append(Kit.footer('実在のSNS・アプリとは関係のない、見た目を似せたファンメイドの画面メーカーです。'));
  // 画面を作り直すときは、設定の欄とツールバーもそろえる
  const drawSheet = ed.rerender;
  ed.rerender = () => { drawSheet(); renderSide(); syncToolbar(); };
  ed.load().then(() => { ed.rerender(); U.hydrateIcons(document); });
  window.__usersns = ed;   // 動作確認用
})();
