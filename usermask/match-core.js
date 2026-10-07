/* usermask: 登録した名前・アイコンを「見た目」で探すテンプレート照合 (正規化相互相関 NCC)
 * ページ本体と Web Worker の両方から読み込む。DOMには触らない。
 *
 * 流れ: 1) 画像とテンプレートを縮小した粗い解像度で全面を照合し候補を拾う
 *       2) 候補の周辺だけ元の解像度で照合し直して、しきい値を超えたものを採用
 *       3) 重なった検出は点数の高いほうだけ残す
 */
(function (root) {
  'use strict';

  /** 縮小(面積平均)。src: Float32Array(w*h) */
  function downsample(src, w, h, f) {
    if (f <= 1) return { data: src, w, h };
    const W = Math.floor(w / f), H = Math.floor(h / f);
    const out = new Float32Array(W * H);
    const inv = 1 / (f * f);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let yy = 0; yy < f; yy++) {
          let i = (y * f + yy) * w + x * f;
          for (let xx = 0; xx < f; xx++) s += src[i++];
        }
        out[y * W + x] = s * inv;
      }
    }
    return { data: out, w: W, h: H };
  }

  /** 双線形補間で拡大縮小 */
  function resize(src, w, h, W, H) {
    const out = new Float32Array(W * H);
    const sx = w / W, sy = h / H;
    for (let y = 0; y < H; y++) {
      const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), wy = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), wx = fx - x0;
        const a = src[y0 * w + x0], b = src[y0 * w + x1], c = src[y1 * w + x0], d = src[y1 * w + x1];
        out[y * W + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
      }
    }
    return out;
  }

  /** テンプレートを平均0にして、そのノルムを返す */
  function prepTemplate(t) {
    let m = 0;
    for (let i = 0; i < t.length; i++) m += t[i];
    m /= t.length;
    const z = new Float32Array(t.length);
    let n2 = 0;
    for (let i = 0; i < t.length; i++) { z[i] = t[i] - m; n2 += z[i] * z[i]; }
    return { z, norm: Math.sqrt(n2) };
  }

  /** 1か所のNCC (窓の平均・分散はその場で計算) */
  function nccAt(img, iw, tz, tnorm, tw, th, x, y) {
    let s = 0, s2 = 0, cross = 0, k = 0;
    for (let yy = 0; yy < th; yy++) {
      let i = (y + yy) * iw + x;
      for (let xx = 0; xx < tw; xx++, i++, k++) {
        const v = img[i];
        s += v; s2 += v * v; cross += tz[k] * v;
      }
    }
    const n = tw * th;
    const varI = s2 - (s * s) / n;
    if (varI <= 1e-6 || tnorm <= 1e-6) return 0;
    return cross / (tnorm * Math.sqrt(varI));
  }

  /** 全面のNCCマップ (積分画像で窓の分散を高速に求める) */
  function nccMap(img, iw, ih, tz, tnorm, tw, th) {
    const W = iw - tw + 1, H = ih - th + 1;
    if (W <= 0 || H <= 0) return null;
    const S = new Float64Array((iw + 1) * (ih + 1));
    const S2 = new Float64Array((iw + 1) * (ih + 1));
    for (let y = 0; y < ih; y++) {
      let rs = 0, rs2 = 0;
      for (let x = 0; x < iw; x++) {
        const v = img[y * iw + x];
        rs += v; rs2 += v * v;
        const o = (y + 1) * (iw + 1) + x + 1;
        S[o] = S[o - iw - 1] + rs;
        S2[o] = S2[o - iw - 1] + rs2;
      }
    }
    const n = tw * th;
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const a = y * (iw + 1) + x, b = a + tw, c = (y + th) * (iw + 1) + x, d = c + tw;
        const s = S[d] - S[b] - S[c] + S[a];
        const s2 = S2[d] - S2[b] - S2[c] + S2[a];
        const varI = s2 - (s * s) / n;
        if (varI <= 1e-3) { out[y * W + x] = 0; continue; }
        let cross = 0, k = 0;
        for (let yy = 0; yy < th; yy++) {
          let i = (y + yy) * iw + x;
          for (let xx = 0; xx < tw; xx++) cross += tz[k++] * img[i++];
        }
        out[y * W + x] = cross / (tnorm * Math.sqrt(varI));
      }
    }
    return { data: out, w: W, h: H };
  }

  /** NCCマップから、近所で一番高い点(極大)を拾う */
  function peaks(map, minScore, invert, radius, limit) {
    const { data, w, h } = map;
    const out = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const raw = data[y * w + x];
        const v = invert ? Math.abs(raw) : raw;
        if (v < minScore) continue;
        let isMax = true;
        for (let yy = Math.max(0, y - radius); yy <= Math.min(h - 1, y + radius) && isMax; yy++) {
          for (let xx = Math.max(0, x - radius); xx <= Math.min(w - 1, x + radius); xx++) {
            const r2 = data[yy * w + xx];
            const v2 = invert ? Math.abs(r2) : r2;
            if (v2 > v || (v2 === v && (yy < y || (yy === y && xx < x)))) { isMax = false; break; }
          }
        }
        if (isMax) out.push({ x, y, score: v });
      }
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  const iou = (a, b) => {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter || 1);
  };

  /**
   * 照合本体。
   * @param gray   Float32Array 画像の輝度 (0-255)
   * @param w,h    画像の大きさ
   * @param tpls   [{id, gray:Float32Array, w, h, srcW}]  srcW = 登録した画像の横幅
   * @param opt    {threshold, invert, scales:[0.9,1,1.1]}
   * @returns [{tplId, x, y, w, h, score, inverted}]
   */
  function findTemplates(gray, w, h, tpls, opt) {
    opt = opt || {};
    const th = opt.threshold || 0.72;
    const scales = opt.scales || [0.9, 1, 1.1];
    const found = [];
    for (const t of tpls) {
      // 同じアプリのスクショは、画面の横幅に比例して文字の大きさが変わる
      const base = t.srcW ? w / t.srcW : 1;
      const tried = new Set();
      for (const sMul of scales) {
        const s = base * sMul;
        const tw = Math.round(t.w * s), tH = Math.round(t.h * s);
        const key = tw + 'x' + tH;
        if (tried.has(key) || tw < 6 || tH < 6 || tw > w || tH > h) continue;
        tried.add(key);
        const T = (tw === t.w && tH === t.h) ? t.gray : resize(t.gray, t.w, t.h, tw, tH);
        const full = prepTemplate(T);
        if (full.norm < 1e-3) continue;

        // 粗い段階: 小さいほうの辺が8px前後になるまで縮める
        const f = Math.max(1, Math.min(8, Math.floor(Math.min(tw, tH) / 8)));
        const I = downsample(gray, w, h, f);
        const Tc = downsample(T, tw, tH, f);
        const coarse = prepTemplate(Tc.data);
        const map = nccMap(I.data, I.w, I.h, coarse.z, coarse.norm, Tc.w, Tc.h);
        if (!map) continue;
        const cands = peaks(map, Math.max(0.45, th - 0.25), !!opt.invert, 2, 60);

        // 細かい段階: 候補の周り ±f px を元の解像度で照合し直す
        for (const c of cands) {
          let best = { score: -2, x: 0, y: 0, raw: 0 };
          const cx = c.x * f, cy = c.y * f, r = f + 1;
          for (let y = Math.max(0, cy - r); y <= Math.min(h - tH, cy + r); y++) {
            for (let x = Math.max(0, cx - r); x <= Math.min(w - tw, cx + r); x++) {
              const raw = nccAt(gray, w, full.z, full.norm, tw, tH, x, y);
              const v = opt.invert ? Math.abs(raw) : raw;
              if (v > best.score) best = { score: v, x, y, raw };
            }
          }
          if (best.score >= th) {
            found.push({ tplId: t.id, x: best.x, y: best.y, w: tw, h: tH, score: best.score, inverted: best.raw < 0 });
          }
        }
      }
    }
    // 重なりは点数の高いほうを残す
    found.sort((a, b) => b.score - a.score);
    const keep = [];
    for (const m of found) if (!keep.some((k) => iou(k, m) > 0.3)) keep.push(m);
    return keep;
  }

  /** RGBA → 輝度 */
  function toGray(rgba, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    }
    return g;
  }

  const api = { findTemplates, toGray, resize, prepTemplate, nccAt };
  root.MaskMatch = api;

  // Worker として動いているとき
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = (e) => {
      const { id, gray, w, h, tpls, opt } = e.data;
      try {
        const res = findTemplates(gray, w, h, tpls, opt);
        root.postMessage({ id, ok: true, matches: res });
      } catch (err) {
        root.postMessage({ id, ok: false, error: String(err && err.message || err) });
      }
    };
  }
})(typeof self !== 'undefined' ? self : this);
