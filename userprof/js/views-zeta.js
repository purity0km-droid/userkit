/* zetaプロフ: zetaのユーザープロフィール(1000字まで・改行も1字)を丸ごと保存して、1000字に収める */
(function () {
  'use strict';
  const { h, icon } = U;
  window.Views = window.Views || {};
  const LIMIT = Store.ZETA_LIMIT;

  /* ====================================================== 文字の処理 (画面に依存しない) */
  const nl = (s) => String(s || '').replace(/\r\n?/g, '\n');
  /** zetaの数え方に合わせて改行も1字。絵文字など(サロゲートペア)は多めに見て2字 */
  const count = (s) => nl(s).length;
  const breaks = (s) => (nl(s).match(/\n/g) || []).length;
  const hasPair = (s) => /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(s);

  // 前後の空白を詰めてよい全角の記号
  const PUNCT_SP = /[ \t\u3000]*([、。，．：／・「」『』（）【】〈〉《》［］！？〜～…])[ \t\u3000]*/g;
  // 半角の : / は、隣が日本語のときだけ詰める (英文の「Note: this」は崩さない)
  const ASCII_SP_L = /([^\x00-\x7F])[ \t\u3000]*([:\/])[ \t\u3000]*/g;
  const ASCII_SP_R = /[ \t\u3000]*([:\/])[ \t\u3000]*(?=[^\x00-\x7F])/g;
  // 見出しだけの行 (【性格】 / 性格: など) と、その後の改行。次の行が空行・見出しのときはつながない
  const JOIN_HEAD = /^([ \t\u3000]*(?:【[^】\n]{1,30}】|〈[^〉\n]{1,30}〉|《[^》\n]{1,30}》|［[^］\n]{1,30}］|\[[^\]\n]{1,30}\]|[^\s:：、。「」【】]{1,15}[:：])[ \t\u3000]*)\n(?=[ \t\u3000]*[^\s【■□◆◇●○▼▽★☆◎♦〈《［\[])/gm;

  /** 整えて詰めるときの規則 (この順に当てる)。on = 最初から選んでおくもの */
  const RULES = [
    { id: 'trim', on: true, label: '行頭・行末の空白を消す',
      fn: (s) => s.split('\n').map((l) => l.replace(/^[ \t\u3000]+|[ \t\u3000]+$/g, '')).join('\n') },
    { id: 'space', on: true, label: '続いた空白・記号まわりの空白を詰める', hint: '「年齢 : 17」→「年齢:17」',
      fn: (s) => s.replace(/[ \t\u3000]{2,}/g, ' ').replace(PUNCT_SP, '$1').replace(ASCII_SP_L, '$1$2').replace(ASCII_SP_R, '$1') },
    { id: 'blank', on: true, label: '空行を消す',
      fn: (s) => s.replace(/\n[ \t\u3000]*(?=\n)/g, '').replace(/^\n+|\n+$/g, '') },
    { id: 'join', on: true, label: '見出しの後の改行をつなぐ', hint: '「【性格】⏎明るい」→「【性格】明るい」',
      fn: (s) => s.replace(JOIN_HEAD, (m, head) => head.replace(/[ \t\u3000]+$/, '')) },
    { id: 'bullet', on: false, label: '行頭の「・」「-」を消す',
      fn: (s) => s.replace(/^([ \t\u3000]*)(?:[・•]|[-*+](?=[ \t\u3000]))[ \t\u3000]*/gm, '$1') },
    { id: 'period', on: false, label: '行末の「。」を消す',
      fn: (s) => s.replace(/。(?=\n|$)/g, '') },
    { id: 'short', on: false, label: '【見出し】を「見出し:」にする',
      fn: (s) => s.replace(/【([^】\n]{1,30})】[:：]?/g, '$1:') }
  ];
  /** 選んだ規則を順に当てる。steps[i].saved = その規則で減る字数 (選んでいない規則は、選んだら減る字数) */
  function tidy(src, on) {
    let s = nl(src);
    const steps = RULES.map((r) => {
      const next = r.fn(s);
      const saved = count(s) - count(next);
      if (on[r.id]) s = next;
      return { id: r.id, saved };
    });
    return { text: s, steps };
  }

  // まとまり(項目)の始まりに見える行: 【見出し】 ■見出し 〈見出し〉 [見出し] 性格: など
  const HEAD_START = /^[ \t\u3000]*(?:【[^】\n]{1,30}】|[■□◆◇●○▼▽★☆◎♦#＃]|〈[^〉\n]{1,30}〉|《[^》\n]{1,30}》|［[^］\n]{1,30}］|\[[^\]\n]{1,30}\]|[^\s:：、。「」【】・]{1,12}[:：])/;
  /**
   * 文章を項目に分ける。空行か見出しで区切る → 1つにしかならなければ行ごと → 1行なら文ごと。
   * sep = 項目をつなぎ直すときの区切り
   */
  function splitBlocks(src) {
    const out = [];
    let cur = null;
    nl(src).split('\n').forEach((l) => {
      if (!l.trim()) { cur = null; return; }
      if (!cur || HEAD_START.test(l)) { cur = []; out.push(cur); }
      cur.push(l);
    });
    const blocks = out.map((b) => b.join('\n'));
    if (blocks.length !== 1) return { blocks, sep: '\n' };
    const ls = blocks[0].split('\n');
    if (ls.length > 1) return { blocks: ls, sep: '\n' };
    const sents = blocks[0].split(/(?<=[。!?！？][」』）)]*)(?![」』）)。!?！？])/).filter((x) => x.trim());
    return { blocks: sents, sep: '' };
  }

  const STYLES = [
    { id: 'head', label: '見出し+短い文', text: '「【名前】」のような短い見出しを付けて、それぞれ短い文で簡潔に書いてください。' },
    { id: 'prose', label: '文章にまとめる', text: '見出しや箇条書きは使わず、つながった文章でまとめてください。' },
    { id: 'keep', label: '元の書き方を残す', text: '元の文章の書き方(見出し・言い回し)をなるべく残し、細かい説明から削って短くしてください。' }
  ];
  function aiPrompt(src, { target, style, keep }) {
    const st = STYLES.find((x) => x.id === style) || STYLES[0];
    return [
      `次のキャラクタープロフィールを、AIチャット「zeta」のユーザープロフィール欄に入れられるよう、${target}字以内に要約してください。`,
      '',
      '条件:',
      `・改行も1字として数えて、${target}字以内にしてください。`,
      `・${st.text}`,
      '・名前・年齢・見た目・性格・口調・相手キャラとの関係など、ロールプレイで大事な情報を優先して残してください。',
      keep ? `・次の内容は必ず残してください: ${keep}` : null,
      '・書かれていない設定を足したり、内容を変えたりしないでください。',
      '・返事は要約したプロフィール本文だけにしてください(前置き・説明・字数の報告は不要です)。',
      '',
      '――― プロフィールここから ―――',
      nl(src).trim(),
      '――― プロフィールここまで ―――'
    ].filter((x) => x != null).join('\n');
  }
  function retryPrompt(n, target) {
    return `さっきの要約は、改行も1字として数えると${n}字で、上限の${LIMIT}字を${n - LIMIT}字超えていました。\n`
      + `名前・性格・口調・相手との関係など大事な情報は残したまま、優先度の低い内容から削って、${target}字以内にもう一度短くしてください。`
      + '返事は要約した本文だけにしてください。';
  }
  /** AIの返事によく付く ``` の囲みと前後の空白を外す */
  const cleanAnswer = (s) => nl(s).replace(/^\s*```[^\n]*\n/, '').replace(/\n```\s*$/, '').trim();

  window.ZetaText = { count, tidy, splitBlocks, aiPrompt, RULES };

  /* ====================================================== 自動保存 (打つたびに書き込まないよう少し待つ) */
  let pending = null, timer = 0;
  function flush() {
    clearTimeout(timer);
    if (!pending) return;
    const u = pending;
    pending = null;
    Store.touch(u);
  }
  function schedule(u) {
    if (pending && pending !== u) flush();
    pending = u;
    clearTimeout(timer);
    timer = setTimeout(flush, 500);
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  /* ====================================================== 部品 */
  /** 字数の表示。compare=元の文章用(上限との差を「減らす必要」で言う) */
  function counter(ta, compare) {
    const num = h('b'), bar = h('i'), msg = h('span.zmsg'), note = h('span.znote');
    const el = h('div.zcount', h('span.znum', num, ` / ${LIMIT}字`), h('span.zmeter', { 'aria-hidden': 'true' }, bar), msg, note);
    const update = () => {
      const v = ta.value, n = count(v), over = n - LIMIT, br = breaks(v);
      num.textContent = n.toLocaleString();
      bar.style.width = Math.min(100, n / LIMIT * 100) + '%';
      el.classList.toggle('over', over > 0);
      el.classList.toggle('ok', n > 0 && over <= 0);
      msg.textContent = !n ? ''
        : over > 0 ? (compare ? `zetaに入れるには、あと${over.toLocaleString()}字 減らす必要があります` : `${LIMIT}字を ${over.toLocaleString()}字 超えています`)
        : compare ? 'このままzetaに入ります' : `あと${(-over).toLocaleString()}字 入ります`;
      note.textContent = [br && `改行${br}字を含む`, hasPair(v) && '絵文字などは2字で数えています'].filter(Boolean).join(' / ');
    };
    ta.addEventListener('input', update);
    update();
    return { el, update };
  }

  /** どの文章を元にするか (2つあるときだけ選べる) */
  function sourcePicker(list, onChange) {
    const label = (s) => `${s.label}(${count(s.text).toLocaleString()}字)`;
    if (list.length < 2) return h('p.zsrc', '元にする文章: ', h('b', label(list[0])));
    const btns = list.map((s, i) => h('button', {
      type: 'button', 'aria-pressed': i === 0 ? 'true' : 'false',
      onclick: () => { btns.forEach((b) => b.setAttribute('aria-pressed', b === btns[i] ? 'true' : 'false')); onChange(s); }
    }, label(s)));
    return h('div.zsrc', h('span', '元にする文章'), h('div.seg', { role: 'group', 'aria-label': '元にする文章' }, btns));
  }

  /** ツールのダイアログの下部: 左に字数、右にボタン */
  function toolFoot(ctl, totalEl, useBtn) {
    return h('div.modal-foot.zfoot', totalEl,
      h('button.btn.btn-outline', { type: 'button', onclick: () => ctl.close() }, 'キャンセル'),
      useBtn);
  }

  /* ====================================================== ツール: 整えて詰める */
  function tidyDialog(list, use) {
    let src = list[0];
    const on = {};
    RULES.forEach((r) => { on[r.id] = r.on; });
    const preview = h('textarea.zeta-ta', { id: 'zt-preview', rows: 9, readonly: true });
    const res = counter(preview);
    const diff = h('span.zdiff');
    const rows = RULES.map((r) => {
      const cb = h('input', { type: 'checkbox', checked: on[r.id] });
      const saved = h('small.zsaved');
      cb.addEventListener('change', () => { on[r.id] = cb.checked; draw(); });
      return { saved, el: h('label.zrule', cb, h('span', r.label, r.hint && h('small', r.hint)), saved) };
    });
    const draw = () => {
      const { text, steps } = tidy(src.text, on);
      preview.value = text;
      res.update();
      steps.forEach((st, i) => {
        rows[i].saved.textContent = st.saved > 0 ? `−${st.saved.toLocaleString()}字` : '変化なし';
        rows[i].el.classList.toggle('is-off', !on[st.id]);
      });
      const a = count(src.text), b = count(text);
      diff.textContent = `${a.toLocaleString()}字 → ${b.toLocaleString()}字(−${(a - b).toLocaleString()}字)`;
    };
    const useBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => { use(preview.value); ctl.close(); } }, icon('check'), 'これを使う');
    const body = h('div.modal-body',
      h('p.modal-lead', '意味は変えずに、空白・空行・改行などを詰めます。大きく減らしたいときは「項目を選んで減らす」「AIに要約を頼む」を使ってください。'),
      sourcePicker(list, (s) => { src = s; draw(); }),
      h('div.zrules', rows.map((r) => r.el)),
      h('div.field', h('label', { for: 'zt-preview' }, 'できあがり', h('small', '「これを使う」で zetaに貼る文章 に入ります')), preview, res.el));
    const ctl = U.openDialog({ title: '整えて詰める', content: body, wide: true });
    body.append(toolFoot(ctl, diff, useBtn));
    draw();
  }

  /* ====================================================== ツール: 項目を選んで減らす */
  function blocksDialog(list, use) {
    let src = list[0], items = [], sep = '\n';
    const box = h('div.zblocks');
    const total = h('span.zdiff');
    const result = () => items.filter((it) => it.on && it.t.trim()).map((it) => it.t.replace(/^\n+|\n+$/g, '')).join(sep);
    const drawTotal = () => {
      const n = count(result()), over = n - LIMIT;
      total.textContent = `選んだ項目 ${n.toLocaleString()} / ${LIMIT}字` + (over > 0 ? `(${over.toLocaleString()}字 多い)` : '');
      total.classList.toggle('over', over > 0);
      useBtn.disabled = !n;
    };
    const build = () => {
      const sp = splitBlocks(src.text);
      sep = sp.sep;
      items = sp.blocks.map((t) => ({ t, on: true }));
      box.replaceChildren(...items.map((it, i) => {
        const cb = h('input', { type: 'checkbox', checked: true, 'aria-label': `項目${i + 1}を使う` });
        const ta = h('textarea', { rows: Math.min(8, it.t.split('\n').length), value: it.t, 'aria-label': `項目${i + 1}` });
        const n = h('small.zbn');
        const row = h('div.zblock', h('label.zbhead', cb, h('span', `項目${i + 1}`), n), ta);
        const upd = () => { n.textContent = `${count(ta.value).toLocaleString()}字`; };
        cb.addEventListener('change', () => { it.on = cb.checked; row.classList.toggle('is-off', !it.on); drawTotal(); });
        ta.addEventListener('input', () => { it.t = ta.value; upd(); drawTotal(); });
        upd();
        return row;
      }));
      drawTotal();
    };
    const useBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => { use(result()); ctl.close(); } }, icon('check'), 'これを使う');
    const body = h('div.modal-body',
      h('p.modal-lead', '見出し・空行ごとに分けました。いらない項目のチェックを外したり、その場で書き直したりして、字数を見ながら減らせます。'),
      sourcePicker(list, (s) => { src = s; build(); }),
      box);
    const ctl = U.openDialog({ title: '項目を選んで減らす', content: body, wide: true });
    body.append(toolFoot(ctl, total, useBtn));
    build();
  }

  /* ====================================================== ツール: AIに要約を頼む */
  function aiDialog(list, use) {
    let src = list[0], style = STYLES[0].id;
    const target = h('input', { type: 'number', id: 'za-target', min: 100, max: LIMIT, step: 10, value: 900, inputmode: 'numeric' });
    const keep = h('input', { type: 'text', id: 'za-keep', placeholder: '例: 口調、相手との関係、秘密', autocomplete: 'off' });
    const tgt = () => {
      const v = Math.round(Number(target.value));
      return Number.isFinite(v) && v >= 100 ? Math.min(LIMIT, v) : 900;
    };
    const prompt = () => aiPrompt(src.text, { target: tgt(), style, keep: keep.value.trim() });

    const styleBtns = STYLES.map((s) => h('button', {
      type: 'button', 'aria-pressed': s.id === style ? 'true' : 'false',
      onclick: () => { style = s.id; styleBtns.forEach((b, i) => b.setAttribute('aria-pressed', STYLES[i].id === style ? 'true' : 'false')); peekDraw(); }
    }, s.label));
    const peekText = h('pre.zpeek-text');
    const peek = h('details.zpeek', h('summary', '指示文を見る'), peekText);
    const peekDraw = () => { if (peek.open) peekText.textContent = prompt(); };
    peek.addEventListener('toggle', peekDraw);
    target.addEventListener('input', peekDraw);
    keep.addEventListener('input', peekDraw);

    const answer = h('textarea.zeta-ta', { id: 'za-answer', rows: 8, placeholder: 'AIの返事(要約)をここに貼り付け' });
    const ans = counter(answer);
    const retryBtn = h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => {
      U.copyText(retryPrompt(count(answer.value), tgt()), 'コピーしました。同じAIとの会話に貼り付けて送ってください');
    } }, icon('copy'), 'もう一度短くしてもらう文をコピー');
    const retry = h('div.zretry', { hidden: true }, h('p', '上限を超えています。同じAIに続けて頼むと、短くし直してもらえます。'), retryBtn);
    const drawAnswer = () => {
      const v = answer.value;
      retry.hidden = count(v) <= LIMIT;
      useBtn.disabled = !v.trim();
    };
    answer.addEventListener('input', drawAnswer);
    answer.addEventListener('paste', () => setTimeout(() => {
      const c = cleanAnswer(answer.value);
      if (c !== answer.value) { answer.value = c; ans.update(); }
      drawAnswer();
    }, 0));

    const useBtn = h('button.btn.btn-primary', { type: 'button', disabled: true, onclick: () => { use(cleanAnswer(answer.value)); ctl.close(); } }, icon('check'), 'これを使う');
    const body = h('div.modal-body',
      h('p.modal-lead', 'ChatGPT・Claude・Gemini など、ふだん使っているAIに要約してもらう方法です。指示文を作るだけで、userprofからはどこにも送信しません。'),
      h('ol.zsteps',
        h('li',
          h('b', '元にする文章と条件を決める'),
          sourcePicker(list, (s) => { src = s; peekDraw(); }),
          h('div.grid-2',
            h('div.field', h('label', { for: 'za-target' }, '目標の字数', h('small', `${LIMIT}字まで`)), target),
            h('div.field', h('label', { for: 'za-keep' }, '必ず残したいこと', h('small', '任意')), keep)),
          h('p.hint', 'AIは字数を正確に数えられないことが多いので、少なめ(900字ほど)で頼むと収まりやすくなります。'),
          h('div.zsrc', h('span', 'まとめ方'), h('div.seg', { role: 'group', 'aria-label': 'まとめ方' }, styleBtns))),
        h('li',
          h('b', '指示文をコピーして、AIに貼り付けて送る'),
          h('div', h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => U.copyText(prompt(), '指示文をコピーしました。AIに貼り付けて送ってください') }, icon('copy'), '指示文をコピー')),
          peek),
        h('li',
          h('b', 'AIの返事を貼り付ける'),
          answer, ans.el, retry)));
    const ctl = U.openDialog({ title: 'AIに要約を頼む', content: body, wide: true });
    body.append(toolFoot(ctl, h('span'), useBtn));
  }

  /* ====================================================== タブ本体 */
  function tabZeta(u) {
    const z = u.zeta;
    const save = () => schedule(u);

    // ① 元の文章 (字数制限なし・丸ごと保存)
    const srcTa = h('textarea.zeta-ta', { id: 'z-source', rows: 10, value: z.source,
      placeholder: 'zetaのユーザープロフィールや、長い設定をそのまま貼り付けて保存できます(字数制限なし)' });
    const srcCount = counter(srcTa, true);
    srcTa.addEventListener('input', () => { z.source = srcTa.value; save(); });
    const fromFields = async () => {
      const t = Store.text.all(u);
      if (!t.trim()) return U.toast('プロフィール・年表・設定メモがまだありません', 'error');
      if (z.source.trim() && z.source !== t && !(await U.confirmDialog({
        title: '元の文章を置き換える',
        message: 'いまの「元の文章」を、このuserのプロフィール・年表・設定メモをまとめた文章に置き換えます。',
        okLabel: '置き換える'
      }))) return;
      srcTa.value = t;
      z.source = t;
      save();
      srcCount.update();
      U.toast('プロフィール・年表・設定メモから作りました');
    };

    // ③ zetaに貼る文章 (1000字まで)
    const outTa = h('textarea.zeta-ta', { id: 'z-text', rows: 12, value: z.text,
      placeholder: `zetaのユーザープロフィール欄に貼る文章(${LIMIT}字まで・改行も1字)。直接書いても、上の道具で作ってもOK` });
    const outCount = counter(outTa);
    let undoText = null;
    const undoBtn = h('button.btn.btn-ghost.btn-sm', { type: 'button', hidden: true, onclick: () => {
      if (undoText == null) return;
      setOut(undoText);
      U.toast('元に戻しました');
    } }, icon('undo'), '元に戻す');
    const setOut = (text) => {
      outTa.value = text;
      z.text = text;
      save();
      outCount.update();
      undoText = null;
      undoBtn.hidden = true;
    };
    outTa.addEventListener('input', () => { z.text = outTa.value; save(); undoText = null; undoBtn.hidden = true; });
    const use = (text) => {
      const before = z.text;
      setOut(text);
      if (before !== text) { undoText = before; undoBtn.hidden = false; }
      U.toast('zetaに貼る文章に入れました');
      outTa.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const copyOut = () => {
      const t = outTa.value;
      if (!t.trim()) return U.toast('コピーする内容がありません', 'error');
      const over = count(t) - LIMIT;
      U.copyText(t, over > 0 ? `コピーしました(${LIMIT}字を${over}字 超えています)` : 'コピーしました');
    };

    // ② 1000字に収める道具
    const sources = () => [
      z.source.trim() && { label: '元の文章', text: z.source },
      z.text.trim() && { label: 'zetaに貼る文章', text: z.text }
    ].filter(Boolean);
    const tool = (ic, title, desc, open) => h('button.ztool', { type: 'button', onclick: () => {
      flush();
      const list = sources();
      if (!list.length) return U.toast('先に「元の文章」か「zetaに貼る文章」を入力してください', 'error');
      open(list, use);
    } }, h('b', icon(ic, 17), title), h('small', desc));

    return h('div.zeta',
      h('div.sec-head', h('h2', 'zetaプロフ')),
      h('p.zeta-lead', `zetaのユーザープロフィールは${LIMIT}字まで(改行も1字)。長い設定は「元の文章」に丸ごと保存しておき、${LIMIT}字に収めた版を下で作れます。入力した内容は自動で保存されます。`),

      h('section.zeta-box',
        h('div.zeta-box-head',
          h('label.zeta-title', { for: 'z-source' }, h('span.zno', '1'), '元の文章', h('small', '字数制限なし・丸ごと保存')),
          h('div.sec-actions',
            h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: fromFields, title: 'プロフィール・年表・設定メモをまとめて入れる' }, icon('user'), 'userprofの内容から作る'),
            h('button.btn.btn-outline.btn-sm', { type: 'button', onclick: () => (srcTa.value.trim() ? U.copyText(srcTa.value) : U.toast('コピーする内容がありません', 'error')) }, icon('copy'), 'コピー'))),
        srcTa, srcCount.el),

      h('section.zeta-box',
        h('div.zeta-box-head', h('p.zeta-title', h('span.zno', '2'), `${LIMIT}字に収める`)),
        h('div.zeta-tools',
          tool('sparkle', '整えて詰める', '空白・空行・改行などを詰める。意味は変わりません', tidyDialog),
          tool('list', '項目を選んで減らす', '項目ごとの字数を見ながら、外す・書き直す', blocksDialog),
          tool('bubble', 'AIに要約を頼む', 'ChatGPTなどに貼る指示文を作り、返事を貼り戻す', aiDialog))),

      h('section.zeta-box.zeta-out',
        h('div.zeta-box-head',
          h('label.zeta-title', { for: 'z-text' }, h('span.zno', '3'), 'zetaに貼る文章', h('small', `${LIMIT}字まで`)),
          h('div.sec-actions', undoBtn,
            h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: copyOut }, icon('copy'), 'コピー'))),
        outTa, outCount.el));
  }

  Views.tabZeta = tabZeta;
})();
