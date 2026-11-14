/* userkit 共通: 短いアニメーション GIF を作る(usermix が使う。Mp4.encode と同じ呼び方)。
   Gif.encode({ width, height, fps, count, frame(i) → canvas(2d), onProgress(0〜1), sample }) → Blob(image/gif)。
   色は 256 色。最初と真ん中のコマ(sample にコマの番号の配列を渡せばそのコマ)から色を選び(メディアンカット)、規則的な網(ベイヤー)でぼかす。
   網は場所で決まるので、動かない所は毎コマ同じ色の番号になる。前のコマと違う四角だけを書き足し、
   四角の中でも前のコマと同じ画素は透明(番号 255)にして軽くする(動く所が上下に離れていても大きくならない) */
(function () {
  'use strict';

  const yieldTask = () => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); ch.port2.postMessage(0); });
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.47) * 18);

  /** 書き足していくバイト列 */
  function bytes() {
    let buf = new Uint8Array(1 << 20), n = 0;
    const room = (k) => { if (n + k > buf.length) { const b = new Uint8Array(Math.max(buf.length * 2, n + k)); b.set(buf.subarray(0, n)); buf = b; } };
    return {
      byte(v) { room(1); buf[n++] = v; },
      u16(v) { room(2); buf[n++] = v & 255; buf[n++] = (v >> 8) & 255; },
      str(s) { for (const c of s) this.byte(c.charCodeAt(0)); },
      put(a) { room(a.length); buf.set(a, n); n += a.length; },
      out() { return buf.slice(0, n); }
    };
  }

  /** メディアンカット。px は RGBA の並び、step ごとに拾う。返り値は [r,g,b] の配列(256 色まで) */
  function quantize(list, max) {
    let total = 0;
    list.forEach((px) => { total += px.length / 4; });
    const step = Math.max(1, Math.floor(total / 120000));
    const s = [];
    list.forEach((px) => { for (let i = 0; i < px.length; i += 4 * step) s.push(px[i], px[i + 1], px[i + 2]); });
    const S = Uint8Array.from(s), n = S.length / 3;
    const boxes = [{ ids: Uint32Array.from({ length: n }, (_, i) => i) }];
    const stat = (b) => {
      const lo = [255, 255, 255], hi = [0, 0, 0];
      for (const id of b.ids) for (let c = 0; c < 3; c++) { const v = S[id * 3 + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
      const r = hi.map((v, c) => v - lo[c]), ax = r.indexOf(Math.max(...r));
      b.ax = ax; b.range = r[ax]; b.score = r[ax] * Math.sqrt(b.ids.length);
    };
    stat(boxes[0]);
    while (boxes.length < max) {
      let bi = -1;
      boxes.forEach((b, i) => { if (b.ids.length > 1 && b.range > 0 && (bi < 0 || b.score > boxes[bi].score)) bi = i; });
      if (bi < 0) break;
      const b = boxes[bi], ax = b.ax, ids = Array.from(b.ids).sort((x, y) => S[x * 3 + ax] - S[y * 3 + ax]), mid = ids.length >> 1;
      const a = { ids: Uint32Array.from(ids.slice(0, mid)) }, c = { ids: Uint32Array.from(ids.slice(mid)) };
      stat(a); stat(c);
      boxes.splice(bi, 1, a, c);
    }
    return boxes.map((b) => {
      const m = [0, 0, 0];
      for (const id of b.ids) for (let c = 0; c < 3; c++) m[c] += S[id * 3 + c];
      return m.map((v) => Math.round(v / b.ids.length));
    });
  }

  /** 色の番号を引く(5 ビットずつに丸めた色で、近い色を覚えておく) */
  function mapper(pal) {
    const memo = new Int16Array(32768).fill(-1);
    return (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let k = memo[key];
      if (k >= 0) return k;
      const R = (r & 248) | 4, G = (g & 248) | 4, B = (b & 248) | 4;
      let best = 1e9;
      for (let i = 0; i < pal.length; i++) {
        const p = pal[i], d = (p[0] - R) ** 2 * 3 + (p[1] - G) ** 2 * 4 + (p[2] - B) ** 2 * 2;
        if (d < best) { best = d; k = i; }
      }
      memo[key] = k;
      return k;
    };
  }

  /** GIF の LZW(コードは下位ビットから詰める。表が 4096 で満ちたら初めから) */
  function lzw(out, idx, minSize) {
    const clear = 1 << minSize, eoi = clear + 1;
    let size = minSize + 1, next = eoi + 1, table = new Map();
    const blk = new Uint8Array(255);
    let bl = 0, cur = 0, shift = 0;
    const flushBlock = () => { if (bl) { out.byte(bl); out.put(blk.subarray(0, bl)); bl = 0; } };
    const emit = (code) => {
      cur |= code << shift; shift += size;
      while (shift >= 8) { blk[bl++] = cur & 255; cur >>>= 8; shift -= 8; if (bl === 255) flushBlock(); }
    };
    out.byte(minSize);
    emit(clear);
    let prefix = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = (prefix << 8) | k, code = table.get(key);
      if (code !== undefined) { prefix = code; continue; }
      emit(prefix);
      if (next === 4096) { emit(clear); size = minSize + 1; next = eoi + 1; table = new Map(); }
      else { if (next >= (1 << size)) size++; table.set(key, next++); }
      prefix = k;
    }
    emit(prefix);
    emit(eoi);
    if (shift > 0) { blk[bl++] = cur & 255; if (bl === 255) flushBlock(); }
    flushBlock();
    out.byte(0);
  }

  async function encode(o) {
    const { width: W, height: H, fps, count: N } = o, delay = Math.max(2, Math.round(100 / fps));
    const read = async (i) => { const c = await o.frame(i); return c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data; };
    // 色は最初と真ん中のコマから選ぶ(動く物の色もそろう)。写真が替わる動画(usermovie)は、それぞれの写真のコマを渡してもらう
    const TP = 255;   // 透明に使う番号(色は 255 色まで)
    const picks = Array.isArray(o.sample) && o.sample.length ? o.sample.filter((i) => i >= 0 && i < N) : N > 2 ? [Math.floor(N / 2), 0] : [0];
    const samples = [];
    for (const i of picks.length ? picks : [0]) samples.push(await read(i));
    const pal = quantize(samples, TP);
    const near = mapper(pal.slice());   // 透明の番号は選ばない
    while (pal.length < 256) pal.push([0, 0, 0]);
    const out = bytes();
    out.str('GIF89a'); out.u16(W); out.u16(H); out.byte(0xf7); out.byte(0); out.byte(0);
    pal.forEach((p) => { out.byte(p[0]); out.byte(p[1]); out.byte(p[2]); });
    out.byte(0x21); out.byte(0xff); out.byte(11); out.str('NETSCAPE2.0'); out.byte(3); out.byte(1); out.u16(0); out.byte(0);  // くり返し再生
    let prev = null;
    for (let i = 0; i < N; i++) {
      const px = await read(i), cur = new Uint8Array(W * H);
      for (let y = 0, p = 0; y < H; y++) {
        const row = (y & 3) << 2;
        for (let x = 0; x < W; x++, p++) {
          const d = BAYER[row | (x & 3)], q = p * 4;
          const r = px[q] + d, g = px[q + 1] + d, b = px[q + 2] + d;
          cur[p] = near(r < 0 ? 0 : r > 255 ? 255 : r, g < 0 ? 0 : g > 255 ? 255 : g, b < 0 ? 0 : b > 255 ? 255 : b);
        }
      }
      // 前のコマと違う四角(同じなら 1 画素だけ書く)
      let x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1;
      if (prev) {
        x0 = W; y0 = H; x1 = -1; y1 = -1;
        for (let y = 0, p = 0; y < H; y++) for (let x = 0; x < W; x++, p++) {
          if (cur[p] !== prev[p]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < 0) { x0 = x1 = 0; y0 = y1 = 0; }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, sub = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const o = (y0 + y) * W + x0;
        if (!prev) { sub.set(cur.subarray(o, o + w), y * w); continue; }
        for (let x = 0; x < w; x++) sub[y * w + x] = cur[o + x] === prev[o + x] ? TP : cur[o + x];
      }
      // 前のコマを残す(処分 1)。2 コマ目からは透明の番号を使う
      out.byte(0x21); out.byte(0xf9); out.byte(4); out.byte((1 << 2) | (prev ? 1 : 0)); out.u16(delay); out.byte(prev ? TP : 0); out.byte(0);
      out.byte(0x2c); out.u16(x0); out.u16(y0); out.u16(w); out.u16(h); out.byte(0);
      lzw(out, sub, 8);
      prev = cur;
      if (o.onProgress) o.onProgress((i + 1) / N);
      await yieldTask();
    }
    out.byte(0x3b);
    return new Blob([out.out()], { type: 'image/gif' });
  }

  window.Gif = { encode };
})();
