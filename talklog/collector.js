/* talklog collector — zeta のトーク画面で動き、表示された発言を集めて HTML ファイルに書き出す
 *
 * 使い方: ブックマークレット / ユーザースクリプトから読み込む(talklog のページに手順あり)
 *   - window.__talklogAuto = true を立ててから読み込むと、すぐにパネルを開く(ブックマークレット)
 *   - 立てずに読み込むと、トーク画面に小さな起動ボタンだけを出す(ユーザースクリプト)
 *
 * しくみ:
 *   zeta のトークは「見えている範囲だけ DOM に置く」作り(仮想リスト)なので、
 *   スクロールしながら何度も読み取り、見えていた並びの重なりを手がかりにつなぎ合わせる。
 *   読み取った内容はこの端末の中だけで扱い、どこにも送信しない。
 *
 * zeta 固有の目印(画面の作りが変わったらここを直す):
 *   1件の塊   … [data-key^="message-"] / [data-key^="local-reply-"](PC) , ChatMessage / Candidate
 *   吹き出し  … ChatBubbleContainer(発言) / NarratorBubble(地の文) / InfoBoxContent(インフォボックス)
 *   左右      … Left/RightContentView, Left/RightTextContent(Right = 自分)
 *   名前      … .caption1
 *   再生成候補 … Swiper(.swiper-slide)。表示中は .swiper-slide-active
 */
