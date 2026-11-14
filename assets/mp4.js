/* userkit 共通: 短い動画(MP4・音なし)を作る(usercard・usermix が使う)。
   1 コマずつ描いた canvas を WebCodecs の H.264 で圧縮し、MP4 にまとめる。実時間で録らないので、重い端末でもコマ落ちしない。
   Mp4.encode({ width, height, fps, count, frame(i) → canvas, onProgress(0〜1) }) → Blob(video/mp4)。width・height は偶数にする */
(function () {
  'use strict';

  const supported = () => !!(window.VideoEncoder && window.VideoFrame);
  // 間を空ける(setTimeout と違い、別のタブを見ている間も 1 秒ごとに間引かれない)
  const yieldTask = () => new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => res(); ch.port2.postMessage(0); });

  /**
   * 使える H.264 の設定を探す。水準(level)は 1 コマの大きさから選ぶ(4.0 は 1920×1080 まで、5.0・5.1 はそれより大きいコマ)。
   * B フレームの無い Constrained Baseline を先に試す(MP4 に表示の順の表を書かずに済む)
   */
  async function pickCodec(w, h, fps, bitrate) {
    const mbs = Math.ceil(w / 16) * Math.ceil(h / 16);
    const levels = ['28', '32', '33'].filter((lv, i) => mbs <= [8192, 22080, 36864][i]);
    for (const lv of levels) {
      for (const pf of ['42e0', '4d00', '6400']) {
        const cfg = { codec: `avc1.${pf}${lv}`, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' } };
        try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { /* 次を試す */ }
      }
    }
    return null;
  }

  async function encode(o) {
    if (!supported()) throw new Error('このブラウザでは動画を作れません（WebCodecs が使えません）。新しい Chrome・Edge・Safari でお試しください');
    const { width: w, height: h, fps, count: N } = o;
    const cfg = await pickCodec(w, h, fps, o.bitrate || 8e6);
    if (!cfg) throw new Error('このブラウザでは H.264 の動画を作れません');
    const chunks = [];
    let desc = null, fail = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => {
        const dc = meta && meta.decoderConfig && meta.decoderConfig.description;
        if (dc) desc = ArrayBuffer.isView(dc) ? new Uint8Array(dc.buffer, dc.byteOffset, dc.byteLength).slice() : new Uint8Array(dc).slice();
        const buf = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buf);
        chunks.push({ buf, key: chunk.type === 'key', ts: chunk.timestamp });
      },
      error: (e) => { fail = e; }
    });
    enc.configure(cfg);
    try {
      for (let i = 0; i < N; i++) {
        if (fail) throw fail;
        const src = await o.frame(i);
        const vf = new VideoFrame(src, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(vf, { keyFrame: i % fps === 0 });
        vf.close();
        while (enc.encodeQueueSize > 2 && !fail) await yieldTask();
        if (o.onProgress) o.onProgress((i + 1) / N);
        await yieldTask();
      }
      await enc.flush();
    } finally {
      if (enc.state !== 'closed') enc.close();
    }
    if (fail) throw fail;
    if (!desc || chunks.length !== N) throw new Error('動画を作れませんでした');
    if (chunks.some((c, i) => i && c.ts <= chunks[i - 1].ts)) throw new Error('動画を作れませんでした（コマの順が入れ替わる圧縮でした）');
    return new Blob([mux(chunks, desc, w, h, fps)], { type: 'video/mp4' });
  }

  /** H.264 のコマ(AVC 形式)を 1 本の MP4 にまとめる。moov を前に置き、全部のコマを 1 つの塊に入れる(音なし) */
  function mux(chunks, avcC, w, ht, fps) {
    const N = chunks.length, TS = fps * 1000, durMs = Math.round(N * 1000 / fps);
    const u16 = (v) => [(v >> 8) & 255, v & 255];
    const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    const str = (s) => [...s].map((ch) => ch.charCodeAt(0));
    const zeros = (n) => new Array(n).fill(0);
    const cat = (parts) => {
      const list = parts.flat(Infinity).map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p === undefined ? [] : [p])));
      const outBuf = new Uint8Array(list.reduce((s, p) => s + p.length, 0));
      let off = 0;
      for (const p of list) { outBuf.set(p, off); off += p.length; }
      return outBuf;
    };
    const box = (type, ...parts) => { const body = cat(parts); return cat([u32(body.length + 8), str(type), body]); };
    const full = (type, ver, flags, ...parts) => box(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
    const matrix = [u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)];
    const keys = chunks.map((c, i) => (c.key ? i + 1 : 0)).filter(Boolean);
    const moov = (off) => box('moov',
      full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2)),
      box('trak',
        full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durMs), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(w * 65536), u32(ht * 65536)),
        box('mdia',
          full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(N * 1000), u16(0x55c4), u16(0)),
          full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), [0]),
          box('minf',
            full('vmhd', 0, 1, zeros(8)),
            box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
            box('stbl',
              full('stsd', 0, 0, u32(1), box('avc1', zeros(6), u16(1), zeros(16), u16(w), u16(ht), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), box('avcC', avcC))),
              full('stts', 0, 0, u32(1), u32(N), u32(1000)),
              full('stss', 0, 0, u32(keys.length), keys.map(u32)),
              full('stsc', 0, 0, u32(1), u32(1), u32(N), u32(1)),
              full('stsz', 0, 0, u32(0), u32(N), chunks.map((c) => u32(c.buf.length))),
              full('stco', 0, 0, u32(1), u32(off)))))));
    const ftyp = box('ftyp', str('isom'), u32(0x200), str('isomiso2avc1mp41'));
    const mdatLen = chunks.reduce((s, c) => s + c.buf.length, 0) + 8;
    const head = moov(ftyp.length + moov(0).length + 8);  // 塊の位置は ftyp・moov・mdat の見出しの後
    return cat([ftyp, head, u32(mdatLen), str('mdat'), chunks.map((c) => c.buf)]);
  }

  window.Mp4 = { supported, encode };
})();
