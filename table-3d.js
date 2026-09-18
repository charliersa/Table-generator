// <table-3d spec='{...}'> — parametric table viewer + OBJ/GLB export
(function () {
  const CDNS = [
    'https://esm.sh/three@0.160.0',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm',
    'https://unpkg.com/three@0.160.0/build/three.module.js',
  ];
  let libs = null, base = null;
  const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  async function load() {
    if (libs) return libs;
    let THREE = null, err = null;
    for (const url of CDNS) {
      try { THREE = await withTimeout(import(url), 9000); base = url; break; }
      catch (e) { err = e; }
    }
    if (!THREE) throw err || new Error('three.js unavailable');
    let OrbitControls = null;
    const ocUrls = base.indexOf('esm.sh') >= 0
      ? [base + '/examples/jsm/controls/OrbitControls.js']
      : ['https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js',
         'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm'];
    for (const u of ocUrls) {
      try { OrbitControls = (await withTimeout(import(u), 9000)).OrbitControls; break; } catch (e) {}
    }
    libs = { THREE, OrbitControls };
    return libs;
  }

  async function exporter(kind) {
    await load();
    const paths = {
      obj: ['/examples/jsm/exporters/OBJExporter.js', 'OBJExporter'],
      glb: ['/examples/jsm/exporters/GLTFExporter.js', 'GLTFExporter'],
    }[kind];
    const urls = base && base.indexOf('esm.sh') >= 0
      ? [base + paths[0], 'https://cdn.jsdelivr.net/npm/three@0.160.0' + paths[0] + '/+esm']
      : ['https://esm.sh/three@0.160.0' + paths[0], 'https://cdn.jsdelivr.net/npm/three@0.160.0' + paths[0] + '/+esm'];
    for (const u of urls) {
      try { const m = await withTimeout(import(u), 9000); if (m[paths[1]]) return m[paths[1]]; } catch (e) {}
    }
    throw new Error('exporter 模組載入失敗');
  }

  const MAT = {
    oak:    { base: '#c9a071', grain: '#a97f4e', rough: 0.55 },
    walnut: { base: '#6b4630', grain: '#4a2d1d', rough: 0.5 },
    ash:    { base: '#ddc9a8', grain: '#c0a680', rough: 0.6 },
    beech:  { base: '#d6b088', grain: '#b98f63', rough: 0.58 },
    black:  { base: '#26282b', grain: '#1c1e20', rough: 0.75 },
    white:  { base: '#eeeae3', grain: '#ded8cf', rough: 0.7 },
  };

  function woodTexture(THREE, key, lengthMM) {
    const c = MAT[key] || MAT.oak;
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 256;
    const x = cv.getContext('2d');
    x.fillStyle = c.base; x.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 220; i++) {
      const y = Math.random() * 256;
      const a = 0.04 + Math.random() * 0.16;
      x.strokeStyle = c.grain; x.globalAlpha = a;
      x.lineWidth = 0.6 + Math.random() * 2.2;
      x.beginPath(); x.moveTo(0, y);
      for (let px = 0; px <= 1024; px += 64) {
        x.lineTo(px, y + Math.sin((px / 1024) * Math.PI * (1 + Math.random() * 2)) * (2 + Math.random() * 6));
      }
      x.stroke();
    }
    x.globalAlpha = 0.05;
    for (let i = 0; i < 5000; i++) {
      x.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
      x.fillRect(Math.random() * 1024, Math.random() * 256, 1.4, 1.4);
    }
    x.globalAlpha = 1;
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, lengthMM / 900), 1);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  class Table3D extends HTMLElement {
    static get observedAttributes() { return ['spec']; }
    constructor() { super(); this._spec = null; this._ready = false; }

    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.style.height = '100%';
      this.boot();
    }

    attributeChangedCallback(n, o, v) {
      if (n === 'spec' && v) {
        try { this._spec = JSON.parse(v); } catch (e) { return; }
        if (this._ready) this.build();
      }
    }

    fallback(msg) {
      if (!this._fb) {
        this._fb = document.createElement('div');
        this._fb.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'Noto Sans TC',sans-serif;font-size:13px;color:#5c5850;text-align:center;line-height:1.8;padding:32px";
        this.appendChild(this._fb);
      }
      this._fb.innerHTML = msg;
    }

    async boot() {
      this.fallback('3D 引擎載入中…<br><span style="font-size:11px;color:#8d877c">2D 工程圖、料表與報價不受影響</span>');
      let THREE, OrbitControls;
      try { ({ THREE, OrbitControls } = await load()); }
      catch (e) {
        this.fallback('3D 引擎無法載入（網路受限）<br><span style="font-size:11px;color:#8d877c">請改用「工程圖／爆炸圖／板材切割圖」檢視，其餘功能正常</span>');
        this.dispatchEvent(new CustomEvent('failed'));
        return;
      }
      if (this._fb) { this._fb.remove(); this._fb = null; }
      this.THREE = THREE;
      const w = this.clientWidth || 800, h = this.clientHeight || 600;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      this.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      this.renderer = renderer;

      const scene = new THREE.Scene();
      this.scene = scene;
      const cam = new THREE.PerspectiveCamera(38, w / h, 0.05, 200);
      cam.position.set(2.6, 1.9, 3.1);
      this.cam = cam;

      scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc7b8, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 2.1);
      key.position.set(3.2, 5.2, 3.4);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      const d = 4;
      Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 0.1, far: 20 });
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.5);
      fill.position.set(-3, 2, -2.5);
      scene.add(fill);

      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.ShadowMaterial({ opacity: 0.22 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      let controls;
      if (OrbitControls) {
        controls = new OrbitControls(cam, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minPolarAngle = 0.15;
        controls.maxPolarAngle = Math.PI / 2 - 0.03;
        controls.target.set(0, 0.45, 0);
      } else {
        controls = { update() {}, target: new THREE.Vector3(0, 0.45, 0) };
        this._spin = true;
      }
      this.controls = controls;

      this._lastW = w; this._lastH = h;
      const resize = () => {
        const W = Math.round(this.clientWidth), H = Math.round(this.clientHeight);
        if (!W || !H) return;
        if (Math.abs(W - this._lastW) < 2 && Math.abs(H - this._lastH) < 2) return;
        this._lastW = W; this._lastH = H;
        renderer.setSize(W, H, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        cam.aspect = W / H; cam.updateProjectionMatrix();
      };
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      this._ro = new ResizeObserver(() => { cancelAnimationFrame(this._rz); this._rz = requestAnimationFrame(resize); });
      this._ro.observe(this.parentElement || this);

      const tick = () => {
        this._raf = requestAnimationFrame(tick);
        if (this._spin) { this.group && (this.group.rotation.y += 0.004); }
        controls.update();
        renderer.render(scene, cam);
      };
      tick();

      this._ready = true;
      if (!this._spec && this.getAttribute('spec')) {
        try { this._spec = JSON.parse(this.getAttribute('spec')); } catch (e) {}
      }
      this.build();
      this.dispatchEvent(new CustomEvent('ready'));
    }

    disconnectedCallback() { cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); }

    setSpin(v) { this._spin = !!v; }
    frame() {
      if (!this.group || !this.cam) return;
      const THREE = this.THREE;
      const box = new THREE.Box3().setFromObject(this.group);
      const s = box.getSize(new THREE.Vector3()).length();
      const c = box.getCenter(new THREE.Vector3());
      this.controls.target.copy(c);
      const dir = new THREE.Vector3(0.72, 0.5, 0.85).normalize();
      this.cam.position.copy(c).add(dir.multiplyScalar(s * 1.25));
      this.controls.update();
    }

    build() {
      const THREE = this.THREE, s = this._spec;
      if (!THREE || !s) return;
      if (this.group) { this.scene.remove(this.group); disposeAll(THREE, this.group); }
      const g = buildTable(THREE, s);
      this.group = g;
      this.scene.add(g);
      if (!this._framed) { this.frame(); this._framed = true; }
    }

    pngDataURL() {
      if (!this.renderer) throw new Error('3D 引擎未載入');
      this.renderer.render(this.scene, this.cam);
      return this.renderer.domElement.toDataURL('image/png');
    }

    async exportOBJ() {
      if (!this.group) throw new Error('3D 引擎未載入，無法匯出模型');
      const OBJExporter = await exporter('obj');
      return new OBJExporter().parse(this.group);
    }

    async exportGLB() {
      if (!this.group) throw new Error('3D 引擎未載入，無法匯出模型');
      const GLTFExporter = await exporter('glb');
      const group = this.group;
      return new Promise((res, rej) => {
        new GLTFExporter().parse(group, (r) => res(r), rej, { binary: true });
      });
    }
  }

  function disposeAll(THREE, root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
  }

  function buildTable(THREE, s) {
    const mm = (v) => v / 1000;
    const L = mm(s.length), W = mm(s.width), H = mm(s.height), T = mm(s.topT);
    const legS = mm(s.legSize), inset = mm(s.legInset);
    const apronH = mm(s.apronH || 90), apronT = mm(18);
    const geom = typeof window !== 'undefined' && window.TableGeom ? window.TableGeom : null;
    const g = new THREE.Group();
    g.name = 'Table';

    const woodM = (len, name) => {
      const m = new THREE.MeshStandardMaterial({
        map: woodTexture(THREE, s.material, len),
        roughness: (MAT[s.material] || MAT.oak).rough,
        metalness: 0.02,
      });
      m.name = name;
      return m;
    };
    const metalM = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.35, metalness: 0.85 });
    metalM.name = 'Steel';

    const box = (w, h, d, mat, name) => {
      const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      me.castShadow = me.receiveShadow = true;
      me.name = name;
      return me;
    };

    // top
    let topMesh;
    const layout = geom && geom.layout ? geom.layout(s) : null;
    if (layout && layout.shape !== 'rect') {
      const poly = layout.poly;
      if (poly && poly.length >= 3) {
        const sh = new THREE.Shape();
        poly.forEach(([x, z], idx) => {
          const px = x / 1000, pz = z / 1000;
          if (idx === 0) sh.moveTo(px, pz); else sh.lineTo(px, pz);
        });
        sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 18 });
        // +90°：外形的 y 對應 3D 的 z，厚度往下長 → 佔 H−T～H
        geo.rotateX(Math.PI / 2);
        geo.computeVertexNormals();
        topMesh = new THREE.Mesh(geo, woodM(s.length, 'TopWood'));
        topMesh.castShadow = topMesh.receiveShadow = true;
        topMesh.name = 'TableTop';
        topMesh.position.y = H;
      }
    }
    if (!topMesh) {
      const r = Math.min(mm(s.cornerRadius || 0), Math.min(L, W) / 2 - 0.001);
      if (r > 0.004) {
        const sh = new THREE.Shape();
        const x = -L / 2, y = -W / 2;
        sh.moveTo(x + r, y);
        sh.lineTo(x + L - r, y); sh.quadraticCurveTo(x + L, y, x + L, y + r);
        sh.lineTo(x + L, y + W - r); sh.quadraticCurveTo(x + L, y + W, x + L - r, y + W);
        sh.lineTo(x + r, y + W); sh.quadraticCurveTo(x, y + W, x, y + W - r);
        sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 12 });
        geo.rotateX(-Math.PI / 2);
        geo.computeVertexNormals();
        topMesh = new THREE.Mesh(geo, woodM(s.length, 'TopWood'));
        topMesh.castShadow = topMesh.receiveShadow = true;
        topMesh.name = 'TableTop';
        // −90°：厚度往上長 → 佔 0～T，所以放在 H−T
        topMesh.position.y = H - T;
      } else {
        topMesh = box(L, T, W, woodM(s.length, 'TopWood'), 'TableTop');
        topMesh.position.y = H - T / 2;
      }
    }
    g.add(topMesh);

    // 沿 (x1,z1)→(x2,z2) 擺一根長料；off 為往外側的位移
    const along = (x1, z1, x2, z2, len, h, t, y, off, mat, name) => {
      const dx = x2 - x1, dz = z2 - z1, d = Math.hypot(dx, dz) || 1;
      const m = box(len, h, t, mat, name);
      m.rotation.y = Math.atan2(-dz, dx);
      m.position.set((x1 + x2) / 2 + dz / d * off, y, (z1 + z2) / 2 - dx / d * off);
      return m;
    };
    // 多邊形方向（決定哪一側是外側）
    const orient = (pts) => {
      let a = 0;
      pts.forEach(([x1, z1], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; a += x1 * z2 - x2 * z1; });
      return a >= 0 ? 1 : -1;
    };

    if (s.edgeBand && layout) {
      const eb = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.6 });
      eb.name = 'EdgeBand';
      const poly = layout.poly.map(([x, z]) => [mm(x), mm(z)]), sg = orient(poly);
      poly.forEach(([x1, z1], i) => {
        const [x2, z2] = poly[(i + 1) % poly.length];
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 0.001) return;
        g.add(along(x1, z1, x2, z2, len, T * 0.96, 0.003, H - T / 2, sg * 0.0015, eb, 'EdgeBand' + i));
      });
    } else if (s.edgeBand) {
      const eb = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.6 });
      eb.name = 'EdgeBand';
      const t2 = 0.003;
      [[0, W / 2], [0, -W / 2]].forEach(([x, z], i) => {
        const m = box(L, T * 0.96, t2, eb, 'EdgeBandLong' + i);
        m.position.set(x, H - T / 2, z); g.add(m);
      });
      [[L / 2, 0], [-L / 2, 0]].forEach(([x, z], i) => {
        const m = box(t2, T * 0.96, W, eb, 'EdgeBandShort' + i);
        m.position.set(x, H - T / 2, z); g.add(m);
      });
    }

    const legH = H - T;
    // 桌腳中心 (±px, ±pz)：非矩形桌板由共用幾何算出內縮後的位置
    const px = layout ? mm(layout.a) : L / 2 - inset - legS / 2;
    const pz = layout ? mm(layout.b) : W / 2 - inset - legS / 2;
    const style = layout ? layout.style : s.legStyle;
    const corners = [[-px, -pz], [px, -pz], [px, pz], [-px, pz]];
    const legCenters = layout && layout.legs.length ? layout.legs.map(([x, z]) => [mm(x), mm(z)]) : corners;
    const legSegs = legCenters.map((q, i) => [q, legCenters[(i + 1) % legCenters.length]]);
    const legSign = orient(legCenters);
    // 新式桌腳（ㄇ字金屬腳、工作台腳、A 字腳、中央柱腳）由共用幾何給出構件清單
    const mems = geom && geom.members ? geom.members(s) : null;

    if (mems) {
      mems.forEach((m, i) => {
        const [sx, sy, sz] = m.size.map(mm);
        const mat = m.mat === 'metal' ? metalM : woodM(Math.max(sx, sy, sz) * 1000, 'LegWood' + i);
        const me = m.shape === 'cyl'
          ? new THREE.Mesh(new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 40), mat)
          : new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
        me.castShadow = me.receiveShadow = true;
        me.name = 'Member' + (i + 1);
        me.position.set(mm(m.c[0]), mm(m.c[1]), mm(m.c[2]));
        me.rotation.x = m.rx;
        g.add(me);
      });
    } else if (style === 'metalX') {
      const bar = 0.03;
      [pz, -pz].forEach((z, i) => {
        const frame = new THREE.Group();
        frame.name = 'MetalFrame' + i;
        const span = px * 2 + legS;
        const diag = Math.sqrt(span * span + legH * legH);
        [1, -1].forEach((dir, j) => {
          const m = box(bar, diag, bar, metalM, 'XBar' + i + j);
          m.rotation.z = dir * Math.atan2(span, legH);
          m.position.set(0, legH / 2, 0);
          frame.add(m);
        });
        const foot = box(span, bar * 0.7, bar * 1.4, metalM, 'Foot' + i);
        foot.position.set(0, bar * 0.35, 0); frame.add(foot);
        const rail = box(span, bar * 0.7, bar * 1.4, metalM, 'Rail' + i);
        rail.position.set(0, legH - bar * 0.35, 0); frame.add(rail);
        frame.position.z = z;
        g.add(frame);
      });
      const beam = box(bar * 1.2, bar * 1.2, pz * 2, metalM, 'CrossBeam');
      beam.position.set(0, legH * 0.62, 0);
      g.add(beam);
    } else {
      legCenters.forEach(([x, z], i) => {
        let leg;
        if (style === 'round') {
          leg = new THREE.Mesh(new THREE.CylinderGeometry(legS / 2, legS / 2, legH, 28), woodM(200, 'LegWood' + i));
        } else if (style === 'taper') {
          const geo = new THREE.CylinderGeometry(legS / 2 * 1.02, legS / 2 * 0.52, legH, 4, 1);
          geo.rotateY(Math.PI / 4);
          leg = new THREE.Mesh(geo, woodM(200, 'LegWood' + i));
        } else {
          leg = new THREE.Mesh(new THREE.BoxGeometry(legS, legH, legS), woodM(200, 'LegWood' + i));
        }
        leg.castShadow = leg.receiveShadow = true;
        leg.name = 'Leg' + (i + 1);
        leg.position.set(x, legH / 2, z);
        g.add(leg);
      });

      // 橫撐：每兩支相鄰桌腳之間一片，外緣與桌腳外側齊平
      if (s.apron) {
        const y = legH - apronH / 2 - 0.004;
        legSegs.forEach(([[x1, z1], [x2, z2]], i) => {
          const len = Math.hypot(x2 - x1, z2 - z1) - legS;
          if (len <= 0.01) return;
          g.add(along(x1, z1, x2, z2, len, apronH, apronT, y, legSign * (legS / 2 - apronT / 2), woodM(len * 1000, 'ApronWood' + i), 'Apron' + (i + 1)));
        });
      }

      if (s.stretcher) {
        const st = mm(45);
        const y = legH * 0.28;
        if (legCenters.length === 4) {
          [pz, -pz].forEach((z, i) => {
            const m = box(px * 2 - legS, st, st, woodM(px * 2000, 'StrWood' + i), 'Stretcher' + (i + 1));
            m.position.set(0, y, z); g.add(m);
          });
          const mid = box(st, st, pz * 2 - legS, woodM(pz * 2000, 'StrMid'), 'StretcherMid');
          mid.position.set(0, y, 0); g.add(mid);
        } else {
          legSegs.forEach(([[x1, z1], [x2, z2]], i) => {
            const len = Math.hypot(x2 - x1, z2 - z1) - legS;
            if (len <= 0.01) return;
            g.add(along(x1, z1, x2, z2, len, st, st, y, 0, woodM(len * 1000, 'StrWood' + i), 'Stretcher' + (i + 1)));
          });
        }
      }
    }

    const n = s.drawers | 0;
    if (n > 0) {
      // 正面抽屜可用跨距（mm）
      const fr = layout ? layout.front : { x1: (-px + legS / 2) * 1000, x2: (px - legS / 2) * 1000, z: pz * 1000 };
      const innerL = fr.x2 - fr.x1 - 20;
      const cx = mm(fr.x1 + fr.x2) / 2;
      const dh = Math.min(apronH * 0.82, mm(140));
      const each = mm(innerL) / n;
      const zf = mm(fr.z) + mm(9);
      for (let i = 0; i < n; i++) {
        const front = box(each - mm(6), dh, mm(18), woodM(each * 1000, 'DrawerWood' + i), 'DrawerFront' + (i + 1));
        front.position.set(cx - mm(innerL) / 2 + each * (i + 0.5), legH - dh / 2 - mm(10), zf);
        g.add(front);
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(mm(6), mm(6), Math.min(each * 0.42, mm(140)), 16), metalM);
        handle.rotation.z = Math.PI / 2;
        handle.name = 'Handle' + (i + 1);
        handle.castShadow = true;
        handle.position.set(front.position.x, front.position.y, zf + mm(24));
        g.add(handle);
        [-1, 1].forEach((sd, k) => {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(mm(5), mm(5), mm(26), 12), metalM);
          st.rotation.x = Math.PI / 2;
          st.name = 'Standoff' + (i + 1) + k;
          st.position.set(front.position.x + sd * Math.min(each * 0.2, mm(80)), front.position.y, zf + mm(11));
          g.add(st);
        });
      }
    }
    return g;
  }

  if (!customElements.get('table-3d')) customElements.define('table-3d', Table3D);
})();
