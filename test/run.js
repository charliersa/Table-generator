// 自動測試：矩形桌不得回歸，5 種外形 × 8 種桌腳都要能產生圖紙、料表、排版與 DXF。
// 執行：node test/run.js
const { build } = require('./harness');

const { app, MATS, LEGS, PRESETS, SHEET_L, SHEET_W, TableGeom } = build();

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + name + (extra ? '\n      ' + extra : ''));
};
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);

/* ── 改版前的公式，用來確認矩形桌的結果沒有變 ── */
function legacy(p) {
  const legH = p.height - p.topT;
  const innerL = Math.max(120, p.length - 2 * p.legInset - 2 * p.legSize);
  const innerW = Math.max(100, p.width - 2 * p.legInset - 2 * p.legSize);
  const isX = p.legStyle === 'metalX';
  const drawerH = Math.min((p.apronH || 90) * 0.82, 140);
  const drawerDepth = Math.round(p.width * 0.62 / 10) * 10;
  const parts = [];
  const add = (name, qty, L, W, T, mat) => parts.push({ name, qty, L: Math.round(L), W: Math.round(W), T, mat });
  add('桌板', 1, p.length, p.width, p.topT, MATS[p.material].name);
  if (!isX) add('桌腳', 4, p.legSize, p.legSize, legH, '實木方料');
  if (p.apron && !isX) {
    add('長側橫撐', 2, innerL, p.apronH, 18, MATS[p.material].name);
    add('短側橫撐', 2, innerW, p.apronH, 18, MATS[p.material].name);
  }
  if (p.stretcher && !isX) {
    add('長向加強樑', 2, innerL, 45, 45, '實木方料');
    add('中央連桿', 1, innerW, 45, 45, '實木方料');
  }
  if (p.drawers > 0) {
    const each = innerL / p.drawers;
    add('抽屜前板', p.drawers, each - 6, drawerH, 18, MATS[p.material].name);
    add('抽屜側板', p.drawers * 2, drawerDepth, drawerH - 12, 15, '樺木夾板');
    add('抽屜後板', p.drawers, each - 36, drawerH - 12, 15, '樺木夾板');
    add('抽屜底板', p.drawers, each - 40, drawerDepth - 30, 9, '樺木夾板');
  }
  if (p.edgeBand) add('封邊條', 1, 2 * (p.length + p.width), p.topT, 3, 'ABS 封邊');

  const hw = [];
  if (isX) hw.push({ name: p.height > 900 ? '金屬 X 桌架（高腳）' : '金屬 X 桌架', unit: 3200, n: 1 });
  else hw.push({ name: '桌腳固定五金 (M8 埋入)', unit: 120, n: 4 });
  hw.push({ name: '可調腳墊 Ø25', unit: 45, n: 4 });
  hw.push({ name: '結構螺絲 M6×70', unit: 6, n: isX ? 16 : 24 });
  hw.push({ name: '木螺絲 3.5×35', unit: 2.5, n: 40 });
  if (p.drawers > 0) {
    hw.push({ name: `隱藏式滑軌 ${drawerDepth}mm`, unit: 340, n: p.drawers });
    hw.push({ name: '金屬圓柄把手', unit: 180, n: p.drawers });
  }
  if (p.stretcher) hw.push({ name: '加強角鐵', unit: 55, n: 4 });

  let area = 0;
  parts.forEach((x) => { if (x.name !== '封邊條') area += (x.L / 1000) * (x.W / 1000) * x.qty; });
  const m = MATS[p.material];
  const board = area * m.price * (1 + (p.topT - 18) / 180);
  const finish = m.finish * area * 0.9;
  const hwCost = hw.reduce((s, x) => s + x.unit * x.n, 0);
  let labor = 1800 + area * 950 + p.drawers * 850;
  if (p.cornerRadius > 10) labor += 600;
  if (p.edgeBand) labor += 2 * (p.length + p.width) / 1000 * 180;
  if (p.stretcher) labor += 900;
  if (p.legStyle === 'taper') labor += 700;
  const waste = (board + finish) * 0.05;
  const sub = board + finish + hwCost + labor + waste;
  return { parts, hw, area, total: sub * 1.05, innerL, innerW, drawerDepth, legH };
}

