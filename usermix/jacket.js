/* usermix のジャケット(3 つ目の見た目 layout = 'jacket')。曲ごと、または表紙の正方形の画像を作る。
   シートは 600px 四方で、2 倍で書き出して 1200 × 1200 px。地の絵は曲の画像(表紙はジャケットの画像)をそのまま使う。
   設定は曲の jk(表紙は state.coverJk)に持つので、曲を並べ替えても設定が一緒に動く。作る曲は state.jkAt(null = 再生中の曲)。
   型(TEMPLATES)・書体(KitFonts。assets/fonts.js)・効果・帯。題は 2 行までに収め、収まらなければ字を小さくする(fit)。
   書き出しは使う書体だけを埋め込む(fontEmbedCSS)。書体を読めないときは保存をやめて知らせる(黙って代わりの書体で出さない)。
   usermix.js から UmJacket.create(ctx) で使う */
(function () {
  'use strict';
  const { h, icon } = U;
  const { normHex } = ColorPick;

  const TEMPLATES = [['overlay', '重ね'], ['band', '下帯'], ['center', '中央'], ['vertical', '縦書き'], ['minimal', '極小']];
  const EFFECTS = [['none', 'なし'], ['shadow', '影'], ['stroke', '縁取り'], ['glow', '光']];
  const BASE = { overlay: 64, band: 38, center: 76, vertical: 66, minimal: 18 };   // 題の字の大きさ(px。倍率 1 のとき)
  const LINES = { minimal: 1 };   // 題の行の数の上限(ほかは 2 行)
  const BAND = '#141218';         // 帯の色を決めていないとき
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const def = () => ({ template: 'overlay', font: 'noto', weight: 700, scale: 1, color: '#ffffff', effect: 'shadow', showArtist: true, credit: '', obi: false, obiText: '', band: '', darken: 0.25 });
  /** 保存した jk を形をそろえて返す(足りない値は既定で埋める) */
  function normalize(x) {
    const o = Object.assign(def(), x && typeof x === 'object' ? x : {});
    if (!TEMPLATES.some(([k]) => k === o.template)) o.template = 'overlay';
    if (!EFFECTS.some(([k]) => k === o.effect)) o.effect = 'shadow';
    o.scale = clamp(+o.scale || 1, 0.6, 1.6);
    o.darken = clamp(Number.isFinite(+o.darken) ? +o.darken : 0.25, 0, 0.6);
    o.weight = clamp(Math.round((+o.weight || 700) / 100) * 100, 100, 900);
    ['font', 'color', 'credit', 'obiText', 'band'].forEach((k) => { if (typeof o[k] !== 'string') o[k] = def()[k]; });
    o.font = o.font || 'noto';
    o.showArtist = o.showArtist !== false;
    o.obi = !!o.obi;
    return o;
  }
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  const pad2 = (n) => String(n).padStart(2, '0');

  function create(ctx) {
    const { ed } = ctx;
    const T = () => ed.state.tracks;

    /* ---------------------------------------------------------------- 作る曲(または表紙) */
    function target() {
      const s = ed.state, n = T().length;
      if (s.jkAt === 'cover' || !n) return { cover: true, k: -1 };
      return { cover: false, k: Number.isInteger(s.jkAt) && s.jkAt >= 0 && s.jkAt < n ? s.jkAt : Math.max(0, ctx.nowIdx()) };
    }
    /** 欄の場所。表紙は題 = プレイリストの題、題の下 = ラベル、クレジット = 下の一文(専用の欄は増やさない) */
    const paths = (tg) => (tg.cover
      ? { title: 'title', artist: 'label', credit: 'foot', image: 'cover', jk: 'coverJk' }
      : { title: `tracks.${tg.k}.title`, artist: `tracks.${tg.k}.artist`, credit: `tracks.${tg.k}.jk.credit`, image: `tracks.${tg.k}.image`, jk: `tracks.${tg.k}.jk` });
    const jkOf = (tg) => normalize(ed.get(paths(tg).jk));
    const str = (p) => String(ed.get(p) || '');
    const fileName = (tg) => (tg.cover ? `cover-${U.safeName(str('title'), 'playlist')}-jacket.png` : `${pad2(tg.k + 1)}-${U.safeName(str(paths(tg).title), 'track')}-jacket.png`);
    /** 題とそれ以外(アーティスト・クレジット・帯)の太さ */
    const weightsOf = (jk) => { const ws = KitFonts.info(jk.font).weights; return [KitFonts.nearest(ws, jk.weight), KitFonts.nearest(ws, Math.min(jk.weight, 500))]; };

    /* ---------------------------------------------------------------- シート */
    /** 画像の枠と同じ置き方で、動かせない画像を置く(見本・まとめて保存用) */
    function staticImg(v) {
      const A = v.w / v.h, z = v.zoom || 1, wp = Math.max(1, A) * z * 100, hp = Math.max(1 / A, 1) * z * 100;
      return h('img', { src: v.src, alt: '', style: { position: 'absolute', maxWidth: 'none', width: wp + '%', height: hp + '%', left: ((100 - wp) / 2 + (v.x || 0) * 100) + '%', top: ((100 - hp) / 2 + (v.y || 0) * 100) + '%' } });
    }
    /**
     * ジャケットのシート。o.readonly = 書けない文字・動かせない画像(見本とまとめて保存)、o.jk = 設定の上書き(見本の書体)
     */
    function sheet(tg, o) {
      o = o || {};
      const s = ed.state, P = paths(tg), jk = Object.assign(jkOf(tg), o.jk || {}), img = ed.get(P.image), has = !!(img && img.src);
      const [w1, w2] = weightsOf(jk), color = normHex(jk.color) || '#ffffff', band = normHex(jk.band) || BAND;
      const text = (p, cls, ph, multi) => {
        if (!o.readonly) return ed.text(p, { cls, ph, multi });
        const v = str(p).trim();
        return h('div.' + cls + (v ? '' : '.is-empty'), v);
      };
      const title = text(P.title, 'jk-title', tg.cover ? 'プレイリストの題' : '曲名');
      const artist = jk.showArtist && text(P.artist, 'jk-artist', tg.cover ? 'ラベル' : 'アーティスト');
      const credit = text(P.credit, 'jk-credit', tg.cover ? '下の一文' : 'クレジット');
      let body;
      switch (jk.template) {
        case 'band': body = [h('div.jk-bandbox', h('div.jk-tb', title, artist), credit)]; break;
        case 'center': body = [h('div.jk-top', artist), h('div.jk-mid', title), h('div.jk-bot', credit)]; break;
        case 'vertical': body = [h('div.jk-vt', title), h('div.jk-bl', artist, credit)]; break;
        case 'minimal': body = [h('div.jk-line', h('div.jk-tl', title, artist && h('span.jk-sep', '/'), artist), credit)]; break;
        default: body = [h('div.jk-foot', title, artist, credit)];
      }
      const initial = Array.from(str(P.title).trim())[0] || '♪';
      const el = h('div.mix-sheet.is-jacket.jk-' + jk.template + '.fx-' + jk.effect + (jk.obi ? '.has-obi' : '') + (has ? '' : '.no-img'), {
        style: Object.assign(Ed.themeVars(s.theme, s.palette), ctx.sheetVars(), {
          '--jk-font': KitFonts.stack(jk.font), '--jk-font-v': KitFonts.stack(jk.font, true), '--jk-w': w1, '--jk-w2': w2, '--jk-color': color, '--jk-outline': ctx.inkOn(color),
          '--jk-band': band, '--jk-band-ink': ctx.inkOn(band), '--dk': jk.darken
        })
      },
      h('div.jk-ph', h('span', initial)),
      h('div.jk-bg', o.readonly ? (has ? staticImg(img) : null) : ed.image(P.image, { ratio: 1, label: tg.cover ? 'ジャケットの画像' : '曲の画像', max: 1600, onChange: () => ed.rerender() })),
      h('div.jk-shade'),
      jk.obi && h('div.jk-obi', text(`${P.jk}.obiText`, 'jk-obi-text', '帯の文字')),
      ...body);
      el.__jk = { tg, jk };
      return el;
    }

    /* ---------------------------------------------------------------- 題を収める */
    /** 行(縦書きは列)の数。文字の四角を位置で束ねて数える */
    function lines(el, vertical) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const rs = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
      if (!rs.length) return 0;
      const pos = rs.map((x) => (vertical ? x.left + x.width / 2 : x.top + x.height / 2)).sort((a, b) => a - b);
      const gap = Math.min(...rs.map((x) => (vertical ? x.width : x.height))) * 0.5;
      let n = 1;
      for (let i = 1; i < pos.length; i++) if (pos[i] - pos[i - 1] > gap) n++;
      return n;
    }
    /** 題の字の大きさを、型の大きさ × 倍率 から始め、はみ出すか行が多すぎる間だけ小さくする */
    function fit(el) {
      const t = el && el.querySelector('.jk-title');
      if (!t) return;
      const { jk } = el.__jk, vertical = jk.template === 'vertical', max = LINES[jk.template] || 2;
      let fs = BASE[jk.template] * jk.scale;
      const min = fs * 0.35;
      t.style.fontSize = fs.toFixed(2) + 'px';
      for (let i = 0; i < 40 && fs > min; i++) {
        const over = vertical ? t.scrollHeight > t.clientHeight + 1 : t.scrollWidth > t.clientWidth + 1;
        if (!over && lines(t, vertical) <= max) break;
        fs = Math.max(min, fs * 0.94);
        t.style.fontSize = fs.toFixed(2) + 'px';
      }
    }
    const textOf = (el) => [...el.querySelectorAll('.jk-title, .jk-artist, .jk-credit, .jk-obi-text')].map((x) => x.textContent).join('');
    /** 書体を読んでから収める。返り値は KitFonts.load の結果({ ok, why }) */
    async function refit(el) {
      if (!el || !el.__jk) return { ok: true };
      const { jk } = el.__jk, r = await KitFonts.load(jk.font, weightsOf(jk), textOf(el) || 'あA');
      fit(el);
      return r;
    }

    /* ---------------------------------------------------------------- 書き出し */
    /** シート(画面に置いた状態)を PNG にする。書体を読めなければ例外 */
    async function blobOf(el) {
      const { jk } = el.__jk, ws = weightsOf(jk), txt = textOf(el);
      const r = await KitFonts.load(jk.font, ws, txt || 'あA');
      const stop = (why, hint) => Object.assign(new Error(`${why}。代わりの書体のまま保存しないよう、保存をやめました${hint ? '。' + hint : ''}`), { why });
      if (!r.ok) throw stop(r.why, r.hint);
      fit(el);
      let fontEmbedCSS;
      try { fontEmbedCSS = await KitFonts.embedCss(jk.font, ws, txt, jk.template === 'vertical' || jk.obi); } catch (e) { throw stop('書体を画像に入れられませんでした', '通信できる状態でお試しください'); }
      const lib = await Ed.loadH2I();
      const opts = { pixelRatio: 2, skipFonts: true, cacheBust: false, fontEmbedCSS, backgroundColor: '#15131b', filter: (n) => !(n.classList && n.classList.contains('ed-ui')) };
      let b = await lib.toBlob(el, opts);
      if (isSafari) b = await lib.toBlob(el, opts);   // Safari は 2 回目で画像がそろう
      if (!b) throw new Error('画像を作れませんでした');
      return b;
    }
    /** いま見ているジャケットを保存する */
    async function exportOne() {
      const node = ed.sheet, zb = node.parentElement, z = zb.style.zoom;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      zb.style.zoom = '1';
      node.classList.add('exporting');
      try { await U.saveImage(await blobOf(node), fileName(node.__jk.tg)); }
      finally { node.classList.remove('exporting'); zb.style.zoom = z; fit(node); }
    }
    /** 画像の入った曲すべてのジャケットを、曲順の番号つきで保存する。失敗した曲は止めずに最後に知らせる */
    async function exportAll(btn) {
      const list = T().map((t, k) => ({ t, k })).filter(({ t }) => t.image && t.image.src);
      if (!list.length) return U.toast('画像の入った曲がありません。曲の画像を入れてから保存してください', 'error');
      const label = btn.textContent, host = h('div.jk-host'), files = [], fails = [];
      btn.disabled = true;
      document.body.append(host);
      try {
        for (const [n, { t, k }] of list.entries()) {
          btn.textContent = `作っています… ${n + 1}/${list.length}`;
          const el = sheet({ cover: false, k }, { readonly: true });
          el.classList.add('exporting');
          host.replaceChildren(el);
          try { files.push(new File([await blobOf(el)], fileName({ cover: false, k }), { type: 'image/png' })); }
          catch (e) { fails.push(`${k + 1}. ${String(t.title || '').trim() || '（曲名なし）'}: ${e.why || e.message}`); }
        }
      } finally { host.remove(); btn.textContent = label; btn.disabled = false; }
      if (files.length) {
        let shared = false;
        if (U.isTouch() && navigator.canShare && navigator.canShare({ files })) {
          try { await navigator.share({ files }); shared = true; } catch (e) { shared = e && e.name === 'AbortError'; }
        }
        if (!shared) for (const f of files) { U.downloadBlob(f, f.name); await new Promise((r) => setTimeout(r, 300)); }
      }
      if (fails.length) {
        U.openDialog({
          title: '保存できなかった曲', content: h('div.modal-body',
            h('p.modal-lead', `${files.length} 枚を保存しました。次の曲は保存できませんでした。`),
            h('ul.jk-fails', fails.map((x) => h('li', x))))
        });
      } else U.toast(`${files.length} 枚を保存しました`);
    }

    /* ---------------------------------------------------------------- 書体を選ぶ(見本で比べる) */
    async function fontDialog() {
      const tg = target(), P = paths(tg), jk = jkOf(tg);
      await KitFonts.files.index();
      const files = await KitFonts.files.list();
      const choose = (id) => {
        ed.set(`${P.jk}.font`, id);
        ed.set(`${P.jk}.weight`, KitFonts.nearest(KitFonts.info(id).weights, jk.weight), { rerender: true });
        ctl.close();
      };
      const cell = (id) => {
        const f = KitFonts.info(id), el = sheet(tg, { readonly: true, jk: { font: id, weight: KitFonts.nearest(f.weights, jk.weight) } });
        const b = h('button.jk-cell' + (id === jk.font ? '.on' : ''), { type: 'button', 'aria-pressed': String(id === jk.font), onclick: () => choose(id) },
          h('div.jk-cell-sheet', el), h('span.jk-cell-name', h('b', f.label), h('small', f.mood)));
        requestAnimationFrame(() => refit(el));
        return b;
      };
      const ids = [...KitFonts.CURATED.map((c) => c.id), ...files.map((f) => f.id)];
      if (jk.font.startsWith('local:')) ids.push(jk.font);
      const grid = h('div.jk-grid', ids.map(cell));
      // 端末のフォントの名前
      const name = h('input', { type: 'text', placeholder: '例: 黒薔薇ゴシック Black', 'aria-label': '端末に入っているフォントの名前', value: jk.font.startsWith('local:') ? jk.font.slice(6) : '' });
      const useName = () => { const v = name.value.trim(); if (!v) return name.focus(); if (!KitFonts.hasLocal(v)) U.toast(`この端末に「${v}」が見つかりません。代わりの書体で表示します`, 'error'); choose('local:' + v); };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); useName(); } });
      // フォントファイル
      const inp = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', hidden: true });
      inp.addEventListener('change', async () => {
        const f = inp.files[0];
        inp.value = '';
        if (!f) return;
        try { choose(await KitFonts.files.add(f)); U.toast(`「${f.name}」を読み込みました`); } catch (e) { U.toast(e.message || 'フォントを読み込めませんでした', 'error'); }
      });
      const fileRows = files.map((f) => h('li', h('span', f.name, h('small', ` ${(f.size / 1048576).toFixed(1)} MB`)),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: async (e) => {
          if (!(await U.confirmDialog({ title: 'フォントを削除', message: `「${f.name}」をこのブラウザから削除しますか？ この書体を選んでいたジャケットは、代わりの書体で表示します。`, okLabel: '削除', danger: true }))) return;
          await KitFonts.files.remove(f.key);
          e.target.closest('li').remove();
          const c = grid.querySelector(`[data-id="${f.id}"]`);
          if (c) c.remove();
        } }, icon('trash', 13), '削除')));
      const ctl = U.openDialog({
        title: '書体を選ぶ', wide: true,
        content: h('div.modal-body.jk-fd',
          h('p.modal-lead', '書体の見本を、いまの題と画像で並べています。押すとその書体に決まります。'),
          grid,
          h('p.hint', 'Google Fonts にない書体（黒薔薇ゴシックなど）は、端末に入っているフォントの名前か、フォントファイルで使えます。'),
          h('p.hint', 'しねきゃぷしょんは作者の配布条件に沿って同梱しています。作者は chiphead 氏で、ひらがなのデザインは雑念の塊氏です。縦書きでは、句読点や小さい仮名などを端末の書体で出します。'),
          h('section.jk-fd-sec', h('h3', '端末に入っているフォント'),
            h('div.jk-fd-row', name, h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: useName }, '使う')),
            h('p.hint', 'フォントの名前をそのまま書きます。入っていない端末では代わりの書体になります。Safari など、あとから入れたフォントを使えないブラウザもあります。')),
          h('section.jk-fd-sec', h('h3', 'フォントファイル'),
            inp, h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => inp.click() }, icon('upload'), 'ファイルを読み込む'),
            fileRows.length ? h('ul.jk-files', fileRows) : null,
            h('p.hint', '.ttf・.otf・.woff・.woff2 を読み込めます。ファイルはこのブラウザの中にだけ保存し、どこにも送りません。使ってよいかはそのフォントの利用規約でお確かめください。')))
      });
      grid.querySelectorAll('.jk-cell').forEach((b, i) => { b.dataset.id = ids[i]; });
    }

    /* ---------------------------------------------------------------- 操作の段(ツールバーの 2 段目) */
    let noteEl = null;
    function bar() {
      const tg = target(), P = paths(tg), jk = jkOf(tg), f = KitFonts.info(jk.font), n = T().length;
      const set = (k, v) => ed.set(`${P.jk}.${k}`, v, { rerender: true });
      const seg = (items, cur, on, label) => h('div.seg', { role: 'group', 'aria-label': label }, items.map(([v, text]) => h('button', { type: 'button', 'aria-pressed': String(cur === v), onclick: () => { if (cur !== v) on(v); } }, text)));
      const live = (k, v) => { const j = ed.get(P.jk); if (j) j[k] = v; if (ed.sheet && ed.sheet.__jk) ed.sheet.__jk.jk[k] = v; };
      const range = (label, min, max, step, val, fmt, onInput) => {
        const r = h('input', { type: 'range', min, max, step, value: val, 'aria-label': label }), out = h('output', fmt(val));
        r.addEventListener('input', () => { out.textContent = fmt(+r.value); onInput(+r.value); });
        r.addEventListener('change', () => ed.dirty());
        return h('label.jk-range', h('span', label), r, out);
      };
      const select = (label, items, val, on) => {
        const sel = h('select', { 'aria-label': label }, items.map(([v, text]) => h('option', { value: v, selected: String(v) === String(val) }, text)));
        sel.addEventListener('change', () => on(sel.value));
        return h('label.jk-sel', h('span', label), sel);
      };
      const swatch = (label, value, title, key) => h('button.jk-sw', { type: 'button', title, 'aria-label': title, style: { '--c': value }, onclick: async () => {
        const v = await Ed.pickColor({ value, title, sources: ed.images() });
        if (v) set(key, v);
      } }, h('i'), h('span', label));
      const check = (label, val, on) => { const cb = h('input', { type: 'checkbox', checked: val }); cb.addEventListener('change', () => on(cb.checked)); return h('label.check.jk-check', cb, label); };
      const step = (d) => ed.set('jkAt', ((tg.k + d) % n + n) % n, { rerender: true });
      const tname = str(P.title).trim();
      noteEl = h('p.jk-note', { hidden: true });
      return h('div.um-jk-bar',
        h('div.jk-group',
          seg([['track', '曲'], ['cover', '表紙']], tg.cover ? 'cover' : 'track', (v) => ed.set('jkAt', v === 'cover' ? 'cover' : null, { rerender: true }), '作る物'),
          !tg.cover && n > 1 && h('button.jk-step', { type: 'button', title: '前の曲', 'aria-label': '前の曲', onclick: () => step(-1) }, icon('left', 14)),
          !tg.cover && h('span.jk-name', { title: tname }, `${tg.k + 1}. ${tname || '（曲名なし）'}`),
          !tg.cover && n > 1 && h('button.jk-step', { type: 'button', title: '次の曲', 'aria-label': '次の曲', onclick: () => step(1) }, icon('right', 14))),
        h('div.jk-group', h('span.jk-k', '型'), seg(TEMPLATES, jk.template, (v) => set('template', v), '型')),
        h('div.jk-group',
          h('button.btn.btn-outline.btn-sm.jk-font', { type: 'button', onclick: fontDialog, title: '書体を見本で比べて選ぶ' }, h('span.jk-k', '書体'), h('b', f.label)),
          select('太さ', f.weights.map((w) => [w, String(w)]), KitFonts.nearest(f.weights, jk.weight), (v) => set('weight', +v)),
          range('大きさ', 0.6, 1.6, 0.05, jk.scale, (v) => `${Math.round(v * 100)}%`, (v) => { live('scale', v); fit(ed.sheet); }),
          swatch('文字', normHex(jk.color) || '#ffffff', '文字の色', 'color'),
          select('効果', EFFECTS, jk.effect, (v) => set('effect', v))),
        h('div.jk-group',
          check(tg.cover ? 'ラベル' : 'アーティスト', jk.showArtist, (v) => set('showArtist', v)),
          check('帯', jk.obi, (v) => set('obi', v)),
          swatch('帯', normHex(jk.band) || BAND, '帯の色。下帯の型の帯と、左の帯に使います', 'band'),
          range('暗さ', 0, 0.6, 0.05, jk.darken, (v) => `${Math.round(v * 100)}%`, (v) => { live('darken', v); if (ed.sheet) ed.sheet.style.setProperty('--dk', v); })),
        noteEl);
    }
    /** 描き直したあと: 書体を読んで題を収め、読めなければ知らせる */
    async function after() {
      const el = ed.sheet, r = await refit(el);
      if (el !== ed.sheet || !noteEl) return;
      noteEl.hidden = r.ok;
      noteEl.textContent = r.ok ? '' : `${r.why}。代わりの書体で表示しています。${r.hint ? r.hint + '。' : ''}`;
    }

    return { target, sheet: () => sheet(target()), fit: () => fit(ed.sheet), after, bar, exportOne, exportAll };
  }

  window.UmJacket = { create, normalize, TEMPLATES };
})();
