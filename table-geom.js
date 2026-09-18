// 桌子共用幾何：桌板外形、桌腳配置。index.html（2D 圖紙／料表）與 table-3d.js（3D）共用。
// 座標：x 沿桌長（右為正）、z 沿桌深（正面／靠近使用者為正），單位 mm，原點在桌板外框中心。
(function (root) {
  const SHAPES = {
    rect: { name: '矩形', en: 'rectangular' },
    ellipse: { name: '圓／橢圓', en: 'round / oval' },
    stadium: { name: '跑道形', en: 'racetrack (stadium-shaped)' },
    lshape: { name: 'L 型', en: 'L-shaped corner' },
    freeform: { name: '手繪外形', en: 'organic free-form' },
  };
  const CORNER_LEGS = ['square', 'round', 'taper'];
  const FRAME_LEGS = ['metalX', 'sled', 'trestle', 'aframe'];
  const METAL_LEGS = ['metalX', 'sled'];

  const validOutline = (o) => Array.isArray(o) && o.length >= 8 &&
    o.every((q) => Array.isArray(q) && isFinite(q[0]) && isFinite(q[1]) && Math.abs(q[0]) <= 0.6 && Math.abs(q[1]) <= 0.6);

  function shapeOf(p) {
    const s = p.topShape;
    if (!SHAPES[s]) return 'rect';
    if (s === 'freeform' && !validOutline(p.outline)) return 'rect';
    return s;
  }

  // L 型桌只支援四角腳（兩端桌架與中央柱腳撐不住轉角）
  function legStyleOf(p) {
    const s = p.legStyle || 'square';
    if (shapeOf(p) === 'lshape' && CORNER_LEGS.indexOf(s) < 0) return 'square';
    return s;
  }

  const barW = (p) => Math.min(p.width, p.length * 0.6);
  const depthOf = (p) => (shapeOf(p) === 'lshape' ? Math.max(p.returnD || 0, barW(p) + 300) : p.width);

  function arc(pts, cx, cz, rx, rz, a0, a1, n) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
    }
  }

  function outline(p) {
    const L = p.length, W = p.width, PI = Math.PI, pts = [];
    switch (shapeOf(p)) {
      case 'ellipse':
        arc(pts, 0, 0, L / 2, W / 2, 0, PI * 2 * 71 / 72, 71);
        return pts;
      case 'stadium':
        if (L >= W) {
          const r = W / 2, c = L / 2 - r;
          arc(pts, c, 0, r, r, -PI / 2, PI / 2, 18);
          arc(pts, -c, 0, r, r, PI / 2, PI * 1.5, 18);
        } else {
          const r = L / 2, c = W / 2 - r;
          arc(pts, 0, c, r, r, 0, PI, 18);
          arc(pts, 0, -c, r, r, PI, PI * 2, 18);
        }
        return pts;
      case 'lshape': {
        const D = depthOf(p), Wg = barW(p);
        return [[-L / 2, -D / 2], [L / 2, -D / 2], [L / 2, D / 2], [L / 2 - Wg, D / 2], [L / 2 - Wg, -D / 2 + Wg], [-L / 2, -D / 2 + Wg]];
      }
      case 'freeform':
        return p.outline.map((q) => [q[0] * L, q[1] * W]);
      default: {
        const r = Math.max(0, Math.min(p.cornerRadius || 0, L / 2 - 1, W / 2 - 1));
        if (r < 1) return [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]];
        arc(pts, L / 2 - r, -W / 2 + r, r, r, -PI / 2, 0, 6);
        arc(pts, L / 2 - r, W / 2 - r, r, r, 0, PI / 2, 6);
        arc(pts, -L / 2 + r, W / 2 - r, r, r, PI / 2, PI, 6);
        arc(pts, -L / 2 + r, -W / 2 + r, r, r, PI, PI * 1.5, 6);
        return pts;
      }
    }
  }

  function area(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      a += x1 * z2 - x2 * z1;
    }
    return Math.abs(a) / 2;
  }

  function perimeter(poly) {
    let t = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      t += Math.hypot(x2 - x1, z2 - z1);
    }
    return t;
  }

  function inside(poly, x, z) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  }

  // 垂直線 x 與外形交點的 z 範圍
  function zRange(poly, x) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      if ((x1 <= x && x2 >= x) || (x2 <= x && x1 >= x)) {
        const z = x2 === x1 ? Math.max(z1, z2) : z1 + (z2 - z1) * (x - x1) / (x2 - x1);
        lo = Math.min(lo, z, x2 === x1 ? Math.min(z1, z2) : z);
        hi = Math.max(hi, z);
      }
    }
    return lo <= hi ? [lo, hi] : [0, 0];
  }

  // 四支腳（或兩端桌架）中心點 (±a, ±b)，確保腳落在桌板外形內並保留內縮
  function inscribed(p, poly) {
    const s = p.legSize, ins = p.legInset, L = p.length, W = p.width, K = Math.SQRT1_2;
    let a, b;
    switch (shapeOf(p)) {
      case 'ellipse':
        a = (L / 2 - ins) * K - s / 2; b = (W / 2 - ins) * K - s / 2;
        break;
      case 'stadium': {
        const r = Math.min(L, W) / 2 - ins, c = Math.abs(L - W) / 2;
        if (L >= W) { a = c + r * K - s / 2; b = r * K - s / 2; }
        else { a = r * K - s / 2; b = c + r * K - s / 2; }
        break;
      }
      case 'freeform':
        a = 0.3 * (L / 2 - ins) - s / 2; b = 0.3 * (W / 2 - ins) - s / 2;
        for (let t = 1; t >= 0.3; t -= 0.02) {
          const aa = t * (L / 2 - ins) - s / 2, bb = t * (W / 2 - ins) - s / 2;
          const ox = aa + s / 2 + ins * 0.6, oz = bb + s / 2 + ins * 0.6;
          if ([[ox, oz], [-ox, oz], [ox, -oz], [-ox, -oz]].every(([x, z]) => inside(poly, x, z))) { a = aa; b = bb; break; }
        }
        break;
      default:
        a = L / 2 - ins - s / 2; b = W / 2 - ins - s / 2;
    }
    const min = s / 2 + 40;
    return { a: Math.max(a, min), b: Math.max(b, min) };
  }

  /*
   * kind: corner（四角／六角腳，腳間可加橫撐）、frame（兩端桌架）、pedestal（中央柱腳）
   * front: 正面抽屜可用的淨跨距 {x1, x2}（已扣除桌腳）與所在 z
   */
  function layout(p) {
    const shape = shapeOf(p), style = legStyleOf(p), poly = outline(p);
    const s = p.legSize, L = p.length, W = p.width, D = depthOf(p), legH = p.height - p.topT;
    const out = { shape, style, poly, L, D, legH, s, legs: [], segs: [], pedestals: [] };

    if (style === 'pedestal') {
      const n = L >= 1500 && L >= W * 1.4 ? 2 : 1;
      const colD = Math.max(90, s * 1.6);
      const span = n === 2 ? Math.min(W, L / 2) : Math.min(L, W);
      const baseD = Math.max(colD * 2.2, span * 0.62);
      const x1 = -L * 0.3, x2 = L * 0.3;
      const zEdge = Math.min(zRange(poly, x1)[1], zRange(poly, x2)[1], zRange(poly, 0)[1]);
      return Object.assign(out, {
        kind: 'pedestal', pedestals: n === 2 ? [-L / 4, L / 4] : [0], colD, baseD,
        plateD: Math.min(colD * 3, baseD), a: L / 4, b: W / 4,
        front: { x1, x2, z: zEdge - Math.max(60, p.legInset) },
      });
    }

    if (shape === 'lshape') {
      const Wg = barW(p), e = p.legInset + s / 2;
      const legs = [[-L / 2 + e, -D / 2 + e], [L / 2 - e, -D / 2 + e], [L / 2 - e, D / 2 - e], [L / 2 - Wg + e, D / 2 - e], [L / 2 - Wg + e, -D / 2 + Wg - e], [-L / 2 + e, -D / 2 + Wg - e]];
      return Object.assign(out, {
        kind: 'corner', legs, segs: legs.map((q, i) => [q, legs[(i + 1) % legs.length]]),
        a: L / 2 - e, b: Wg / 2 - e,
        front: { x1: legs[5][0] + s / 2, x2: legs[4][0] - s / 2, z: legs[5][1] },
      });
    }

    const { a, b } = inscribed(p, poly);
    if (FRAME_LEGS.indexOf(style) >= 0) {
      return Object.assign(out, { kind: 'frame', a, b, front: { x1: -a + s / 2, x2: a - s / 2, z: b + s / 2 } });
    }
    const legs = [[-a, -b], [a, -b], [a, b], [-a, b]];
    return Object.assign(out, {
      kind: 'corner', a, b, legs, segs: legs.map((q, i) => [q, legs[(i + 1) % legs.length]]),
      front: { x1: -a + s / 2, x2: a - s / 2, z: b },
    });
  }

  /*
   * 新式桌腳（ㄇ字金屬腳、工作台腳、A 字腳、中央柱腳）的構件清單，3D、2D 圖紙與料表共用。
   * 每個構件：{ name, mat: 'wood'|'metal', shape: 'box'|'cyl', c: [x, y, z] 中心, size: [sx, sy, sz], rx }
   * y 為離地高度；cyl 的 size = [直徑, 高, 直徑]；rx 為繞 x 軸的傾角（A 字腳斜腳用）。
   * 四角腳與金屬 X 腳沿用原本的畫法，回傳 null。
   */
  const MEMBER_LEGS = ['sled', 'trestle', 'aframe', 'pedestal'];

  function members(p) {
    const lay = layout(p), st = lay.style;
    if (MEMBER_LEGS.indexOf(st) < 0) return null;
    const s = p.legSize, legH = lay.legH, out = [];
    const add = (name, mat, shape, c, size, rx) => out.push({ name, mat, shape, c, size, rx: rx || 0 });
    const r = (v) => Math.round(v);

    if (st === 'pedestal') {
      const baseT = 25, plateT = 12, colH = legH - baseT - plateT;
      lay.pedestals.forEach((x) => {
        // 底座與頂板不可超出桌板外形（離邊至少 10）
        const room = 2 * (edgeDist(lay.poly, x, 0) - 10);
        const baseD = r(Math.max(lay.colD * 1.4, Math.min(lay.baseD, room)));
        const plateD = r(Math.max(lay.colD, Math.min(lay.plateD, room)));
        add('柱腳底座', 'metal', 'cyl', [x, baseT / 2, 0], [baseD, baseT, baseD]);
        add('柱身', 'metal', 'cyl', [x, baseT + colH / 2, 0], [r(lay.colD), colH, r(lay.colD)]);
        add('頂板', 'metal', 'cyl', [x, legH - plateT / 2, 0], [plateD, plateT, plateD]);
      });
      return out;
    }

    const a = lay.a, b = lay.b, zo = b + s / 2, sides = [-1, 1];
    if (st === 'sled') {
      // ㄇ字：上框＋兩支立柱，兩端各一組，上方以連結橫桿相連
      const t = Math.max(40, Math.min(60, r(s * 0.6)));
      sides.forEach((sx) => {
        const x = sx * a;
        add('ㄇ字腳上框', 'metal', 'box', [x, legH - t / 2, 0], [t, t, 2 * zo]);
        sides.forEach((sz) => add('ㄇ字腳立柱', 'metal', 'box', [x, (legH - t) / 2, sz * (zo - t / 2)], [t, legH - t, t]));
      });
      add('連結橫桿', 'metal', 'box', [0, legH - t / 2, 0], [2 * a - t, t, t]);
      return out;
    }

    const ch = Math.max(50, r(s * 0.7));
    const railH = Math.max(80, s);
    if (st === 'trestle') {
      // 工作台腳：腳座橫木＋兩支立柱＋上橫木，中段橫檔與長向拉桿相接
      const fh = Math.max(60, r(s * 0.9));
      const zf = zo + (lay.shape === 'rect' ? Math.max(0, Math.min(40, p.legInset - 10)) : 0);
      const postH = legH - fh - ch, midY = legH * 0.35;
      sides.forEach((sx) => {
        const x = sx * a;
        add('腳座橫木', 'wood', 'box', [x, fh / 2, 0], [s, fh, 2 * zf]);
        add('上橫木', 'wood', 'box', [x, legH - ch / 2, 0], [s, ch, 2 * zf]);
        sides.forEach((sz) => add('立柱', 'wood', 'box', [x, fh + postH / 2, sz * b], [s, postH, s]));
        add('中橫檔', 'wood', 'box', [x, midY, 0], [s, railH, 2 * b - s]);
      });
      add('長向拉桿', 'wood', 'box', [0, midY, 0], [2 * a - s, railH, 45]);
      return out;
    }

    // A 字腳：兩支斜腳上窄下寬，中段橫檔，上橫木鎖桌板
    const bt = Math.max(s, b * 0.3), dz = b - bt, dy = legH - ch;
    const th = Math.atan2(dz, dy), len = Math.hypot(dz, dy) - s * Math.sin(th);
    const cy = legH * 0.4, zc = b - dz * (cy / dy) + s / 2;
    sides.forEach((sx) => {
      const x = sx * a;
      sides.forEach((sz) => add('斜腳', 'wood', 'box', [x, dy / 2, sz * (b + bt) / 2], [s, len, s], -sz * th));
      add('橫檔', 'wood', 'box', [x, cy, 0], [r(s * 0.6), 60, 2 * zc]);
      add('上橫木', 'wood', 'box', [x, legH - ch / 2, 0], [s, ch, 2 * (bt + s / 2 + 30)]);
    });
    add('長向拉桿', 'wood', 'box', [0, cy, 0], [2 * a - r(s * 0.6), railH, 45]);
    return out;
  }

  // 點到外形邊界的最短距離
  function edgeDist(poly, x, z) {
    let d = Infinity;
    poly.forEach(([x1, z1], i) => {
      const [x2, z2] = poly[(i + 1) % poly.length], vx = x2 - x1, vz = z2 - z1;
      const t = Math.max(0, Math.min(1, ((x - x1) * vx + (z - z1) * vz) / ((vx * vx + vz * vz) || 1)));
      d = Math.min(d, Math.hypot(x - x1 - vx * t, z - z1 - vz * t));
    });
    return d;
  }

  // 構件的 8 個角點（cyl 以外接方柱近似），供 2D 投影與碰撞檢查使用
  function memberCorners(m) {
    const [hx, hy, hz] = m.size.map((v) => v / 2), c = Math.cos(m.rx), sn = Math.sin(m.rx), pts = [];
    [-hx, hx].forEach((x) => [-hy, hy].forEach((y) => [-hz, hz].forEach((z) => {
      pts.push([m.c[0] + x, m.c[1] + y * c - z * sn, m.c[2] + y * sn + z * c]);
    })));
    return pts;
  }

  // 2D 凸包（投影後的構件輪廓）
  function hull(pts) {
    const P = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    if (P.length < 3) return P;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    P.forEach((q) => { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    P.slice().reverse().forEach((q) => { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  /*
   * 手繪俯視輪廓 → 正規化外形（外框 = [-0.5, 0.5]²）
   * fill：面積 / 外框面積（矩形 ≈ 1、橢圓 ≈ 0.785）；ellErr：與內切橢圓的平均偏差
   */
  function traceOutline(raw) {
    if (!raw || raw.length < 6) return null;
    const loop = raw.concat([raw[0]]), cum = [0];
    for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
    const total = cum[cum.length - 1];
    if (!(total > 0)) return null;
    const N = 72, pts = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const t = total * i / N;
      while (j < cum.length - 2 && cum[j + 1] < t) j++;
      const f = (t - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      pts.push([loop[j][0] + (loop[j + 1][0] - loop[j][0]) * f, loop[j][1] + (loop[j + 1][1] - loop[j][1]) * f]);
    }
    let sm = pts;
    for (let k = 0; k < 2; k++) {
      sm = sm.map((q, i) => {
        const a = sm[(i + N - 1) % N], c = sm[(i + 1) % N];
        return [(a[0] + 2 * q[0] + c[0]) / 4, (a[1] + 2 * q[1] + c[1]) / 4];
      });
    }
    const xs = sm.map((q) => q[0]), zs = sm.map((q) => q[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const w = maxX - minX, h = maxZ - minZ;
    if (!(w > 0 && h > 0)) return null;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const norm = sm.map(([x, z]) => [+((x - cx) / w).toFixed(4), +((z - cz) / h).toFixed(4)]);
    const ellErr = norm.reduce((t, [u, v]) => t + Math.abs(Math.hypot(2 * u, 2 * v) - 1), 0) / N;
    const gap = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) / Math.max(w, h);
    return { outline: norm, w, h, fill: area(norm), ellErr, gap };
  }

  /*
   * 手繪俯視外形 → 判斷是矩形、圓／橢圓、跑道形還是自由外形。
   * 直接用原始筆畫點（traceOutline 的平滑會把直角磨圓）比對各候選外形：
   * 圓角矩形（圓角 0～0.5 倍短邊，0.5 即跑道形）與橢圓，取平均偏差最小者；
   * 偏差超過短邊的 4.2% 就當自由外形。門檻以模擬手繪（搖晃＋抖動＋未閉合）調出。
   * 回傳 { shape, r: 圓角／短邊, err, w, h }，w、h 為筆畫外框（與輸入同單位）。
   */
  const FIT_MAX_ERR = 0.042;
  function classifyOutline(raw) {
    if (!raw || raw.length < 6) return null;
    const xs = raw.map((q) => q[0]), zs = raw.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const w = x1 - x0, h = z1 - z0, s = Math.min(w, h);
    if (!(s > 0)) return null;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // 點太多時抽樣，控制計算量
    const step = Math.max(1, Math.floor(raw.length / 240));
    const pts = raw.filter((q, i) => i % step === 0).map(([x, z]) => [x - cx, z - cz]);
    const err = (poly) => pts.reduce((t, [x, z]) => t + edgeDist(poly, x, z), 0) / pts.length / s;
    const eEll = err(outline({ topShape: 'ellipse', length: w, width: h }));
    const eRect = [];
    for (let k = 0; k <= 10; k++) eRect.push(err(outline({ topShape: 'rect', length: w, width: h, cornerRadius: k / 20 * s })));
    const eMin = Math.min(...eRect), best = Math.min(eEll, eMin);
    // 手抖會讓誤差曲線在最低點附近變平，最低點又偏向大圓角；取「誤差在最低值 1.2 倍內的最小圓角」較準
    const r = eRect.findIndex((e) => e <= eMin * 1.2) / 20;
    let shape;
    if (best > FIT_MAX_ERR) shape = 'freeform';
    else if (eEll <= eMin) shape = 'ellipse';
    // 圓角達 0.45 倍短邊：長條的是跑道形，接近正方形的就是圓
    else if (r >= 0.45) shape = Math.max(w, h) / s >= 1.2 ? 'stadium' : 'ellipse';
    else shape = 'rect';
    return { shape, r: shape === 'rect' ? r : 0, err: best, w, h };
  }

  root.TableGeom = {
    SHAPES, CORNER_LEGS, FRAME_LEGS, METAL_LEGS, MEMBER_LEGS,
    shapeOf, legStyleOf, barW, depthOf, outline, layout, members, memberCorners, hull,
    area, perimeter, inside, zRange, validOutline, traceOutline, classifyOutline,
  };
})(typeof window !== 'undefined' ? window : globalThis);