/* ── SVG 基本健全檢查 ── */
function svgOk(svg) {
  if (typeof svg !== 'string' || svg.length < 500) return 'SVG 過短或不是字串';
  if (!svg.startsWith('<svg') || !svg.trimEnd().endsWith('</svg>')) return '缺少 svg 外框';
  if (/NaN|undefined|Infinity/.test(svg)) return 'SVG 內含 NaN／undefined／Infinity';
  const open = (svg.match(/<(g|text|path|rect|line|circle|marker|pattern|defs)\b/g) || []).length;
  const self = (svg.match(/\/>/g) || []).length;
  const close = (svg.match(/<\/(g|text|path|rect|line|circle|marker|pattern|defs)>/g) || []).length;
  if (open !== self + close) return `標籤未閉合：open=${open} self=${self} close=${close}`;
  return '';
}

/* ── 1. 矩形桌回歸測試 ── */
console.log('1. 矩形桌回歸（8 組內建範本）');
Object.keys(PRESETS).forEach((id) => {
  const p = { ...PRESETS[id] };
  const L = legacy(p), g = app.geo(p), parts = app.parts(p), c = app.costing(p), hw = app.hardware(p);
  const tag = `${id}(${PRESETS[id].name})`;

  ok(`${tag} geo.legH`, g.legH === L.legH);
  ok(`${tag} geo.innerL`, near(g.innerL, L.innerL), `${g.innerL} vs ${L.innerL}`);
  ok(`${tag} geo.innerW`, near(g.innerW, L.innerW), `${g.innerW} vs ${L.innerW}`);
  ok(`${tag} geo.D = width`, g.D === p.width);
  ok(`${tag} geo.drawerDepth`, g.drawerDepth === L.drawerDepth);
  ok(`${tag} geo.legN`, g.legN === 4);
  ok(`${tag} 料表件數`, parts.length === L.parts.length, `${parts.length} vs ${L.parts.length}`);
  L.parts.forEach((e, i) => {
    const a = parts[i] || {};
    ok(`${tag} 料表#${i} ${e.name}`,
      a.name === e.name && a.qty === e.qty && near(a.L, e.L, 1) && near(a.W, e.W, 1) && a.T === e.T && a.mat === e.mat,
      JSON.stringify(a) + ' vs ' + JSON.stringify(e));
  });
  ok(`${tag} 五金項數`, hw.length === L.hw.length, `${hw.length} vs ${L.hw.length}`);
  L.hw.forEach((e, i) => ok(`${tag} 五金#${i} ${e.name}`, hw[i] && hw[i].name === e.name && hw[i].n === e.n));
  ok(`${tag} 板材面積`, near(c.area, L.area, 0.002), `${c.area.toFixed(4)} vs ${L.area.toFixed(4)}`);
  ok(`${tag} 含稅總價`, near(c.total, L.total, Math.max(6, L.total * 0.002)), `${c.total.toFixed(0)} vs ${L.total.toFixed(0)}`);
  // 矩形桌損耗仍是 5%；有圓角時因為切掉四個角會多出萬分之幾，可忽略
  ok(`${tag} 損耗率 5%`, near(c.wasteRate, 0.05, 0.002), String(c.wasteRate));

  ['drawingSheet', 'explodeSheet', 'cutSheet'].forEach((fn) => {
    const e = svgOk(app[fn](p));
    ok(`${tag} ${fn}`, !e, e);
  });
});

/* ── 2. 5 種外形 × 4 種桌腳 ── */
console.log('2. 外形 × 桌腳全組合');
const SHAPES = Object.keys(TableGeom.SHAPES);
const STYLES = Object.keys(LEGS);
const blob = Array.from({ length: 24 }, (_, i) => {
  const a = Math.PI * 2 * i / 24;
  return [Math.cos(a) * 0.5 * (0.82 + 0.16 * Math.sin(a * 3)), Math.sin(a) * 0.5 * (0.86 + 0.1 * Math.cos(a * 2))];
});

