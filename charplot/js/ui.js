/* 画面の部品: 字数つきの欄・合計の字数・画像の並び・行の操作 */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};

  const fmt = (n) => n.toLocaleString();

  /** 字数 (上限があれば「7 / 20字」、超えたら赤) */
  function countEl(limit) {
    const el = h('span.pf-count');
    const set = (n) => {
      el.textContent = limit ? `${fmt(n)} / ${fmt(limit)}字` : `${fmt(n)}字`;
      el.classList.toggle('over', !!limit && n > limit);
    };
    return { el, set };
  }

  /**
   * 1つの欄。o = { label, sub, value, limit, rows, ph, line(1行の入力欄), onInput(v), copy(コピーのボタンを出す) }
   * 戻り値の input は textarea か input
   */
  function field(o) {
    const id = 'f-' + U.uid();
    const input = o.line
      ? h('input', { type: 'text', id, value: o.value, placeholder: o.ph || '', autocomplete: 'off' })
      : h('textarea.pf-ta', { id, rows: o.rows || 3, value: o.value, placeholder: o.ph || '' });
    const cnt = countEl(o.limit);
    const update = () => cnt.set(Store.count(input.value));
    input.addEventListener('input', () => { update(); if (o.onInput) o.onInput(input.value); });
    update();
    const el = h('div.pf' + (o.cls ? '.' + o.cls : ''),
      h('div.pf-head',
        h('label', { for: id }, o.label, o.sub && h('small', o.sub)),
        cnt.el,
        o.copy !== false && copyBtn(() => input.value, null, o.copyLabel)),
      input);
    return { el, input, update };
  }

  /** コピーのボタン。label があれば字の付いたボタン、なければ小さなアイコン */
  function copyBtn(get, title, label) {
    const onclick = () => {
      const t = get();
      if (!String(t || '').trim()) return U.toast('コピーする内容がありません', 'error');
      U.copyText(t);
    };
    if (label) return h('button.btn.btn-outline.btn-sm.copy-btn', { type: 'button', title: title || null, onclick }, icon('copy', 16), label);
    return h('button.mini-copy', { type: 'button', title: title || 'コピー', 'aria-label': title || 'コピー', onclick }, icon('copy', 16));
  }

  /** 合計の字数のメーター。o = { label, limit, note } */
  function meter(o) {
    const num = h('b'), bar = h('i'), msg = h('span.pm-msg');
    const el = h('div.pmeter', h('p.pm-label', o.label, o.note && h('small', o.note)),
      h('div.pm-row', h('span.pm-num', num, ` / ${fmt(o.limit)}字`), h('span.pm-bar', { 'aria-hidden': 'true' }, bar), msg));
    const set = (n) => {
      const over = n - o.limit;
      num.textContent = fmt(n);
      bar.style.width = Math.min(100, n / o.limit * 100) + '%';
      el.classList.toggle('over', over > 0);
      msg.textContent = over > 0 ? `${fmt(over)}字 超えています` : `あと${fmt(-over)}字`;
    };
    return { el, set };
  }

  /** 行の操作 (上へ・下へ・消す)。list の中の item を動かして redraw を呼ぶ */
  function rowTools(list, item, redraw, o) {
    o = o || {};
    const i = list.indexOf(item);
    const move = (d) => {
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      redraw();
    };
    return h('div.row-tools',
      o.extra,
      h('button.btn.btn-ghost.btn-icon' + (i <= 0 ? '.is-off' : ''), { type: 'button', title: '上へ', 'aria-label': '上へ', onclick: () => move(-1) }, icon('up')),
      h('button.btn.btn-ghost.btn-icon' + (i >= list.length - 1 ? '.is-off' : ''), { type: 'button', title: '下へ', 'aria-label': '下へ', onclick: () => move(1) }, icon('down')),
      h('button.btn.btn-ghost.btn-icon.danger', { type: 'button', title: o.delLabel || '消す', 'aria-label': o.delLabel || '消す', onclick: async () => {
        if (o.confirm && !(await U.confirmDialog({ title: o.delLabel || '消す', message: o.confirm, okLabel: '消す', danger: true }))) return;
        list.splice(list.indexOf(item), 1);
        if (o.onRemove) o.onRemove();
        redraw(true);
      } }, icon('trash')));
  }

  /** data-img に画像idがある要素へ、背景画像として流し込む */
  function hydrate(root) {
    root.querySelectorAll('[data-img]').forEach(async (el) => {
      const url = await Images.url(el.dataset.img).catch(() => null);
      if (url) { el.style.backgroundImage = `url("${url}")`; el.classList.add('has-img'); }
    });
  }
  /** img 要素を画像idから */
  function img(id, cls, alt) {
    const el = h('img' + (cls ? '.' + cls : ''), { alt: alt || '', loading: 'lazy' });
    Images.url(id).then((u) => { if (u) el.src = u; });
    return el;
  }

  /** 画像を選ぶ (複数可)。選んだ File の配列を渡す */
  function pickFiles(multiple, onFiles) {
    const input = h('input', { type: 'file', accept: 'image/*', multiple: !!multiple, hidden: true });
    input.addEventListener('change', () => {
      const files = [...input.files];
      input.remove();
      if (files.length) onFiles(files);
    });
    document.body.append(input);
    input.click();
  }
  /** File の配列を保存して id の配列を返す (失敗した画像は飛ばす) */
  async function saveFiles(files) {
    const out = [];
    for (const f of files) {
      try { out.push(await Images.add(f)); } catch (e) { U.toast(e.message || '画像を保存できませんでした', 'error'); }
    }
    return out;
  }

  /**
   * 画像の並び。o = { ids(配列そのもの), max, main(先頭に「メイン」), label, onChange }
   * 押すと選べる・落とせる・貼り付けられる。左右に動かす・消す
   */
  function imageStrip(o) {
    const box = h('div.istrip');
    const add = async (files) => {
      const room = o.max ? o.max - o.ids.length : files.length;
      if (room <= 0) return U.toast(`画像は${o.max}枚までです`, 'error');
      if (files.length > room) U.toast(`画像は${o.max}枚までなので、${room}枚だけ入れます`);
      const got = await saveFiles(files.slice(0, room));
      if (!got.length) return;
      o.ids.push(...got);
      draw();
      o.onChange();
    };
    const draw = () => {
      const full = o.max && o.ids.length >= o.max;
      box.replaceChildren();
      U.append(box, [
        ...o.ids.map((id, i) => h('figure.ithumb',
          h('span.ithumb-img', { 'data-img': id }),
          o.main && i === 0 && h('span.ithumb-main', 'メイン'),
          h('figcaption',
            h('button.btn.btn-ghost.btn-icon' + (i === 0 ? '.is-off' : ''), { type: 'button', title: '左へ', 'aria-label': '左へ', onclick: () => {
              [o.ids[i - 1], o.ids[i]] = [o.ids[i], o.ids[i - 1]]; draw(); o.onChange();
            } }, icon('left', 16)),
            h('button.btn.btn-ghost.btn-icon' + (i === o.ids.length - 1 ? '.is-off' : ''), { type: 'button', title: '右へ', 'aria-label': '右へ', onclick: () => {
              [o.ids[i + 1], o.ids[i]] = [o.ids[i], o.ids[i + 1]]; draw(); o.onChange();
            } }, icon('right', 16)),
            h('button.btn.btn-ghost.btn-icon.danger', { type: 'button', title: 'この画像を外す', 'aria-label': 'この画像を外す', onclick: () => {
              o.ids.splice(i, 1); draw(); o.onChange(true);
            } }, icon('trash', 16))))),
        !full && h('button.iadd', { type: 'button', onclick: () => pickFiles(!o.max || o.max - o.ids.length > 1, add) },
          icon('image', 22), h('span', o.label || '画像を足す'), h('small', o.max ? `${o.ids.length}/${o.max}` : '選ぶ・落とす・貼る'))]);
      hydrate(box);
    };
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.classList.remove('over');
      const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) add(files);
    });
    box.tabIndex = -1;
    box.addEventListener('paste', (e) => { const f = U.imageFromPaste(e); if (f) { e.preventDefault(); add([f]); } });
    draw();
    return box;
  }

  /** 1枚だけの画像 (トークプロフィールのアイコン)。get/set で id を読み書き */
  function oneImage(get, set, label) {
    const box = h('div.ione');
    const draw = () => {
      const id = get();
      box.replaceChildren(
        h('button.ione-pic', { type: 'button', 'data-img': id || null, title: id ? '画像を替える' : '画像を選ぶ', onclick: () => pickFiles(false, async (files) => {
          const got = await saveFiles(files);
          if (!got.length) return;
          set(got[0]);
          draw();
        }) }, !id && icon('image', 22)),
        h('span.ione-side', h('small', label || '画像'),
          id && h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { set(''); draw(); } }, icon('trash', 15), '外す')));
      hydrate(box);
    };
    draw();
    return box;
  }

  /** 1つ選ぶボタンの並び (もう一度押すと外す)。max があれば複数選べる */
  function chips(options, get, set, max) {
    const box = h('div.chips-pick', { role: 'group' });
    const draw = () => {
      const v = get();
      box.replaceChildren(...options.map((op) => {
        const on = max ? v.includes(op) : v === op;
        return h('button.chip-pick', { type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: () => {
          if (max) {
            const list = on ? v.filter((x) => x !== op) : [...v, op];
            if (list.length > max) return U.toast(`${max}つまで選べます`, 'error');
            set(list);
          } else set(on ? '' : op);
          draw();
        } }, op);
      }));
    };
    draw();
    return box;
  }

  /** スマホで「書く/プレビュー」を切り替える帯 (広い画面では隠れる) */
  function previewSwitch(wrap) {
    const mk = (mode, label, ic) => h('button', { type: 'button', 'aria-pressed': wrap.dataset.mode === mode ? 'true' : 'false', onclick: (e) => {
      wrap.dataset.mode = mode;
      e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'));
    } }, icon(ic, 16), label);
    wrap.dataset.mode = wrap.dataset.mode || 'edit';
    return h('div.seg.pv-switch', { role: 'group', 'aria-label': '表示の切り替え' }, mk('edit', '書く', 'edit'), mk('preview', 'プレビュー', 'eye'));
  }

  Views.ui = { fmt, countEl, field, copyBtn, meter, rowTools, hydrate, img, pickFiles, saveFiles, imageStrip, oneImage, chips, previewSwitch };
})();