(function () {
  'use strict';
  var VER = '1.1.1';

  if (window.__talklog && window.__talklog.ver) {
    if (window.__talklogAuto) { window.__talklogAuto = false; window.__talklog.open(); }
    return;
  }

  /* ------------------------------------------------------------ 目印 */
  var SC = function (n) { return '[data-sentry-component="' + n + '"]'; };
  var SEL = {
    block: '[data-key^="message-"],[data-key^="local-reply-"],' + SC('ChatMessage') + ',' + SC('Candidate'),
    side: SC('RightContentView') + ',' + SC('RightTextContent') + ',' + SC('LeftContentView') + ',' + SC('LeftTextContent'),
    bubble: SC('ChatBubbleContainer') + ',' + SC('NarratorBubble'),
    info: SC('InfoBoxContent'),
    infoCollapsed: SC('InfoBoxCollapsedContent'),
    dice: SC('DiceRecordContent'),
    name: '.caption1'
  };

  /* ------------------------------------------------------------ 集めたもの */
  var blocks = new Map();   // blockKey → { items:[{kind,name,right,body}], idx, local }
  var order = [];           // blockKey の並び(古い→新しい)
  var opts = { narration: true, info: true };
  // scrollDir: 最後に動いた向き(上 -1 / 下 1)。moveDir: 自動で動かしている間の向き(手で動かしているときは 0)
  var lastFromBottom = null, scrollDir = 0, moveDir = 0, sawBottom = false;
  var infoClicked = typeof WeakSet === 'function' ? new WeakSet() : null;

  /* ------------------------------------------------------------ 文字の取り出し */
  function textOf(el) {
    var c = el.cloneNode(true);
    var junk = c.querySelectorAll('.caption1,img,button,svg,video,audio,[role="button"]');
    for (var i = 0; i < junk.length; i++) junk[i].remove();
    function walk(node) {
      var out = '';
      for (var j = 0; j < node.childNodes.length; j++) {
        var n = node.childNodes[j];
        if (n.nodeType === 3) { out += n.textContent; continue; }
        if (n.nodeType !== 1) continue;
        var t = n.tagName;
        if (t === 'BR') out += '\n';
        else if (t === 'EM' || t === 'I') { var e = walk(n).trim(); if (e) out += '*' + e + '*'; }
        else if (t === 'STRONG' || t === 'B') { var s = walk(n).trim(); if (s) out += '**' + s + '**'; }
        else if (t === 'P' || t === 'DIV' || t === 'LI') { var w = walk(n); out += w + (/\n$/.test(w) ? '' : '\n'); }
        else out += walk(n);
      }
      return out;
    }
    return walk(c).replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** インフォボックス: 「ラベル：値」の行にする。閉じていたら一度だけ開く */
  function infoText(box) {
    var col = box.querySelector(SEL.infoCollapsed);
    if (col && infoClicked && !infoClicked.has(box)) {
      infoClicked.add(box);
      var btn = col.closest('button');
      if (btn) { try { btn.click(); return null; } catch (e) { /* 見えている分で */ } }
    }
    var lines = [];
    var rows = box.querySelectorAll('.caption1,.chat');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.classList.contains('caption1')) {
        var nm = r.textContent.trim();
        if (nm) lines.push('【' + nm + '】');
        continue;
      }
      if (r.parentElement && r.parentElement.closest('.chat')) continue;
      var cs = r.children;
      var label = cs.length >= 2 ? cs[0].textContent.trim() : '';
      var value = cs.length >= 2 ? cs[cs.length - 1].textContent.trim() : r.textContent.trim();
      if (label || value) lines.push(label ? label + '：' + value : value);
    }
    if (!lines.length) { var t = textOf(box); if (t) lines.push(t); }
    return lines.join('\n');
  }

  /** 再生成候補のうち、いま表示していないもの */
  function offSlide(el) {
    var slide = el.closest('.swiper-slide');
    if (!slide || !slide.parentElement) return false;
    var sibs = slide.parentElement.children;
    for (var i = 0; i < sibs.length; i++) {
      if (sibs[i].classList && sibs[i].classList.contains('swiper-slide-active')) return !slide.classList.contains('swiper-slide-active');
    }
    // Swiperがまだ動いていないときは、枠の左右に中心が収まっているかで判断
    var frame = (slide.parentElement.closest('.swiper') || slide.parentElement).getBoundingClientRect();
    if (!frame.width) return false;
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) return true;
    var cx = r.left + r.width / 2;
    return cx < frame.left || cx > frame.right;
  }

  function isRight(el) {
    var side = el.closest(SEL.side) || el.querySelector(SEL.side);
    if (side) return (side.getAttribute('data-sentry-component') || '').indexOf('Right') === 0;
    return !!(el.querySelector('.items-end,.self-end,.justify-end') || /\b(items-end|self-end|justify-end)\b/.test(el.className || ''));
  }

  /** 1つの塊から発言を取り出す */
  function readBlock(el) {
    var found = el.querySelectorAll(SEL.bubble + ',' + SEL.info);
    var items = [];
    var lastRight = false;
    for (var i = 0; i < found.length; i++) {
      var b = found[i];
      var parent = b.parentElement;
      if (parent && parent.closest(SEL.bubble + ',' + SEL.info) && el.contains(parent.closest(SEL.bubble + ',' + SEL.info))) continue; // 入れ子の内側
      if (offSlide(b)) continue;
      if (b.matches(SEL.info)) {
        var it = infoText(b);
        if (it === null) return null;   // 開いた直後。次の読み取りで拾う
        if (it) items.push({ kind: 'info', name: 'インフォボックス', right: false, body: it });
        continue;
      }
      var body = textOf(b);
      if (!body) continue;
      if (b.getAttribute('data-sentry-component') === 'NarratorBubble') {
        items.push({ kind: 'narration', name: '', right: false, body: body });
        continue;
      }
      var side = b.closest(SEL.side);
      var name = '';
      var right = lastRight;
      if (side) {
        var cap = side.querySelector(SEL.name);
        name = cap ? cap.textContent.trim() : '';
        right = (side.getAttribute('data-sentry-component') || '').indexOf('Right') === 0;
      } else {
        right = isRight(b);
      }
      lastRight = right;
      // 自分(右側)にも user の名前が出る画面があるので、取れた名前は残す
      items.push({ kind: 'speech', name: name, right: right, body: body });
    }
    if (!found.length) {
      // 目印が無い画面: 塊ごと1件にする
      if (el.querySelector(SEL.dice)) return [];
      var cap2 = el.querySelector(SEL.name);
      var body2 = textOf(el);
      if (body2) {
        var r2 = isRight(el);
        items.push({ kind: 'speech', name: cap2 ? cap2.textContent.trim() : '', right: r2, body: body2 });
      }
    }
    return items;
  }

  /* ------------------------------------------------------------ 画面の読み取り */
  function hash(s) {
    var x = 5381;
    for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0;
    return (x >>> 0).toString(36);
  }

  var sigOf = function (items) { return hash(items.map(function (x) { return x.kind + '|' + x.name + '|' + x.body; }).join('\n')); };

  /**
   * いま画面にある塊を、上から順に返す: [{key, el, sig, idx, local, items}]
   * key は data-key(PC) か id。どちらも無い画面(スマホ)では空で、並びの重なりでつなぐ。
   */
  function visibleBlocks() {
    var els = document.querySelectorAll(SEL.block);
    var out = [];
    var seen = new Set();
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      // 塊の中の塊(ChatMessage の中の Candidate など)は外側にまとめる
      var outer = el.parentElement && el.parentElement.closest(SEL.block);
      if (outer) continue;
      var row = el.closest('[data-index]') || el;
      var dk = el.getAttribute('data-key') || (row.getAttribute && row.getAttribute('data-key')) || '';
      var items = readBlock(el);
      if (items === null) continue;
      if (!items.length) continue;
      var key = dk || (el.id ? 'id:' + el.id : '');
      if (key) { if (seen.has(key)) continue; seen.add(key); }
      var idx = row.getAttribute ? parseInt(row.getAttribute('data-index'), 10) : NaN;
      out.push({ key: key, el: el, sig: sigOf(items), idx: isNaN(idx) ? null : idx, local: /^local-reply-/.test(dk), items: items });
    }
    if (!out.length) out = fallbackRows();
    return out;
  }

  /** 目印が全く無い画面の最後の手段: 名前(.caption1)を1つだけ含む一番外側の箱を1件とみなす */
  function fallbackRows() {
    var caps = document.querySelectorAll(SEL.name);
    var out = [];
    for (var i = 0; i < caps.length; i++) {
      var row = caps[i].parentElement, best = null;
      while (row && row !== document.body) {
        if (row.querySelectorAll(SEL.name).length !== 1) break;
        best = row;
        row = row.parentElement;
      }
      if (!best || (panelHost && panelHost.contains(best))) continue;
      var body = textOf(best);
      if (!body) continue;
      var name = caps[i].textContent.trim();
      var right = isRight(best);
      var its = [{ kind: 'speech', name: name, right: right, body: body }];
      out.push({ key: '', el: best, sig: sigOf(its), idx: null, local: false, items: its });
    }
    return out;
  }

  /*
   * 画面で隣り合っていた塊どうしのつながり(いちばん確かな並び)。
   * 並び(order)は毎回このつながりで組み直すので、いったん違う位置に置いた塊も、
   * あとで前後とのつながりが見えれば正しい位置へ移る。
   */
  var nextOf = new Map(), prevOf = new Map();
  var chainOf = new Map();   // blockKey → つながりの塊(鎖)の番号。relink で付け直す
  function link(a, b) {
    if (a === b || nextOf.get(a) === b) return;
    var oldB = nextOf.get(a);
    if (oldB !== undefined && prevOf.get(oldB) === a) prevOf.delete(oldB);
    var oldA = prevOf.get(b);
    if (oldA !== undefined && nextOf.get(oldA) === b) nextOf.delete(oldA);
    nextOf.set(a, b);
    prevOf.set(b, a);
  }
  /** 隣どうしか。番号(data-index)があれば差が小さいときだけ(間に文字の無い行がはさまることがある) */
  function adjacent(a, b) {
    if (a.idx === null || b.idx === null) return true;
    var d = b.idx - a.idx;
    return d > 0 && d <= 3;
  }
  /** 鎖ごとにまとめ直す。鎖どうしの前後は、これまでの並びで先に出てくる順 */
  function relink() {
    var out = [];
    chainOf = new Map();
    for (var i = 0, c = 0; i < order.length; i++) {
      if (chainOf.has(order[i])) continue;
      var h = order[i];
      for (var s = 0; prevOf.has(h) && s < order.length; s++) h = prevOf.get(h);
      if (chainOf.has(h)) h = order[i];   // 輪になっていたときの保険
      for (var k = h; k !== undefined && !chainOf.has(k); k = nextOf.get(k)) { chainOf.set(k, c); out.push(k); }
      c++;
    }
    order = out;
  }

  /** 見えている並びを、これまでの並び(order)に継ぎ足す */
  function merge(vis) {
    var pos = function (k) { return order.indexOf(k); };
    var anchors = 0;
    for (var a = 0; a < vis.length; a++) if (blocks.has(vis[a].key)) anchors++;
    if (!anchors && order.length) {
      // 重なりが無い(間を飛ばした): ひとまず動いた向きの端に置く。間が読めてつながれば正しい位置へ並び直る。
      // data-index は古い分を読み込むたびに振り直されるので、覚えておいた番号とは比べない(比べて途中に差し込むと順番が崩れた)
      var keys = vis.map(function (v) { return v.key; });
      order = scrollDir < 0 ? keys.concat(order) : order.concat(keys);
    } else {
      var lastPos = -1, pending = [];
      for (var i = 0; i < vis.length; i++) {
        var k = vis[i].key;
        var p = pos(k);
        if (p >= 0) {
          if (pending.length) {
            var at = lastPos >= 0 ? lastPos + 1 : p;
            order.splice.apply(order, [at, 0].concat(pending));
            p += at <= p ? pending.length : 0;
            pending = [];
          }
          lastPos = p;
        } else {
          pending.push(k);
        }
      }
      if (pending.length) order.splice.apply(order, [lastPos + 1, 0].concat(pending));
    }
    for (var j = 0; j < vis.length; j++) {
      var v = vis[j];
      blocks.set(v.key, { items: v.items, idx: v.idx, local: v.local, sig: v.sig });
      if (j > 0 && adjacent(vis[j - 1], v)) link(vis[j - 1].key, v.key);
    }
    relink();
    return anchors > 0;
  }

  /*
   * 目印の無い画面(スマホ): 「見えている並び」を「これまでの並び」に、一番長く重なる位置で重ねる。
   * 同じ内容の発言(「うん」が何度も出る等)があっても、前後の並びごと比べるので取り違えにくい。
   * いま画面にあるDOM要素は覚えておき、表示途中で文字が伸びても同じ発言として扱う。
   */
  var elIds = typeof WeakMap === 'function' ? new WeakMap() : null;
  var seqN = 0, cursor = 0;
  var seqVisIds = [];   // 最後に見えていた塊に付けたid(前に見えていた所と重なったかを確かめるのに使う)
  function mergeSeq(vis) {
    var newId = function (v) {
      var id = 's' + (++seqN);
      blocks.set(id, { items: v.items, idx: null, local: false, sig: v.sig });
      if (elIds) elIds.set(v.el, id);
      return id;
    };
    vis.forEach(function (v) { var id = elIds && elIds.get(v.el); v.eid = id && blocks.has(id) ? id : null; });
    if (!order.length) { seqVisIds = vis.map(newId); order = seqVisIds.slice(); cursor = 0; return true; }

    // 直前に重ねた位置の近くで、見えている並びとの最長共通部分列(LCS)をとる。
    // 途中に塊が増えた/減った(インフォボックスを開いた等)場合も、前後の並びで位置が決まる。
    var L = vis.length;
    // 内容だけで合わせた対応は、隣の対応と位置のずれがほぼ同じものだけ使う
    // (「うん」のような短い発言が、離れた場所の同じ発言に合ってしまうため)。同じDOM要素で合ったものはそのまま使う
    var textLen = function (v) { return v.items.reduce(function (n, x) { return n + x.body.length; }, 0); };
    var near = function (p, q) {
      if (!q) return false;
      var di = p[0] - q[0], dg = p[1] - q[1];
      if (di * dg <= 0) return false;
      if (dg === di) return true;
      // 間で塊が増えた/減った(インフォボックスを開いた等)ずれは、ある程度長い発言のときだけ許す
      return Math.abs(dg - di) <= 2 && textLen(vis[p[0]]) >= 12;
    };
    var solid = function (ps) {
      if (L === 1) return ps;
      return ps.filter(function (p, n) { return vis[p[0]].eid || near(p, ps[n - 1]) || near(p, ps[n + 1]); });
    };
    var pairs = solid(lcsPairs(vis, Math.max(0, cursor - L * 2), Math.min(order.length, cursor + L * 3)));
    if (!pairs.length) pairs = solid(lcsPairs(vis, 0, order.length));
    if (!pairs.length) {
      // 重なりが無い(間を飛ばした): スクロールの向きで前後を決める
      var ids = seqVisIds = vis.map(newId);
      if (scrollDir < 0) { order = ids.concat(order); cursor = 0; } else { cursor = order.length; order = order.concat(ids); }
      return false;
    }
    var visIds = new Array(L), inserts = [], pending = [], lastG = -1, pi = 0;
    for (var i = 0; i < L; i++) {
      if (pi < pairs.length && pairs[pi][0] === i) {
        var g = pairs[pi][1];
        // 同じ発言: 中身を最新にする(表示途中で伸びた文字など)
        var b = blocks.get(order[g]);
        b.items = vis[i].items; b.sig = vis[i].sig;
        if (elIds) elIds.set(vis[i].el, order[g]);
        visIds[i] = order[g];
        if (pending.length) { inserts.push({ at: lastG >= 0 ? lastG + 1 : g, ids: pending }); pending = []; }
        lastG = g;
        pi++;
      } else {
        visIds[i] = newId(vis[i]);
        pending.push(visIds[i]);
      }
    }
    if (pending.length) inserts.push({ at: lastG + 1, ids: pending });
    inserts.sort(function (a, c) { return c.at - a.at; }).forEach(function (ins) {
      order.splice.apply(order, [ins.at, 0].concat(ins.ids));
    });
    cursor = Math.max(0, order.indexOf(visIds[0]));
    seqVisIds = visIds;
    return true;
  }
  /** vis と order[lo..hi) の対応(LCS)。返り値 [[visの番号, orderの番号], ...] */
  function lcsPairs(vis, lo, hi) {
    var n = vis.length, m = hi - lo;
    if (n <= 0 || m <= 0) return [];
    var same = function (i, g) {
      var v = vis[i];
      return v.eid ? v.eid === order[g] : blocks.get(order[g]).sig === v.sig;
    };
    var W = m + 1;
    var dp = new Uint16Array((n + 1) * W);
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i * W + j] = same(i, lo + j) ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
      }
    }
    var out = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (same(i, lo + j) && dp[i * W + j] === dp[(i + 1) * W + j + 1] + 1) { out.push([i, lo + j]); i++; j++; }
      else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
      else j++;
    }
    return out;
  }

  var visNow = 0;
  // 最後の読み取りで見えていた塊のキー(キーの無い画面では mergeSeq が付けたid)、キーの無い画面か、前回までと重なりがあったか
  var visKeys = [], visSeq = false, lastLinked = true;
  // 前回までと重なりが見つからなかった(=間を読み飛ばしたかもしれない)回数。書き出し後に知らせる
  var gapEvents = 0;
  /** 読み取って継ぎ足す。前回までと重なりがあれば true。quiet のときは読み飛ばしとして数えない */
  function scan(quiet) {
    // 向きは継ぎ足す前に決める(重なりが無いとき、どちらの端に置くかに使う)
    var t = scroller();
    if (t) {
      // 「下からの距離」で見る。古い分を上に足しても変わらないので、読み込みを動いたと取り違えない
      var fb = fromBottom(t);
      if (lastFromBottom !== null && Math.abs(fb - lastFromBottom) > 1) scrollDir = fb > lastFromBottom ? -1 : 1;
      lastFromBottom = fb;
    }
    if (moveDir) scrollDir = moveDir;
    var vis = visibleBlocks();
    visNow = vis.length;
    var hadOrder = order.length > 0;
    var linked = !hadOrder;
    var keyed = vis.length > 0 && vis.every(function (v) { return v.key; });
    if (vis.length) {
      linked = (keyed ? merge(vis) : mergeSeq(vis)) || linked;
      if (!linked && hadOrder && quiet !== true) gapEvents++;
    }
    visKeys = !vis.length ? [] : keyed ? vis.map(function (v) { return v.key; }) : seqVisIds.slice();
    visSeq = vis.length > 0 && !keyed;
    lastLinked = linked || !vis.length;
    if (t && atBottom(t)) sawBottom = true;
    updatePanel();
    return lastLinked;
  }
  /** いま見えている所の目印(動かす前に取っておき、動かした後につながったかを確かめる) */
  function snap() { return { keys: visKeys.slice(), fb: lastFromBottom, seq: visSeq }; }
  /**
   * 前に見えていた所と、いま見えている所がつながったか。
   * キーのある画面は鎖が同じか(間の画面を通してつながっていればよい)、キーの無い画面は前に見えていた塊がいまも見えているか。
   */
  function joined(prev) {
    if (!prev.keys.length || !visKeys.length) return lastLinked;
    if (prev.seq || visSeq) return visKeys.some(function (k) { return prev.keys.indexOf(k) >= 0; });
    var seen = {};
    prev.keys.forEach(function (k) { if (chainOf.has(k)) seen[chainOf.get(k)] = true; });
    return visKeys.some(function (k) { return seen[chainOf.get(k)] === true; });
  }

  /* ------------------------------------------------------------ スクロール */
  function scroller() {
    var one = document.querySelector(SEL.block) || document.querySelector(SEL.name);
    var c = one && one.parentElement;
    while (c && c !== document.body && c !== document.documentElement) {
      var st = getComputedStyle(c);
      if (/(auto|scroll)/.test(st.overflowY) && c.scrollHeight > c.clientHeight + 10) return c;
      c = c.parentElement;
    }
    var se = document.scrollingElement;
    return se && se.scrollHeight > window.innerHeight + 10 ? se : null;
  }
  /*
   * zeta のトーク欄は flex-direction: column-reverse(下から積む)。この場合 scrollTop は
   * いちばん下(最新)が 0 で、上へ行くほどマイナスになる(Chrome/Safari/Firefox 共通)。
   * 「上からの距離」にそろえて判定する。動かす向き(足すと下、引くと上)はどちらも同じ。
   */
  var reversed = function (t) { return t.scrollTop < 0 || getComputedStyle(t).flexDirection === 'column-reverse'; };
  var fromTop = function (t) { return reversed(t) ? t.scrollHeight - t.clientHeight + t.scrollTop : t.scrollTop; };
  var fromBottom = function (t) { return t.scrollHeight - t.clientHeight - fromTop(t); };
  var atTop = function (t) { return fromTop(t) <= 2; };
  var atBottom = function (t) { return fromBottom(t) <= 8; };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  var runId = 0;
  /** 画面に並んでいる塊の「顔ぶれ」。描き直されたかどうかの目安 */
  function domSig() {
    var els = document.querySelectorAll(SEL.block);
    if (!els.length) return '0';
    var f = function (e) { return e.getAttribute('data-key') || (e.textContent || '').slice(0, 40); };
    return els.length + '|' + f(els[0]) + '|' + f(els[els.length - 1]);
  }
  /** 画面が描き直されるのを待つ(塊の顔ぶれが変わるまで。変わらなくても ticks×80ms で先へ) */
  async function settle(before, my, ticks) {
    for (var w = 0; w < (ticks || 20) && my === runId; w++) {
      await sleep(80);
      if (domSig() !== before) break;
    }
    await sleep(60);
  }
  /**
   * スクロールして、画面が描き直されるのを待ってから読み取る。
   * 前に見えていた所とつながらなければ(=速すぎたり、古い分の読み込みで画面が跳んだりして間を飛ばした)、戻って間を埋める。
   */
  async function stepBy(t, dy, my) {
    var prev = snap(), before = domSig();
    moveDir = dy < 0 ? -1 : 1;
    t.scrollTop = t.scrollTop + dy;   // 端を越える分はブラウザが止める(下から積む画面では上がマイナス)
    await settle(before, my);
    scan(true);
    if (!joined(prev)) await fillGap(t, prev, my);
    moveDir = 0;
  }
  /**
   * 間を飛ばしたとき: 来た方へ少しずつ戻りながら読み直し、前に見えていた所とつながったら元の位置へ戻る。
   * 戻る幅は初めは細かく(1/4ずつ)、つながらなければ1歩ずつ。前に見えていた所を1画面ぶん過ぎてもだめならあきらめる。
   * (古い分の読み込みが続けて起きると、何十行も跳ぶことがあるので、回数ではなく位置で区切る)
   */
  async function fillGap(t, prev, my) {
    var dir = moveDir || scrollDir || -1;   // 進んでいた向き。戻るのはその逆
    var step = Math.max(80, Math.round(t.clientHeight * 0.45));
    var back = t.scrollTop, filled = false;
    for (var k = 1; k <= (prev.fb === null ? 15 : 3000) && my === runId; k++) {
      var before = domSig(), was = t.scrollTop;
      t.scrollTop = back - dir * step * (k <= 3 ? k / 4 : k - 3);
      if (Math.abs(t.scrollTop - was) < 1) break;   // 端まで戻った
      await settle(before, my, 8);
      scan(true);
      if (joined(prev)) { filled = true; break; }
      if (prev.fb !== null && dir * (fromBottom(t) - prev.fb) > t.clientHeight) break;
    }
    if (!filled && my === runId) gapEvents++;
    var b2 = domSig();
    t.scrollTop = back;
    await settle(b2, my);
    scan(true);
  }
  /** 少しずつ下ろして、最新まで読み込む(最後の1画面を取りこぼさないため) */
  async function sweepDown() {
    var my = ++runId;
    var t = scroller();
    if (!t) { scan(); return; }
    var stuck = 0;
    scan();
    for (var i = 0; i < 800 && my === runId; i++) {
      if (atBottom(t)) break;
      var prev = fromTop(t);
      await stepBy(t, Math.max(80, Math.round(t.clientHeight * 0.45)), my);
      stuck = fromTop(t) <= prev ? stuck + 1 : 0;
      if (stuck > 3) break;
    }
    scan();
  }
  /** 一番上(最初の発言)まで自動で遡る。古い分の読み込みを待ちながら進む */
  async function climbUp() {
    var my = ++runId;
    var t = scroller();
    if (!t) { scan(); return; }
    setState('climbing');
    var still = 0;
    scan();
    while (my === runId) {
      if (atTop(t)) {
        var h0 = t.scrollHeight, prev = snap();
        await sleep(1200);   // 古い発言の読み込みを待つ
        // 読み込んだはずみで画面が跳んで、間を飛ばすことがある → つながるまで戻って読み直す
        moveDir = -1;
        scan(true);
        if (!joined(prev)) await fillGap(t, prev, my);
        moveDir = 0;
        if (t.scrollHeight === h0 && atTop(t)) { if (++still >= 3) break; } else still = 0;
        continue;
      }
      still = 0;
      await stepBy(t, -Math.max(80, Math.round(t.clientHeight * 0.45)), my);
    }
    scan();
    if (my === runId) setState('top');
  }
  function stopRun() { runId++; setState('ready'); }

  /* ------------------------------------------------------------ 書き出し */
  function collect() {
    var out = [];
    var seenMsg = {};
    order.forEach(function (k) {
      var b = blocks.get(k);
      if (b && !b.local) b.items.forEach(function (x) { seenMsg[x.name + '|' + x.body] = true; });
    });
    order.forEach(function (k) {
      var b = blocks.get(k);
      if (!b) return;
      b.items.forEach(function (x) {
        // 送った直後の返答(local-reply)が、あとで本番の行に置き直されて二重になったら落とす
        if (b.local && seenMsg[x.name + '|' + x.body]) return;
        if (x.kind === 'narration' && !opts.narration) return;
        if (x.kind === 'info' && !opts.info) return;
        out.push({ kind: x.kind, name: x.name, right: x.right, body: x.body });
      });
    });
    return out;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lineHtml(body) {
    return body.split('\n').map(function (l) {
      l = l.trim();
      if (!l) return '';
      var action = /^\*[^*].*\*$/.test(l) && l.indexOf('**') === -1;
      var h = esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
      return '<p' + (action ? ' class="act"' : '') + '>' + h + '</p>';
    }).filter(Boolean).join('');
  }
  function pageTitle() {
    var t = (document.title || '').replace(/\s*[-|｜]\s*zeta.*$/i, '').trim();
    // zeta のページタイトルは「zeta」だけなので、画面上部のヘッダーにあるトーク名を使う
    if (!t || /^zeta$/i.test(t)) {
      var hd = document.querySelector(SC('Header') + ' .title16') || document.querySelector(SC('Header') + ' .truncate');
      if (hd && hd.textContent.trim()) t = hd.textContent.trim();
    }
    return t || 'トーク';
  }

  function buildHtml(items) {
    var title = pageTitle();
    var now = new Date();
    var rows = items.map(function (x) {
      var cls = x.kind === 'narration' ? 'nar' : x.kind === 'info' ? 'info' : (x.right ? 'me' : 'them');
      return '<div class="m ' + cls + '">' + (x.name && x.kind !== 'narration' ? '<div class="nm">' + esc(x.name) + '</div>' : '') +
        '<div class="bb">' + lineHtml(x.body) + '</div></div>';
    }).join('\n');
    var data = JSON.stringify({ app: 'talklog', version: 1, tool: VER, title: title, savedAt: now.toISOString(), items: items })
      .replace(/</g, '\\u003c');
    var css = [
      ':root{--bg:#f5f7fb;--them:#fff;--me:#e9e6ff;--line:#e6e3fa;--text:#2c2c2c;--muted:#6b6478;--accent:#6d5dfc}',
      '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.75 "Hiragino Sans","Yu Gothic UI","Meiryo",system-ui,sans-serif}',
      '.wrap{max-width:760px;margin:0 auto;padding:28px 18px 60px}',
      'header{border-bottom:3px solid var(--accent);padding-bottom:12px;margin-bottom:22px}',
      'h1{font-size:20px;margin:0 0 4px}.meta{font-size:12px;color:var(--muted)}',
      '.m{display:flex;flex-direction:column;margin:12px 0;max-width:84%}',
      '.m.them{align-items:flex-start;margin-right:auto}.m.me{align-items:flex-end;margin-left:auto}',
      '.nm{font-size:12px;font-weight:700;color:var(--muted);margin:0 0 3px 4px}',
      '.bb{padding:10px 15px;border-radius:16px;border:1px solid var(--line);white-space:normal;overflow-wrap:anywhere}',
      '.them .bb{background:var(--them);border-top-left-radius:4px}.me .bb{background:var(--me);border-color:#d6d0fb;border-top-right-radius:4px}',
      '.bb p{margin:3px 0}.bb p.act,.nar p{color:var(--muted);font-style:italic}',
      '.m.nar{max-width:100%;margin:14px 6%;align-items:stretch}.nar .bb{background:transparent;border:0;border-left:3px solid var(--line);border-radius:0;padding:4px 14px}',
      '.m.info{max-width:100%;align-items:stretch}.info .nm{color:var(--accent)}.info .bb{background:#f3f1ff;border-style:dashed;font-size:13.5px}',
      'footer{margin-top:40px;font-size:11.5px;color:var(--muted);text-align:center}',
      '@media print{body{background:#fff}.m{break-inside:avoid}}'
    ].join('\n');
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + ' — talklog</title><style>' + css + '</style></head><body><div class="wrap">' +
      '<header><h1>' + esc(title) + '</h1><div class="meta">書き出し: ' + esc(now.toLocaleString('ja-JP')) + ' ／ ' + items.length + '件</div></header>' +
      rows +
      '<footer>talklog で保存したトークです(zeta非公式ツール)。発言の日時は保存されません。</footer>' +
      '</div><script type="application/json" id="talklog-data">' + data + '</' + 'script></body></html>';
  }

  function fileName() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    var t = pageTitle().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '_').slice(0, 30) || 'talk';
    return 'talklog_' + t + '_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.html';
  }

  async function exportNow() {
    setState('exporting');
    // 最後に、いちばん下まで一度通って取りこぼしを防ぐ
    if (!sawBottom) await sweepDown();
    scan();
    var items = collect();
    if (!items.length) { setState('ready'); say('発言が見つかりませんでした。トーク画面で開いているか確かめてください。', true); return; }
    var blob = new Blob([buildHtml(items)], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    setState('done', items.length);
  }

  /* ------------------------------------------------------------ パネル(Shadow DOMで画面のCSSと分ける) */
  var panelHost = null, ui = null, state = 'ready', observer = null, timer = null;

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  var PANEL_CSS = [
    ':host{all:initial}',
    '.p{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483646;width:min(440px,calc(100vw - 20px));',
    'background:#fff;color:#2c2c2c;border:1px solid #dcd7fb;border-radius:16px;box-shadow:0 14px 40px rgba(40,20,70,.28);',
    'font:13.5px/1.6 "Hiragino Sans","Yu Gothic UI","Meiryo",system-ui,sans-serif;padding:12px 14px 12px}',
    '.hd{display:flex;align-items:center;gap:8px;margin-bottom:4px}.logo{font:700 15px/1 Georgia,serif;color:#2c2c2c}.logo b{color:#6d5dfc}',
    '.ver{font-size:10.5px;color:#9a93a8}.x{margin-left:auto;border:0;background:none;font-size:18px;line-height:1;color:#8a8399;cursor:pointer;padding:4px 6px;border-radius:8px}',
    '.x:hover{background:#f3f1ff}.count{font-size:15px;font-weight:700}.count small{font-size:11.5px;font-weight:400;color:#8a8399;margin-left:6px}',
    '.guide{color:#5b5567;margin:4px 0 10px}.guide.warn{color:#c4425a}',
    '.row{display:flex;gap:8px;flex-wrap:wrap}',
    'button.b{flex:1;min-height:40px;border-radius:999px;border:1px solid #cdc6fd;background:#fff;color:#5b51c9;font:700 13px/1 inherit;cursor:pointer;padding:0 12px}',
    'button.b:hover{background:#f3f1ff}button.b.pri{background:#6d5dfc;border-color:#6d5dfc;color:#fff}button.b.pri:hover{background:#5b51c9}',
    'button.b:disabled{opacity:.5;cursor:default}',
    '.opt{display:flex;gap:14px;margin-top:8px;font-size:12px;color:#5b5567}.opt label{display:flex;align-items:center;gap:5px;cursor:pointer}',
    '.note{margin-top:6px;font-size:11px;color:#9a93a8}',
    '.launch{position:fixed;right:14px;bottom:86px;z-index:2147483645;border:0;border-radius:999px;background:#6d5dfc;color:#fff;',
    'font:700 12.5px/1 "Hiragino Sans","Yu Gothic UI",system-ui,sans-serif;padding:10px 14px;box-shadow:0 6px 18px rgba(40,20,70,.3);cursor:pointer;opacity:.92}',
    '.launch:hover{opacity:1}'
  ].join('');

  function ensureHost() {
    if (panelHost && panelHost.isConnected) return;
    panelHost = el('div', { id: 'talklog-host' });
    var root = panelHost.attachShadow ? panelHost.attachShadow({ mode: 'open' }) : panelHost;
    var style = el('style', null, PANEL_CSS);
    root.appendChild(style);
    ui = { root: root };
    document.documentElement.appendChild(panelHost);
  }

  function buildPanel() {
    ensureHost();
    if (ui.panel) return;
    var p = el('div', { class: 'p', role: 'dialog', 'aria-label': 'talklog トーク保存' });
    var hd = el('div', { class: 'hd' });
    var logo = el('span', { class: 'logo' }, 'talk');
    logo.appendChild(el('b', null, 'log'));
    hd.appendChild(logo);
    hd.appendChild(el('span', { class: 'ver' }, 'v' + VER));
    var x = el('button', { class: 'x', title: '閉じる', 'aria-label': '閉じる' }, '×');
    x.addEventListener('click', close);
    hd.appendChild(x);
    ui.count = el('div', { class: 'count' });
    ui.guide = el('div', { class: 'guide' });
    var row = el('div', { class: 'row' });
    ui.climb = el('button', { class: 'b' }, '自動で遡る');
    ui.climb.addEventListener('click', function () { state === 'climbing' ? stopRun() : climbUp(); });
    ui.exp = el('button', { class: 'b pri' }, '書き出す');
    ui.exp.addEventListener('click', exportNow);
    row.appendChild(ui.climb);
    row.appendChild(ui.exp);
    var opt = el('div', { class: 'opt' });
    [['narration', '地の文'], ['info', 'インフォボックス']].forEach(function (o) {
      var lb = el('label');
      var cb = el('input', { type: 'checkbox' });
      cb.checked = opts[o[0]];
      cb.addEventListener('change', function () { opts[o[0]] = cb.checked; updatePanel(); });
      lb.appendChild(cb);
      lb.appendChild(document.createTextNode(o[1] + 'を入れる'));
      opt.appendChild(lb);
    });
    p.appendChild(hd);
    p.appendChild(ui.count);
    p.appendChild(ui.guide);
    p.appendChild(row);
    p.appendChild(opt);
    p.appendChild(el('div', { class: 'note' }, '読み取った内容はこの端末の中だけで扱い、どこにも送信しません。'));
    ui.panel = p;
    ui.root.appendChild(p);
  }

  var msgOverride = null;
  function say(text, warn) { msgOverride = { text: text, warn: !!warn }; updatePanel(); }

  function setState(s, n) {
    state = s;
    msgOverride = null;
    if (s === 'done') {
      msgOverride = gapEvents
        ? { warn: true, text: n + '件を書き出しました。ただし途中で読み飛ばした可能性があります(' + gapEvents + '回)。抜けがないかファイルを確かめ、足りなければ、もう一度ゆっくり遡ってから書き出してください。' }
        : { text: n + '件を書き出しました。保存したファイルを開いて、いちばん古い発言と新しい発言が入っているか確かめてください。' };
    }
    updatePanel();
  }

  function updatePanel() {
    if (!ui || !ui.panel) return;
    var n = collect().length;
    ui.count.textContent = '集めた発言: ' + n + '件';
    var sm = el('small', null, '(いま画面にある塊: ' + visNow + ')');
    ui.count.appendChild(sm);
    var text, warn = false;
    if (msgOverride) { text = msgOverride.text; warn = msgOverride.warn; }
    else if (state === 'sweeping') text = 'いちばん新しい発言まで読み込んでいます…';
    else if (state === 'climbing') text = '上へ遡っています。止めたいときは「止める」を押してください。';
    else if (state === 'top') text = 'いちばん上まで来ました。「書き出す」を押してください。';
    else if (state === 'exporting') text = '書き出しています…';
    else if (!visNow) { text = 'トークが見つかりません。zeta のトーク画面で開いてください。'; warn = true; }
    else text = 'いちばん古い発言まで、ゆっくり上へスクロールしてください(「自動で遡る」でもOK)。終わったら「書き出す」。';
    ui.guide.textContent = text;
    ui.guide.className = 'guide' + (warn ? ' warn' : '');
    ui.climb.textContent = state === 'climbing' ? '止める' : '自動で遡る';
    ui.exp.disabled = state === 'exporting' || state === 'sweeping';
    ui.climb.disabled = state === 'exporting' || state === 'sweeping';
  }

  function startWatching() {
    if (!observer) {
      observer = new MutationObserver(function () { schedule(); });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
      document.addEventListener('scroll', schedule, true);
    }
    if (!timer) timer = setInterval(idleScan, 700);
  }
  // 自動で動かしている間は stepBy が重なりを確かめるので、ここでの読み取りは読み飛ばしとして数えない
  function idleScan() { scan(state === 'sweeping' || state === 'climbing' || state === 'exporting'); }
  var pendingScan = 0;
  function schedule() {
    if (pendingScan) return;
    pendingScan = setTimeout(function () { pendingScan = 0; idleScan(); }, 120);
  }
  function stopWatching() {
    if (observer) { observer.disconnect(); observer = null; document.removeEventListener('scroll', schedule, true); }
    if (timer) { clearInterval(timer); timer = null; }
  }

  async function open() {
    buildPanel();
    hideLauncher();
    ui.panel.style.display = '';
    startWatching();
    setState('sweeping');
    await sweepDown();
    if (state === 'sweeping') setState('ready');
  }
  function close() {
    runId++;
    stopWatching();
    // 集めた分は残す(もう一度開けば続きから)
    if (ui && ui.panel) ui.panel.style.display = 'none';
    showLauncherIfChat();
  }

  /* ------------------------------------------------------------ 起動ボタン(ユーザースクリプト用) */
  function showLauncherIfChat() {
    if (!window.__talklogLauncher) return;
    ensureHost();
    if (!ui.launch) {
      ui.launch = el('button', { class: 'launch', title: 'talklog でトークを保存' }, 'talklog');
      ui.launch.addEventListener('click', open);
      ui.root.appendChild(ui.launch);
    }
    var inChat = !!document.querySelector(SEL.block + ',' + SEL.bubble);
    var panelOpen = ui.panel && ui.panel.style.display !== 'none';
    ui.launch.style.display = inChat && !panelOpen ? '' : 'none';
  }
  function hideLauncher() { if (ui && ui.launch) ui.launch.style.display = 'none'; }

  window.__talklog = {
    ver: VER, open: open, close: close, scan: scan, collect: collect, buildHtml: buildHtml,
    // 動作確認用: 集めた塊の数、読み飛ばしたかもしれない回数、つながりの塊(鎖)の数(1なら途中の切れ目なし。キーのある画面だけ)
    stats: function () {
      var chains = {};
      chainOf.forEach(function (c) { chains[c] = true; });
      return { blocks: order.length, gaps: gapEvents, chains: Object.keys(chains).length, keys: order.slice() };
    }
  };

  if (window.__talklogAuto) {
    window.__talklogAuto = false;
    open();
  } else {
    // ユーザースクリプトから読み込まれたとき: トーク画面にだけ起動ボタンを出す(zetaは画面遷移でページを読み直さない)
    window.__talklogLauncher = true;
    showLauncherIfChat();
    setInterval(showLauncherIfChat, 2000);
  }
})();