SHAPES.forEach((shape) => STYLES.forEach((style) => {
  const p = { ...PRESETS.custom, topShape: shape, legStyle: style, returnD: 1000, outline: blob, drawers: 2, apronH: 120 };
  const tag = `${TableGeom.SHAPES[shape].name}/${LEGS[style].name}`;
  let g, parts, c;
  try { g = app.geo(p); parts = app.parts(p); c = app.costing(p); }
  catch (e) { ok(`${tag} 計算`, false, e.message); return; }

  ok(`${tag} 外形被採用`, g.shape === shape || (shape === 'lshape' && g.shape === 'lshape'), g.shape);
  ok(`${tag} 深度為正`, g.D > 0 && isFinite(g.D));
  ok(`${tag} 桌腳數`, g.legN === (shape === 'lshape' ? 6 : 4), String(g.legN));
  ok(`${tag} L 型強制四角腳`, shape !== 'lshape' || TableGeom.CORNER_LEGS.includes(g.style), g.style);
  ok(`${tag} 展開面積合理`, g.topArea > 0 && g.topArea <= p.length * g.D * 1.001, `${g.topArea} / ${p.length * g.D}`);
  ok(`${tag} 利用率 0.3–1`, g.yield > 0.3 && g.yield <= 1.001, String(g.yield));
  ok(`${tag} 封邊長度 > 0`, g.edgeLen > 0 && isFinite(g.edgeLen));
  ok(`${tag} 抽屜跨距 > 0`, g.front.x2 > g.front.x1);

  // 桌腳必須落在桌板外形內
  g.legs.forEach((q, i) => {
    ok(`${tag} 桌腳#${i} 在桌板內`, TableGeom.inside(g.poly, q[0], q[1]), JSON.stringify(q));
  });
  // 橫撐／加強樑數量要和桌腳數一致
  ok(`${tag} 連線段數`, g.segs.length === g.legN, String(g.segs.length));

  // 料表
  ok(`${tag} 料表有桌板`, parts[0] && parts[0].name === '桌板');
  ok(`${tag} 桌板規格為毛胚`, parts[0].L === p.length && parts[0].W === Math.round(g.D), parts[0].spec);
  ok(`${tag} 桌板面積 = 展開面積`, near(parts[0].area * 1e6, g.topArea, 1));
  parts.forEach((x) => ok(`${tag} 料表 ${x.name} 尺寸為正`, x.L > 0 && x.W > 0 && x.T > 0 && x.qty > 0, x.spec));
  // 四角腳才有桌腳與橫撐；桌架／柱腳以構件列料
  if (p.apron && g.corner) {
    const ap = parts.filter((x) => x.name.indexOf('橫撐') >= 0).reduce((t, x) => t + x.qty, 0);
    ok(`${tag} 橫撐數 = 桌腳數`, ap === g.legN, `${ap} vs ${g.legN}`);
  }
  if (g.corner) {
    const leg = parts.find((x) => x.name === '桌腳');
    ok(`${tag} 料表桌腳數`, leg && leg.qty === g.legN);
  } else {
    ok(`${tag} 桌架不列四角桌腳與橫撐`, !parts.some((x) => x.name === '桌腳' || x.name.indexOf('橫撐') >= 0));
  }

  // 成本
  ok(`${tag} 總價為正`, c.total > 0 && isFinite(c.total), String(c.total));
  ok(`${tag} 損耗率`, c.wasteRate >= 0.05 && c.wasteRate <= 0.35, String(c.wasteRate));
  ok(`${tag} 非矩形損耗 > 矩形`, shape === 'rect' || c.wasteRate > 0.05 || g.yield > 0.999);

  // 圖紙
  ['drawingSheet', 'explodeSheet', 'cutSheet'].forEach((fn) => {
    let svg;
    try { svg = app[fn](p); } catch (e) { ok(`${tag} ${fn}`, false, e.message); return; }
    const err = svgOk(svg);
    ok(`${tag} ${fn}`, !err, err);
  });

  // 俯視圖要畫出實際外形，不能只是矩形
  const dwg = app.drawingSheet(p);
  if (shape !== 'rect') ok(`${tag} 俯視圖含外形路徑`, dwg.indexOf('<path d="M') >= 0);

  // 排版與 DXF
  const sheets = app.nest(p);
  ok(`${tag} 排版有結果`, sheets.length >= 1);
  const topItem = sheets.flatMap((sh) => sh.items).find((it) => it.name === '桌板');
  ok(`${tag} 排版含桌板`, !!topItem);
  if (shape !== 'rect') ok(`${tag} 桌板帶外形線`, topItem && Array.isArray(topItem.poly) && topItem.poly.length >= 4);
  else ok(`${tag} 矩形桌板不帶外形線`, topItem && !topItem.poly);
  sheets.forEach((sh) => sh.items.forEach((it) => {
    ok(`${tag} 裁片在板內`, it.x >= 0 && it.y >= 0 && it.x + it.L <= SHEET_L + 4 && it.y + it.W <= SHEET_W + 4,
      `${it.name} ${it.x},${it.y} ${it.L}×${it.W}`);
  }));
}));

/* ── 3. L 型專項 ── */
console.log('3. L 型與手繪外形細節');
{
  const p = { ...PRESETS.desk, topShape: 'lshape', returnD: 1200, legStyle: 'metalX' };
  const g = app.geo(p);
  ok('L 型不吃金屬 X 腳', g.style === 'square' && !g.isX, g.style);
  ok('L 型總深 = returnD', near(g.D, Math.max(1200, TableGeom.barW(p) + 300)), String(g.D));
  ok('L 型展開面積 < 外框', g.topArea < p.length * g.D * 0.95);
  const c = app.costing(p);
  ok('L 型有轉角對接片', c.hw.some((x) => x.name.indexOf('轉角') >= 0));
  ok('L 型工程圖標註檯面寬', app.drawingSheet(p).indexOf(String(Math.round(TableGeom.barW(p)))) >= 0);
}
{
  const p = { ...PRESETS.custom, topShape: 'freeform', outline: blob };
  const g = app.geo(p);
  ok('手繪外形被採用', g.shape === 'freeform', g.shape);
  ok('手繪外形面積 < 外框', g.topArea < p.length * g.D);
  const bad = { ...PRESETS.custom, topShape: 'freeform', outline: [[0, 0], [1, 1]] };
  ok('無效輪廓退回矩形', app.geo(bad).shape === 'rect');
}
{
  // 外形改變後幾何快取要失效
  const a = app.geo({ ...PRESETS.dining });
  const b = app.geo({ ...PRESETS.dining, topShape: 'ellipse' });
  ok('幾何快取依參數失效', a.shape === 'rect' && b.shape === 'ellipse');
}

/* ── 4. 新式桌腳 ── */
console.log('4. 新式桌腳（ㄇ字金屬腳、工作台腳、A 字腳、中央柱腳）');
{
  const base = { ...PRESETS.dining, apron: true, stretcher: true };
  TableGeom.MEMBER_LEGS.forEach((st) => ['rect', 'ellipse', 'stadium', 'freeform'].forEach((shape) => {
    const p = { ...base, legStyle: st, topShape: shape, outline: blob };
    const tag = `${LEGS[st].name}/${TableGeom.SHAPES[shape].name}`;
    const g = app.geo(p), parts = app.parts(p), hw = app.hardware(p), legH = p.height - p.topT;
    ok(`${tag} 有構件`, Array.isArray(g.members) && g.members.length >= 3);
    g.members.forEach((m) => {
      const cs = TableGeom.memberCorners(m), ys = cs.map((c) => c[1]);
      ok(`${tag} ${m.name} 在桌板下`, Math.max(...ys) <= legH + 0.5 && Math.min(...ys) >= -12, `${Math.min(...ys)}–${Math.max(...ys)}`);
      const pts = m.shape === 'cyl'
        ? Array.from({ length: 24 }, (_, i) => [m.c[0] + m.size[0] / 2 * Math.cos(i / 24 * 2 * Math.PI), 0, m.c[2] + m.size[0] / 2 * Math.sin(i / 24 * 2 * Math.PI)])
        : cs;
      ok(`${tag} ${m.name} 在桌板外形內`, pts.every((c) => TableGeom.inside(g.poly, c[0], c[2])));
    });
    const wood = g.members.filter((m) => m.mat === 'wood').length;
    const listed = parts.filter((x) => x.mat === '實木方料').reduce((t, x) => t + x.qty, 0);
    ok(`${tag} 木構件全數列料`, listed === wood, `${listed} vs ${wood}`);
    ok(`${tag} 金屬桌腳列在五金`, st === 'trestle' || st === 'aframe' || hw.some((x) => /ㄇ字|柱腳/.test(x.name)));
    ok(`${tag} 實木方料不進板材排版`, !app.nest(p).some((sh) => sh.items.some((it) => /立柱|斜腳|橫木|橫檔|拉桿/.test(it.name))));
    const dwg = app.drawingSheet(p), ex = app.explodeSheet(p);
    ok(`${tag} 工程圖`, !svgOk(dwg), svgOk(dwg));
    ok(`${tag} 爆炸圖`, !svgOk(ex), svgOk(ex));
    ok(`${tag} 備註描述桌腳`, app.notes(p).some((n) => n.indexOf(LEGS[st].name.replace(' ', '')) >= 0 || n.indexOf(LEGS[st].name) >= 0), app.notes(p).join('|'));
  }));
  // 中央柱腳：長桌自動雙柱、短桌單柱
  const cols = (p) => app.geo(p).members.filter((m) => m.name === '柱身').length;
  ok('中央柱腳 1800×900 雙柱', cols({ ...base, legStyle: 'pedestal' }) === 2);
  ok('中央柱腳 1200×1200 單柱', cols({ ...base, legStyle: 'pedestal', length: 1200, width: 1200 }) === 1);
  ok('中央柱腳 1400×700 單柱', cols({ ...base, legStyle: 'pedestal', length: 1400, width: 700 }) === 1);
  // A 字腳與工作台腳多算工資
  const labor = (st) => app.costing({ ...base, legStyle: st, apron: false, stretcher: false }).labor;
  ok('工作台腳工資 > 方腳', labor('trestle') > labor('square'));
  ok('A 字腳工資 > 工作台腳', labor('aframe') > labor('trestle'));
  // L 型桌不能用新式桌腳
  TableGeom.MEMBER_LEGS.forEach((st) => ok(`L 型不吃${LEGS[st].name}`, app.geo({ ...base, topShape: 'lshape', returnD: 1000, legStyle: st }).style === 'square'));
}

/* ── 5. 俯視手繪外形自動辨識 ── */
console.log('5. 俯視手繪外形自動辨識');
{
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // 沿多邊形等速取點
  const walk = (P) => (t) => {
    const L = P.map((p, i) => Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1]));
    let d = t * L.reduce((a, b) => a + b), i = 0;
    while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; }
    const p = P[i], q = P[(i + 1) % P.length];
    return [p[0] + (q[0] - p[0]) * d / L[i], p[1] + (q[1] - p[1]) * d / L[i]];
  };
  // 依實際像素尺寸產生外形（圓角與跑道形的端部要是正圓，不能拉伸）
  const px = (spec) => (w, h) => walk(TableGeom.outline({ ...spec, length: w, width: h, cornerRadius: (spec.cornerRadius || 0) * Math.min(w, h) }).map(([x, z]) => [x / w, z / h]));
  const scaled = (fn) => () => fn;
  // 模擬手繪：低頻搖晃＋高頻抖動＋起點隨機＋尾端沒完全閉合，畫成一筆
  const draw = (make, w, h, amp) => {
    const fn = make(w, h), ph = rnd() * 6.28, start = rnd(), n = 160, pts = [];
    for (let i = 0; i < n * 0.97; i++) {
      const t = (start + i / n) % 1, [x, y] = fn(t);
      const wob = amp * (Math.sin(t * 6.28 * 3 + ph) * 0.6 + Math.sin(t * 6.28 * 7 + ph * 2) * 0.4);
      pts.push({ x: 700 + x * w + wob * w * 0.02 + (rnd() - 0.5) * 3, y: 450 + y * h + wob * h * 0.02 + (rnd() - 0.5) * 3 });
    }
    return [{ w: 4, pts }];
  };
  const CASES = {
    矩形: { fn: px({ topShape: 'rect' }), want: 'rect' },
    圓角矩形: { fn: px({ topShape: 'rect', cornerRadius: 0.3 }), want: 'rect', rounded: true },
    橢圓: { fn: px({ topShape: 'ellipse' }), want: 'ellipse' },
    跑道形: { fn: px({ topShape: 'stadium' }), want: 'stadium' },
    不規則: { fn: scaled((t) => { const a = t * 6.283, r = 0.5 * (0.8 + 0.18 * Math.sin(3 * a) + 0.08 * Math.cos(2 * a)); return [Math.cos(a) * r, Math.sin(a) * r]; }), want: 'freeform' },
    L形: { fn: scaled(walk([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [0.1, 0.5], [0.1, -0.1], [-0.5, -0.1]])), want: 'freeform' },
    三角形: { fn: scaled(walk([[0, -0.5], [0.5, 0.5], [-0.5, 0.5]])), want: 'freeform' },
  };
  const SIZES = [[700, 350], [800, 250], [500, 330]];
  Object.entries(CASES).forEach(([name, c]) => SIZES.forEach(([w, h]) => [0.3, 1.2].forEach((amp) => {
    seed = 11 + w + h + Math.round(amp * 10);
    app.state = { ...app.state, sketchView: 'top', targetLen: 1800, p: { ...PRESETS.dining, cornerRadius: 8 } };
    app.strokes = draw(c.fn, w, h, amp);
    app.analyze();
    const p = app.state.p, tag = `${name} ${w}×${h} 搖晃${amp}`;
    ok(`${tag} → ${c.want}`, TableGeom.shapeOf(p) === c.want, `${TableGeom.shapeOf(p)}，${app.state.sketchMsg}`);
    // 長寬比以實際筆畫外框為準（自由外形不一定撐滿 w×h）
    const sx = app.strokes[0].pts.map((q) => q.x), sy = app.strokes[0].pts.map((q) => q.y);
    const ratio = (Math.max(...sx) - Math.min(...sx)) / (Math.max(...sy) - Math.min(...sy));
    ok(`${tag} 長寬比`, near(p.length / p.width, ratio, ratio * 0.08), `${p.length}×${p.width} vs ${ratio.toFixed(2)}`);
    ok(`${tag} 保留手繪輪廓`, TableGeom.validOutline(p.outline));
    if (c.want === 'rect') ok(`${tag} 圓角`, c.rounded ? p.cornerRadius >= 60 : p.cornerRadius === 8, String(p.cornerRadius));
  })));
  // 圓：接近正方形的圓角外形要判成圓，不是跑道形
  seed = 5;
  app.strokes = draw(CASES['橢圓'].fn, 450, 450, 1.2);
  app.state = { ...app.state, p: { ...PRESETS.dining } };
  app.analyze();
  ok('圓 → ellipse', TableGeom.shapeOf(app.state.p) === 'ellipse', TableGeom.shapeOf(app.state.p));
  // 辨識成規則外形後，仍可切回原筆跡
  ok('可切回手繪外形', TableGeom.shapeOf({ ...app.state.p, topShape: 'freeform' }) === 'freeform');
}

console.log(`\n通過 ${pass}／失敗 ${fail}`);
process.exit(fail ? 1 : 0);
