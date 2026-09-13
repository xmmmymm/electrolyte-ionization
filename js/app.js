/* ============================================================
 * app.js —— 《电解质的电离》主程序
 * 依赖：vendor/three.min.js（本地）、js/config.js、js/data.js
 * 科学约束摘要：
 *   - NaCl 文案一律"离子脱离晶格"，绝不写"分子分裂成离子"
 *   - r(Na⁺)=102 pm < r(Cl⁻)=181 pm，画面 Na⁺ 明显小于 Cl⁻
 *   - 水分子极性取向：氧端朝 Na⁺、氢端朝 Cl⁻；水合动态交换、无固定配位数
 *   - 熔融电离无水；固态有离子但不导电；无电子转移
 * ============================================================ */
(function () {
  'use strict';

  var CFG = window.CONFIG;
  var DATA = window.DATA;

  /* ---------- 0. 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function damp(k, dt) { return 1 - Math.exp(-k * dt); }

  /* ---------- 1. 全局状态（刷新即默认，不存储） ---------- */
  var state = {
    preset: 'nacl-solid', stage: -1,
    temp: CFG.temperature.default,
    speed: CFG.animation.speedSteps[CFG.animation.defaultSpeedIndex],
    playing: false, heating: false, playClock: 0,
    scaleMode: CFG.scaleMode.default,
    reduceMotion: false, latticeView: false, hclRevealed: false
  };

  var SOLID_INIT = {
    title: '初始状态 · 固态 NaCl（未加水）',
    text: '固态 NaCl 晶体尚未加水。观察：晶体中 Na⁺ 与 Cl⁻ 有规律地交替排列，离子被束缚在固定位置、不能自由移动。点击"加水"开始溶解实验。',
    conductReason: '有离子，但被束缚在晶格中，不能自由移动 → 不导电'
  };

  function S() { return CFG.scaleMode[state.scaleMode]; }

  /* ---------- 2. WebGL / THREE 检测 ---------- */
  var glOK = (function () {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  })();
  var HAS_3D = !!(window.THREE && glOK);
  var T = window.THREE || null;

  /* ---------- 3. 常量 ---------- */
  var REGION = CFG.scene.region; /* 画布整体作为微观"容器"区域（去掉烧杯空间限制） */
  var MELT_PT = CFG.realData.meltingPointNaCl;
  /* NaCl 溶解各阶段脱离晶格的离子数：阶段②部分脱离（固体未完全溶解）；阶段③全部溶解（48 个 = 24 对） */
  var DETACH = { 0: 0, 1: 14, 2: 48 };

  /* ---------- 4. 三维系统 ---------- */
  var three = null, world = null, sim = null, shared = {}, ctl = null, clock = null;
  var tmpV1, tmpV2, tmpV3, tmpQ, AXIS_O, AXIS_H, AXIS_Y;

  function init3D() {
    var cvs = $('stage3d');
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: cvs, antialias: true }); }
    catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(CFG.scene.background);
    three = { renderer: renderer, scene: new T.Scene(), camera: null };

    var cam = CFG.camera;
    three.camera = new T.PerspectiveCamera(cam.fov, 1, cam.near, cam.far);
    var L = CFG.scene.light;
    three.scene.add(new T.AmbientLight(L.ambient, L.ambientIntensity));
    var dir = new T.DirectionalLight(L.directional, L.directionalIntensity);
    dir.position.set(L.dirPos.x, L.dirPos.y, L.dirPos.z);
    three.scene.add(dir);
    three.scene.add(new T.HemisphereLight(0xffffff, 0xdce6ee, 0.35));

    tmpV1 = new T.Vector3(); tmpV2 = new T.Vector3(); tmpV3 = new T.Vector3();
    tmpQ = new T.Quaternion();
    AXIS_O = new T.Vector3(0, 0, -1);
    AXIS_H = new T.Vector3(0, 0, 1);
    AXIS_Y = new T.Vector3(0, 1, 0);
    clock = new T.Clock();

    initShared();
    initControls();
    window.addEventListener('resize', resize3D);
    resize3D();
    return true;
  }

  function initShared() {
    shared.sphereGeo = new T.SphereGeometry(1, 14, 10);
    shared.matNa = new T.MeshLambertMaterial({ color: CFG.colors.naIon });
    shared.matCl = new T.MeshLambertMaterial({ color: CFG.colors.clIon });
    shared.matNaLat = new T.MeshLambertMaterial({ color: CFG.colors.naIon });
    shared.matClLat = new T.MeshLambertMaterial({ color: CFG.colors.clIon });
    shared.matO = new T.MeshLambertMaterial({ color: CFG.colors.waterO });
    shared.matH = new T.MeshLambertMaterial({ color: CFG.colors.waterH });
    shared.matSugar = new T.MeshLambertMaterial({ color: CFG.colors.sugar });
    shared.matHp = new T.MeshLambertMaterial({ color: 0x5fb6dd }); // H⁺（与水分子氢、背景均可区分）
    shared.matBench = new T.MeshLambertMaterial({ color: 0xcfdeeb });
    /* H—Cl 共价键细棒（单位圆柱：半径 1、高 1，按需缩放） */
    shared.bondGeo = new T.CylinderGeometry(1, 1, 1, 6);
    shared.matBond = new T.MeshLambertMaterial({ color: 0x8fa6ba });
    shared.matPlate = new T.MeshLambertMaterial({ color: 0x5a6b7a, emissive: 0xff5a1e, emissiveIntensity: 0 });
    shared.matFrame = new T.LineBasicMaterial({ color: CFG.colors.latticeFrame, transparent: true, opacity: 0.55 });
  }

  /* 自实现相机控制：拖拽旋转 + 滚轮缩放 + 双指捏合（不用 OrbitControls） */
  function initControls() {
    var cvs = $('stage3d');
    var cam = CFG.camera;
    ctl = { theta: 0, phi: 1.0, dist: 16, target: new T.Vector3(cam.target.x, cam.target.y, cam.target.z), pointers: {}, pinchDist: 0, drag: false };
    var p = new T.Vector3(cam.position.x, cam.position.y, cam.position.z);
    var d = p.clone().sub(ctl.target);
    ctl.dist = clamp(d.length(), cam.minDistance, cam.maxDistance);
    ctl.phi = Math.acos(clamp(d.y / (d.length() || 1), -1, 1));
    ctl.theta = Math.atan2(d.x, d.z);

    cvs.addEventListener('pointerdown', function (e) {
      cvs.setPointerCapture(e.pointerId);
      ctl.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      ctl.drag = Object.keys(ctl.pointers).length === 1;
      e.preventDefault();
    });
    cvs.addEventListener('pointermove', function (e) {
      if (!ctl.pointers[e.pointerId]) return;
      var prev = ctl.pointers[e.pointerId];
      var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      prev.x = e.clientX; prev.y = e.clientY;
      var ids = Object.keys(ctl.pointers);
      if (ids.length >= 2) {
        var a = ctl.pointers[ids[0]], b = ctl.pointers[ids[1]];
        var nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (ctl.pinchDist > 0 && nd > 0) ctl.dist = clamp(ctl.dist * ctl.pinchDist / nd, cam.minDistance, cam.maxDistance);
        ctl.pinchDist = nd;
      } else if (ctl.drag) {
        ctl.theta -= dx * cam.rotateSpeed;
        ctl.phi = clamp(ctl.phi - dy * cam.rotateSpeed, 0.15, 1.52);
      }
    });
    function release(e) {
      delete ctl.pointers[e.pointerId];
      if (Object.keys(ctl.pointers).length === 0) ctl.drag = false;
      ctl.pinchDist = 0;
    }
    cvs.addEventListener('pointerup', release);
    cvs.addEventListener('pointercancel', release);
    cvs.addEventListener('wheel', function (e) {
      e.preventDefault();
      var f = e.deltaY > 0 ? cam.zoomStep : 1 / cam.zoomStep;
      ctl.dist = clamp(ctl.dist * f, cam.minDistance, cam.maxDistance);
    }, { passive: false });
  }

  function applyCamera() {
    if (!three || !ctl) return;
    var sp = Math.sin(ctl.phi), cp = Math.cos(ctl.phi);
    three.camera.position.set(
      ctl.target.x + ctl.dist * sp * Math.sin(ctl.theta),
      ctl.target.y + ctl.dist * cp,
      ctl.target.z + ctl.dist * sp * Math.cos(ctl.theta)
    );
    three.camera.lookAt(ctl.target);
  }

  function resize3D() {
    if (!three) return;
    var wrap = $('stage-wrap');
    var w = wrap.clientWidth, h = wrap.clientHeight;
    if (w < 2 || h < 2) return;
    three.renderer.setSize(w, h, false);
    three.camera.aspect = w / h;
    three.camera.updateProjectionMatrix();
  }

  /* ---------- 通用构件 ---------- */
  function addBench(g) {
    var bench = new T.Mesh(new T.CylinderGeometry(15, 15, 0.35, 40), shared.matBench);
    bench.position.y = -0.18;
    g.add(bench);
  }
  function makeIonMesh(type, radius, lattice) {
    var m = new T.Mesh(shared.sphereGeo,
      lattice ? (type === 'na' ? shared.matNaLat : shared.matClLat) : (type === 'na' ? shared.matNa : shared.matCl));
    m.scale.setScalar(radius);
    return m;
  }
  /* 水分子：O 在局部 -Z 端（偶极负端），两个 H 在 +Z 端，键角 104.5° */
  function makeWaterGroup() {
    var sc = S(), g = new T.Group();
    var o = new T.Mesh(shared.sphereGeo, shared.matO);
    o.scale.setScalar(sc.waterO); g.add(o);
    var bond = (state.scaleMode === 'real') ? 0.30 : 0.42;
    var half = 104.5 / 2 * Math.PI / 180;
    var hx = bond * Math.sin(half), hz = bond * Math.cos(half);
    var h1 = new T.Mesh(shared.sphereGeo, shared.matH);
    h1.scale.setScalar(sc.waterH); h1.position.set(hx, 0, hz); g.add(h1);
    var h2 = new T.Mesh(shared.sphereGeo, shared.matH);
    h2.scale.setScalar(sc.waterH); h2.position.set(-hx, 0, hz); g.add(h2);
    return g;
  }
  /* 在整个画布区域内随机取点（画布即"容器"） */
  function sampleRegionPos(out) {
    out.set(rand(-REGION.x, REGION.x), rand(REGION.yMin, REGION.yMax), rand(-REGION.z, REGION.z));
    return out;
  }
  function makeWaters(n, visible) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      var g = makeWaterGroup();
      sampleRegionPos(g.position);
      g.visible = visible !== false;
      world.add(g);
      arr.push({
        group: g, role: 'free', ion: -1, angle: 0, ySlot: 0, exchT: 0,
        target: new T.Vector3(), wanderT: rand(0, 3),
        tumbleQ: new T.Quaternion(), tumbleT: rand(1, 4),
        grow: visible !== false ? 1 : 0, growDelay: rand(0, 0.9)
      });
    }
    return arr;
  }

  function disposeWorld() {
    if (!world) return;
    world.traverse(function (o) {
      if (o.geometry && o.geometry !== shared.sphereGeo) o.geometry.dispose();
    });
    three.scene.remove(world);
    world = null; sim = null;
  }

  function buildWorld() {
    if (!three) { if (!HAS_3D) drawFallback(); return; }
    disposeWorld();
    world = new T.Group();
    three.scene.add(world);
    sim = { kind: '', time: 0, swirl: 0, expansion: 1, expansionTarget: 1, frame: null, framePairs: [], exchTimer: 0 };
    addBench(world);
    if (state.preset === 'nacl-melt') buildMeltScene();
    else if (state.preset === 'sugar') buildSugarScene();
    else if (state.preset === 'hcl') buildHclScene();
    else buildDissolveScene();
    applyStage(true);
    applyLatticeView(true);
    resize3D();
  }

  /* ---------- NaCl 溶解场景（含未加水固态初始） ---------- */
  function buildDissolveScene() {
    sim.kind = 'dissolve';
    var L = CFG.lattice, sx = L.sizeX, sy = L.sizeY, sz = L.sizeZ, sp = L.spacing;
    sim.center = new T.Vector3(0, 0.55 + (sy - 1) / 2 * sp, 0);
    sim.ions = [];
    var sc = S();
    for (var i = 0; i < sx; i++) for (var j = 0; j < sy; j++) for (var k = 0; k < sz; k++) {
      var type = ((i + j + k) % 2 === 0) ? 'na' : 'cl';
      var r = (type === 'na') ? sc.naRadius : sc.clRadius;
      var home = new T.Vector3((i - (sx - 1) / 2) * sp, (j - (sy - 1) / 2) * sp, (k - (sz - 1) / 2) * sp).add(sim.center);
      var mesh = makeIonMesh(type, r, true);
      mesh.position.copy(home);
      world.add(mesh);
      sim.ions.push({
        mesh: mesh, type: type, home: home, role: 'lattice', radius: r,
        target: new T.Vector3(), delay: 0, wanderT: 0,
        vibP: rand(0, Math.PI * 2), vibF: rand(2.2, 3.4), distC: home.distanceTo(sim.center)
      });
    }
    sim.order = sim.ions.slice().sort(function (a, b) { return b.distC - a.distC; });
    buildLatticeFrame();
    var hasWater = (state.preset === 'nacl-dissolve' && state.stage >= 0);
    sim.showWaters = hasWater;
    sim.waters = makeWaters(CFG.water.count, hasWater);
    if (hasWater) {
      sim.appearStagger = true;
      sim.waters.forEach(function (w) { w.grow = 0; w.growDelay = rand(0, 0.9); });
    }
  }

  function buildLatticeFrame() {
    var pairs = [], ions = sim.ions, n = ions.length;
    for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) {
      if (ions[a].type === ions[b].type) continue;
      if (ions[a].home.distanceTo(ions[b].home) < CFG.lattice.spacing * 1.25) pairs.push([a, b]);
    }
    sim.framePairs = pairs;
    var pts = [];
    for (var p = 0; p < pairs.length; p++) pts.push(ions[pairs[p][0]].home.clone(), ions[pairs[p][1]].home.clone());
    sim.frame = new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), shared.matFrame);
    sim.frame.visible = state.latticeView;
    world.add(sim.frame);
  }

  function updateLatticeFrame() {
    if (!sim || !sim.frame || !sim.frame.visible) return;
    var pts = [];
    for (var p = 0; p < sim.framePairs.length; p++) {
      var ia = sim.ions[sim.framePairs[p][0]], ib = sim.ions[sim.framePairs[p][1]];
      if (ia.role !== 'lattice' || ib.role !== 'lattice') continue;
      pts.push(latticePos(ia, tmpV1).clone(), latticePos(ib, tmpV2).clone());
    }
    sim.frame.geometry.dispose();
    sim.frame.geometry = new T.BufferGeometry().setFromPoints(pts);
  }

  /* 晶格态离子显示位置 = 中心 + (home−中心)×膨胀系数 */
  function latticePos(ion, out) {
    out.copy(ion.home).sub(sim.center).multiplyScalar(sim.expansion).add(sim.center);
    return out;
  }

  /* ---------- NaCl 熔融场景（无水，仅需熔点 801℃；画布区域即容器） ---------- */
  function buildMeltScene() {
    sim.kind = 'melt';
    /* 加热板：随温度炽热发红（熔融无需水，无坩埚边界限制） */
    sim.plate = new T.Mesh(new T.CylinderGeometry(3.2, 3.4, 0.3, 36), shared.matPlate);
    sim.plate.position.y = 0.15;
    world.add(sim.plate);

    var n = 3, sp = 1.1;
    sim.center = new T.Vector3(0, 0.55 + sp, 0);
    sim.ions = [];
    var sc = S();
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) for (var k = 0; k < n; k++) {
      var type = ((i + j + k) % 2 === 0) ? 'na' : 'cl';
      var r = (type === 'na') ? sc.naRadius : sc.clRadius;
      var home = new T.Vector3((i - 1) * sp, (j - 1) * sp, (k - 1) * sp).add(sim.center);
      var mesh = makeIonMesh(type, r, true);
      mesh.position.copy(home); world.add(mesh);
      sim.ions.push({
        mesh: mesh, type: type, home: home, role: 'lattice', radius: r,
        target: new T.Vector3(), delay: 0, wanderT: 0,
        vibP: rand(0, Math.PI * 2), vibF: rand(2.2, 3.4), distC: home.distanceTo(sim.center)
      });
    }
    buildLatticeFrame();
  }

  /* ---------- 蔗糖溶解场景（分子分散，无离子，灯泡恒灭） ---------- */
  function buildSugarScene() {
    sim.kind = 'sugar';
    sim.showWaters = true;
    sim.sugars = [];
    var r = S().sugarRadius;
    for (var i = 0; i < CFG.sugar.count; i++) {
      var m = new T.Mesh(shared.sphereGeo, shared.matSugar);
      m.scale.setScalar(r);
      lumpPos(m.position, 1.5);
      world.add(m);
      sim.sugars.push({ mesh: m, radius: r, target: new T.Vector3(), wanderT: rand(0, 2), delay: 0 });
    }
    sim.waters = makeWaters(CFG.water.count, true);
  }
  function lumpPos(out, rr) {
    var a = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1)), d = rr * Math.cbrt(Math.random());
    out.set(d * Math.sin(ph) * Math.cos(a), 1.5 + d * Math.cos(ph) * 0.7, d * Math.sin(ph) * Math.sin(a));
  }

  /* H—Cl 共价键细棒：随共价键断裂逐渐变细并消失（只表示键的断裂，不涉及电子转移） */
  function updateBond(u, sc) {
    if (!u.bond) return;
    if (u.state === 'broken') { u.bond.visible = false; return; }
    u.bond.visible = true;
    tmpV1.copy(u.h.position).sub(u.cl.position);
    var len = tmpV1.length();
    if (len < 0.02) { u.bond.visible = false; return; } // 安全保护：避免零向量定向
    u.bond.position.copy(u.cl.position).addScaledVector(tmpV1, 0.5);
    tmpV1.normalize();
    u.bond.quaternion.setFromUnitVectors(AXIS_Y, tmpV1);
    var full = sc.hclCl + sc.hclH + 0.05;
    var thin = clamp(1 - (len - full) / 1.5, 0.12, 1);
    u.bond.scale.set(sc.bondRadius * thin, len, sc.bondRadius * thin);
  }

  /* ---------- HCl 溶解场景（共价键断裂，区别于 NaCl 离子脱离晶格） ---------- */
  function buildHclScene() {
    sim.kind = 'hcl';
    sim.showWaters = true;
    var sc = S();
    sim.units = [];
    for (var i = 0; i < CFG.hcl.moleculeCount; i++) {
      var cl = new T.Mesh(shared.sphereGeo, shared.matCl);
      cl.scale.setScalar(sc.hclCl);
      sampleRegionPos(cl.position);
      world.add(cl);
      var h = new T.Mesh(shared.sphereGeo, shared.matHp);
      h.scale.setScalar(sc.hclH);
      world.add(h);
      var off = new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      h.position.copy(cl.position).addScaledVector(off, sc.hclCl + sc.hclH + 0.05);
      /* 共价键细棒：明确表示"这是分子（H—Cl 共价键）"，不是彼此独立的离子 */
      var bond = new T.Mesh(shared.bondGeo, shared.matBond);
      world.add(bond);
      sim.units.push({
        cl: cl, h: h, bond: bond, off: off, state: 'bonded',
        clTarget: new T.Vector3(), hTarget: new T.Vector3(),
        wanderT: rand(0, 2), hWanderT: 0, breakDelay: rand(0, 1.2), spin: rand(0.15, 0.4)
      });
      sampleRegionPos(sim.units[i].clTarget);
      updateBond(sim.units[i], sc);
    }
    sim.ions = [];
    sim.waters = makeWaters(CFG.water.count, true);
  }

  /* ---------- 5. 阶段应用（科学表述核心区） ---------- */
  function applyStage(instant) {
    if (!sim) return;
    var st = state.stage;

    if (sim.kind === 'dissolve') {
      /* 阶段②表面离子脱离、阶段③水合自由移动（绝不表述为"分子分裂"） */
      var detach = (st >= 0) ? DETACH[st] : 0;
      detach = Math.min(detach, CFG.freeIon.maxPairs * 2, sim.ions.length);
      sim.order.forEach(function (ion, idx) {
        if (idx < detach) {
          if (ion.role !== 'free') {
            ion.role = 'free';
            ion.mesh.material = (ion.type === 'na') ? shared.matNa : shared.matCl;
            if (st === 1) { // 刚脱离：目标在晶体附近
              var dir = tmpV1.copy(ion.home).sub(sim.center).normalize();
              ion.target.copy(ion.home).addScaledVector(dir, rand(1.6, 2.6));
              ion.target.y = clamp(ion.target.y + rand(-0.4, 1.2), 0.55, REGION.yMax);
            } else { sampleRegionPos(ion.target); }
            ion.delay = instant ? 0 : rand(0, 1.5);
            ion.wanderT = rand(1.5, 4);
          }
        } else if (ion.role === 'free') { // 回退：重新回到晶格
          ion.role = 'lattice';
          ion.mesh.material = (ion.type === 'na') ? shared.matNaLat : shared.matClLat;
          ion.target.copy(ion.home);
          ion.delay = instant ? 0 : rand(0, 0.8);
        }
      });
      var maxD = 0;
      sim.ions.forEach(function (ion) { if (ion.role === 'lattice') maxD = Math.max(maxD, ion.distC); });
      sim.crystalR = maxD + 0.55;
      assignWaterRoles();
      updateLatticeFrame();
    }

    if (sim.kind === 'melt') setTempMelt(state.temp, instant);

    if (sim.kind === 'sugar') {
      sim.sugars.forEach(function (s) {
        if (state.stage >= 1) { sampleRegionPos(s.target); s.delay = instant ? 0 : rand(0, 1.8); }
        else { lumpPos(s.target, 1.5); s.delay = instant ? 0 : rand(0, 0.8); }
        s.wanderT = rand(1, 3);
      });
    }

    if (sim.kind === 'hcl') {
      var breakN = state.stage >= 2 ? sim.units.length : (state.stage >= 1 ? Math.floor(sim.units.length * 0.4) : 0);
      sim.ions = [];
      sim.units.forEach(function (u, idx) {
        if (idx < breakN) {
          if (state.stage >= 2) {
            /* 阶段③：全部断裂成自由移动的 H⁺ 与 Cl⁻ */
            if (u.state !== 'broken') {
              u.state = 'broken';
              u.breakDelay = instant ? 0 : rand(0, 1.4);
              sampleRegionPos(u.hTarget);
              u.hTarget.y = clamp(u.hTarget.y, 0.5, REGION.yMax);
              u.hWanderT = rand(1, 3);
            }
          } else if (u.state === 'bonded') {
            /* 阶段②：部分 H—Cl 共价键开始断裂 */
            u.state = 'breaking';
            u.breakDelay = instant ? 0 : rand(0, 1.4);
            sampleRegionPos(u.hTarget);
            u.hTarget.y = clamp(u.hTarget.y, 0.5, REGION.yMax);
            u.hWanderT = rand(1, 3);
          }
        } else if (u.state !== 'bonded') { // 回退：重新成键
          u.state = 'bonded';
          u.h.position.copy(u.cl.position).addScaledVector(u.off, S().hclCl + S().hclH + 0.05);
        }
        if (u.state === 'broken') {
          sim.ions.push({ mesh: u.cl, type: 'cl', radius: S().hclCl, role: 'free', target: u.clTarget, wanderT: rand(0, 2), delay: 0 });
          sim.ions.push({ mesh: u.h, type: 'na', radius: S().hclH, role: 'free', target: u.hTarget, wanderT: rand(0, 2), delay: 0 });
        }
        updateBond(u, S()); /* 暂停/回退时也立即同步共价键显示 */
      });
      assignWaterRoles();
    }
  }

  /* 水分子角色分配：自由游动 / 包围晶体表面 / 水合自由离子（动态交换，不标固定配位数） */
  function assignWaterRoles() {
    if (!sim || !sim.waters) return;
    var pool = shuffle(sim.waters.slice());
    var pi = 0;
    function take() { return pi < pool.length ? pool[pi++] : null; }

    sim.waters.forEach(function (w) { w.role = 'free'; w.ion = -1; });

    var targets = [];
    if (sim.ions) {
      sim.ions.forEach(function (ion) { if (ion.role === 'free') targets.push(ion); });
    }
    // 溶解阶段②：仍被束缚的最外层离子被水分子包围（极性取向）
    if (sim.kind === 'dissolve' && state.stage >= 0 && sim.order) {
      var n = 0;
      for (var i = 0; i < sim.order.length && n < 16; i++) {
        if (sim.order[i].role === 'lattice') { targets.push(sim.order[i]); n++; }
      }
    }
    targets.forEach(function (ion, idx) {
      var k = 2 + (idx % 2); // 2~3 个，仅视觉示意，动态交换
      for (var j = 0; j < k; j++) {
        var w = take();
        if (!w) return;
        w.role = 'hydrate';
        w.ion = sim.ions.indexOf(ion);
        w.angle = (j / k) * Math.PI * 2 + rand(-0.3, 0.3);
        w.ySlot = (j - (k - 1) / 2) * 0.28;
        w.exchT = rand(3, 9);
      }
    });
    sim.waters.forEach(function (w) {
      if (w.role === 'free') { sampleRegionPos(w.target); w.wanderT = rand(0, 3); }
    });
  }

  /* 熔融温度驱动：≥801℃ 离子脱离晶格自由移动；<801℃ 重新凝固 */
  function setTempMelt(temp, instant) {
    if (!sim || sim.kind !== 'melt') return;
    state.temp = temp;
    var melted = temp >= MELT_PT;
    sim.ions.forEach(function (ion, idx) {
      if (melted) {
        if (ion.role !== 'free') {
          ion.role = 'free';
          ion.mesh.material = (ion.type === 'na') ? shared.matNa : shared.matCl;
          sampleRegionPos(ion.target);
          ion.delay = instant ? 0 : rand(0, 1.2) * (idx / sim.ions.length + 0.3);
          ion.wanderT = rand(1, 3);
        }
      } else if (ion.role === 'free') {
        ion.role = 'lattice';
        ion.mesh.material = (ion.type === 'na') ? shared.matNaLat : shared.matClLat;
        ion.target.copy(ion.home);
        ion.delay = instant ? 0 : rand(0, 1.0);
      }
    });
    updateLatticeFrame();
  }

  /* 查看晶格内部结构：半透明 + 辅助线 + 适度拉开间距 */
  function applyLatticeView(instant) {
    if (!sim || !sim.ions) return;
    var on = state.latticeView;
    sim.expansionTarget = on ? 1.4 : 1.0;
    if (instant || !state.playing) sim.expansion = sim.expansionTarget; // 暂停时直接生效，避免看不到变化
    shared.matNaLat.transparent = on; shared.matClLat.transparent = on;
    shared.matNaLat.opacity = on ? 0.42 : 1; shared.matClLat.opacity = on ? 0.42 : 1;
    shared.matNaLat.needsUpdate = true; shared.matClLat.needsUpdate = true;
    if (sim.frame) sim.frame.visible = on;
    updateLatticeFrame();
  }

  /* ---------- 6. 每帧更新 ---------- */
  function updateSim(dt) {
    if (!sim || !state.playing) return; /* 暂停：冻结全部粒子运动，便于观察 */
    sim.time += dt;
    var speed = state.speed, reduce = state.reduceMotion;

    if (sim.swirl > 0.01) sim.swirl *= Math.exp(-1.6 * dt); else sim.swirl = 0;
    if (Math.abs(sim.expansion - sim.expansionTarget) > 0.002) {
      sim.expansion += (sim.expansionTarget - sim.expansion) * damp(reduce ? 30 : 5, dt);
      updateLatticeFrame();
    }

    /* 熔融：振动幅度 / 加热板炽热 */
    var vibAmp = 0;
    if (sim.kind === 'melt') {
      var t = state.temp;
      vibAmp = reduce ? 0 : (t < MELT_PT ? 0.03 + (t / MELT_PT) * 0.16 : 0);
      if (sim.plate) shared.matPlate.emissiveIntensity = clamp((t - 250) / 750, 0, 1) * 0.9;
    }

    /* 晶格态离子：位置 = 膨胀 + 热振动（离子被束缚，仅原地振动） */
    if (sim.ions) {
      sim.ions.forEach(function (ion) {
        if (ion.role !== 'lattice') return;
        latticePos(ion, tmpV1);
        if (vibAmp > 0) {
          var tt = sim.time * ion.vibF + ion.vibP;
          tmpV1.x += Math.sin(tt) * vibAmp;
          tmpV1.y += Math.sin(tt * 1.3 + 1.7) * vibAmp;
          tmpV1.z += Math.cos(tt * 0.9 + 0.6) * vibAmp;
        }
        ion.mesh.position.lerp(tmpV1, damp(reduce ? 30 : 14, dt));
      });
    }

    /* 自由离子：脱离延迟 → 在整个画布区域漫游自由移动 */
    if (sim.kind === 'dissolve' || sim.kind === 'melt') {
      sim.ions.forEach(function (ion) {
        if (ion.role !== 'free') return;
        if (ion.delay > 0) { ion.delay -= dt * speed; return; }
        ion.wanderT -= dt * speed;
        if (ion.wanderT <= 0) {
          ion.wanderT = rand(2, 5);
          sampleRegionPos(ion.target);
          if (sim.kind === 'dissolve' && sim.crystalR) { // 漫游目标避开残余晶体
            tmpV2.copy(ion.target).sub(sim.center);
            var dc = tmpV2.length(), need = sim.crystalR + 0.4;
            if (dc < need && dc > 0.001) ion.target.copy(sim.center).addScaledVector(tmpV2.normalize(), need);
          }
        }
        ion.mesh.position.lerp(ion.target, damp(reduce ? 30 : 1.6 * speed, dt));
        if (!reduce) {
          ion.mesh.position.x += Math.sin(sim.time * 3.1 + ion.vibP) * 0.0025;
          ion.mesh.position.y += Math.cos(sim.time * 2.7 + ion.vibP) * 0.0025;
        }
        ion.mesh.position.x = clamp(ion.mesh.position.x, -REGION.x, REGION.x);
        ion.mesh.position.y = clamp(ion.mesh.position.y, 0.45, REGION.yMax);
        ion.mesh.position.z = clamp(ion.mesh.position.z, -REGION.z, REGION.z);
      });
      var freeIons = sim.ions.filter(function (i) { return i.role === 'free'; });
      repulse(freeIons, 0.12);
    }

    /* 蔗糖分子：阶段②才均匀分散；阶段①保持团簇（不提前分散） */
    if (sim.kind === 'sugar') {
      var dispersed = state.stage >= 1;
      sim.sugars.forEach(function (s) {
        if (s.delay > 0) { s.delay -= dt * speed; return; }
        if (dispersed) {
          s.wanderT -= dt * speed;
          if (s.wanderT <= 0) { s.wanderT = rand(2.5, 5.5); sampleRegionPos(s.target); }
          s.mesh.position.lerp(s.target, damp(reduce ? 30 : 1.4 * speed, dt));
        } else {
          s.mesh.position.lerp(s.target, damp(reduce ? 30 : 5, dt)); // 目标为团簇位置
        }
      });
      repulse(sim.sugars, dispersed ? 0.1 : 0.02);
    }

    /* HCl：成键转动 / 断键分离 / 自由离子 */
    if (sim.kind === 'hcl') {
      var sc = S();
      sim.units.forEach(function (u) {
        u.wanderT -= dt * speed;
        if (u.wanderT <= 0) { u.wanderT = rand(2.5, 5); sampleRegionPos(u.clTarget); }
        if (u.state === 'bonded') {
          u.cl.position.lerp(u.clTarget, damp(reduce ? 30 : 1.2 * speed, dt));
          if (!reduce) u.off.applyAxisAngle(tmpV3.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), u.spin * dt * 0.4);
          u.h.position.copy(u.cl.position).addScaledVector(u.off, sc.hclCl + sc.hclH + 0.05);
        } else if (u.state === 'breaking') {
          if (u.breakDelay > 0) { u.breakDelay -= dt * speed; }
          else {
            u.cl.position.lerp(u.clTarget, damp(reduce ? 30 : 1.2 * speed, dt));
            tmpV2.copy(u.cl.position).addScaledVector(tmpV1.copy(u.off).normalize(), sc.hclCl + sc.hclH + 0.05 + 1.4);
            u.h.position.lerp(tmpV2, damp(reduce ? 30 : 1.8 * speed, dt));
          }
        } else {
          u.cl.position.lerp(u.clTarget, damp(reduce ? 30 : 1.6 * speed, dt));
          u.hWanderT -= dt * speed;
          if (u.hWanderT <= 0) { u.hWanderT = rand(2, 4.5); sampleRegionPos(u.hTarget); }
          u.h.position.lerp(u.hTarget, damp(reduce ? 30 : 1.6 * speed, dt));
        }
        updateBond(u, sc); // 共价键随位置实时更新（断键时变细消失）
      });
      var hi = [];
      sim.units.forEach(function (u) {
        if (u.state === 'broken') hi.push({ mesh: u.cl, radius: sc.hclCl }, { mesh: u.h, radius: sc.hclH });
      });
      repulse(hi, 0.1);
    }

    /* 水分子 */
    if (sim.waters && sim.showWaters !== false) {
      var scw = S();
      if (sim.appearStagger) {
        var allGrown = true;
        sim.waters.forEach(function (w) {
          if (w.grow < 1) {
            w.growDelay -= dt;
            if (w.growDelay <= 0) w.grow = Math.min(1, w.grow + dt * 1.6);
            if (w.grow < 1) allGrown = false;
            w.group.scale.setScalar(Math.max(w.grow, 0.001));
          }
        });
        if (allGrown) sim.appearStagger = false;
      }

      /* 水合动态交换：定时释放/补充，体现"水分子不断交换" */
      sim.exchTimer += dt;
      if (sim.exchTimer > 1.6 && !reduce) {
        sim.exchTimer = 0;
        var hyd = sim.waters.filter(function (w) { return w.role === 'hydrate'; });
        var frees = sim.waters.filter(function (w) { return w.role === 'free'; });
        if (hyd.length > 8 && frees.length > 4) {
          var leave = hyd[Math.floor(Math.random() * hyd.length)];
          var join = frees[Math.floor(Math.random() * frees.length)];
          var oldIon = leave.ion;
          leave.role = 'free'; leave.ion = -1;
          sampleRegionPos(leave.target); leave.wanderT = rand(1, 3);
          if (sim.ions && oldIon >= 0 && sim.ions[oldIon]) {
            join.role = 'hydrate'; join.ion = oldIon;
            join.angle = rand(0, Math.PI * 2); join.exchT = rand(3, 9);
          }
        }
      }

      sim.waters.forEach(function (w) {
        var g = w.group;
        if (w.role === 'hydrate' && sim.ions && sim.ions[w.ion]) {
          /* 水合：绕离子公转 + 极性取向（氧端朝 Na⁺，氢端朝 Cl⁻） */
          var ion = sim.ions[w.ion];
          w.angle += dt * 0.5;
          var dist = ion.radius + scw.waterO + 0.3;
          tmpV1.set(Math.cos(w.angle) * dist, w.ySlot, Math.sin(w.angle) * dist).add(ion.mesh.position);
          g.position.lerp(tmpV1, damp(reduce ? 30 : 4.5, dt));
          tmpV2.copy(ion.mesh.position).sub(g.position).normalize();
          if (tmpV2.lengthSq() > 0.4) {
            tmpQ.setFromUnitVectors(ion.type === 'na' ? AXIS_O : AXIS_H, tmpV2);
            g.quaternion.slerp(tmpQ, damp(reduce ? 30 : 3.5, dt));
          }
        } else {
          /* 自由水分子：漫游 + 缓慢翻转 */
          w.wanderT -= dt * speed;
          if (w.wanderT <= 0) { w.wanderT = rand(2, 5); sampleRegionPos(w.target); }
          g.position.lerp(w.target, damp(reduce ? 30 : 1.5 * speed, dt));
          if (!reduce) {
            w.tumbleT -= dt;
            if (w.tumbleT <= 0) {
              w.tumbleT = rand(2, 5);
              tmpV1.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
              tmpQ.setFromAxisAngle(tmpV1, rand(0.6, 2.6));
              w.tumbleQ.copy(tmpQ);
            }
            g.quaternion.slerp(w.tumbleQ, damp(0.9, dt));
          }
          if (sim.swirl > 0.01) { // 搅拌旋流
            var ang = sim.swirl * dt, px = g.position.x, pz = g.position.z;
            g.position.x = px * Math.cos(ang) - pz * Math.sin(ang);
            g.position.z = px * Math.sin(ang) + pz * Math.cos(ang);
          }
        }
        /* 画布区域边界（整体作为容器） */
        g.position.x = clamp(g.position.x, -REGION.x, REGION.x);
        g.position.z = clamp(g.position.z, -REGION.z, REGION.z);
        g.position.y = clamp(g.position.y, 0.4, REGION.yMax);
        if (sim.kind === 'dissolve' && w.role === 'free' && sim.crystalR > 0.6) {
          tmpV1.copy(g.position).sub(sim.center);
          var dc = tmpV1.length();
          if (dc < sim.crystalR && dc > 0.001) {
            g.position.copy(sim.center).addScaledVector(tmpV1.normalize(), sim.crystalR);
          }
        }
      });

      /* 水分子两两排斥（防重叠） */
      var wmin = (state.scaleMode === 'real') ? 0.5 : 0.78;
      for (var a = 0; a < sim.waters.length; a++) {
        for (var b = a + 1; b < sim.waters.length; b++) {
          var pa = sim.waters[a].group.position, pb = sim.waters[b].group.position;
          var dx = pa.x - pb.x, dy = pa.y - pb.y, dz = pa.z - pb.z;
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < wmin * wmin && d2 > 1e-6) {
            var d = Math.sqrt(d2), push = (wmin - d) * 0.32;
            dx /= d; dy /= d; dz /= d;
            pa.x += dx * push; pa.y += dy * push; pa.z += dz * push;
            pb.x -= dx * push; pb.y -= dy * push; pb.z -= dz * push;
          }
        }
      }
    }
  }

  /* 粒子排斥（防重叠）：元素含 {mesh, radius} */
  function repulse(list, pad) {
    for (var a = 0; a < list.length; a++) {
      for (var b = a + 1; b < list.length; b++) {
        var pa = list[a].mesh.position, pb = list[b].mesh.position;
        var minD = (list[a].radius || 0.3) + (list[b].radius || 0.3) + pad;
        var dx = pa.x - pb.x, dy = pa.y - pb.y, dz = pa.z - pb.z;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minD * minD && d2 > 1e-6) {
          var d = Math.sqrt(d2), push = (minD - d) * 0.4;
          dx /= d; dy /= d; dz /= d;
          pa.x += dx * push; pa.y += dy * push; pa.z += dz * push;
          pb.x -= dx * push; pb.y -= dy * push; pb.z -= dz * push;
        }
      }
    }
  }

  /* ---------- 7. 2D 宏观电路（Canvas 自绘：电池+导线+灯泡+电极） ---------- */
  function drawCircuit() {
    var cvs = $('circuit-canvas');
    if (!cvs) return;
    var ctx = cvs.getContext('2d');
    if (!ctx) return;
    var W = cvs.width, H = cvs.height;
    ctx.clearRect(0, 0, W, H);
    var conduct = isConducting();
    var kind = circuitKind();
    var wire = '#46555f';

    ctx.strokeStyle = wire; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, 110); ctx.lineTo(40, 72);
    ctx.moveTo(40, 52); ctx.lineTo(40, 26); ctx.lineTo(148, 26);
    ctx.moveTo(192, 26); ctx.lineTo(300, 26);
    ctx.lineTo(300, 110); ctx.lineTo(222, 110);
    ctx.moveTo(158, 110); ctx.lineTo(40, 110);
    ctx.stroke();

    ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(24, 62); ctx.lineTo(56, 62); ctx.stroke();
    ctx.strokeStyle = '#5a6b7a'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(32, 72); ctx.lineTo(48, 72); ctx.stroke();
    ctx.fillStyle = '#33475a'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText('+', 60, 60); ctx.fillText('−', 60, 80);

    var bx = 170, by = 26;
    if (conduct) {
      ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2.5;
      for (var i = 0; i < 8; i++) {
        var ang = i / 8 * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(ang) * 20, by + Math.sin(ang) * 20);
        ctx.lineTo(bx + Math.cos(ang) * 27, by + Math.sin(ang) * 27);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd23f';
    } else ctx.fillStyle = '#eceff1';
    ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#9aa5ad'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = conduct ? '#c47f17' : '#7c8890'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by + 6); ctx.lineTo(bx - 4, by - 4); ctx.lineTo(bx, by + 5);
    ctx.lineTo(bx + 4, by - 4); ctx.lineTo(bx + 8, by + 6);
    ctx.stroke();
    ctx.strokeStyle = wire; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx - 6, by + 16); ctx.lineTo(bx - 6, by + 24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 6, by + 16); ctx.lineTo(bx + 6, by + 24); ctx.stroke();

    if (kind === 'melt') {
      ctx.fillStyle = '#f3dfc8';
      ctx.beginPath();
      ctx.moveTo(128, 116); ctx.lineTo(252, 116);
      ctx.lineTo(238, 142); ctx.lineTo(142, 142); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a97a3'; ctx.lineWidth = 2.5; ctx.stroke();
      if (conduct) {
        ctx.fillStyle = 'rgba(255,120,40,.35)';
        ctx.beginPath();
        ctx.moveTo(136, 122); ctx.lineTo(244, 122);
        ctx.lineTo(234, 140); ctx.lineTo(146, 140); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#c0392b'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('801℃', 156, 132);
    } else {
      var hasLiquid = (kind !== 'none');
      ctx.fillStyle = hasLiquid ? 'rgba(170,212,245,.55)' : 'rgba(240,246,250,.6)';
      ctx.beginPath();
      ctx.moveTo(130, 112); ctx.lineTo(250, 112);
      ctx.lineTo(250, 142); ctx.lineTo(130, 142); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7f97a8'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(130, 106); ctx.lineTo(130, 142); ctx.lineTo(250, 142); ctx.lineTo(250, 106);
      ctx.stroke();
      if (kind === 'nacl' && conduct) {
        ctx.fillStyle = '#b84ad3';
        for (var d1 = 0; d1 < 4; d1++) { ctx.beginPath(); ctx.arc(146 + d1 * 26, 128 + (d1 % 2) * 7, 3.2, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#8fce4a';
        for (var d2 = 0; d2 < 4; d2++) { ctx.beginPath(); ctx.arc(160 + d2 * 22, 134 - (d2 % 2) * 6, 4.6, 0, 7); ctx.fill(); }
      } else if (kind === 'sugar') {
        ctx.fillStyle = '#e8985a';
        for (var d3 = 0; d3 < 6; d3++) { ctx.beginPath(); ctx.arc(144 + d3 * 18, 126 + (d3 % 3) * 5, 3.4, 0, 7); ctx.fill(); }
      } else if (kind === 'hcl' && conduct) {
        ctx.fillStyle = '#8fce4a';
        for (var d4 = 0; d4 < 4; d4++) { ctx.beginPath(); ctx.arc(150 + d4 * 26, 130, 4.4, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#9fc4dc';
        for (var d5 = 0; d5 < 4; d5++) { ctx.beginPath(); ctx.arc(162 + d5 * 22, 124, 2.2, 0, 7); ctx.fill(); }
      }
    }
    ctx.strokeStyle = '#5a6b7a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(158, 108); ctx.lineTo(158, 136); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(222, 108); ctx.lineTo(222, 136); ctx.stroke();

    if (conduct) {
      ctx.strokeStyle = 'rgba(30,158,90,.65)'; ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(170, 60); ctx.lineTo(170, 100); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function circuitKind() {
    switch (state.preset) {
      case 'nacl-solid': return 'none';
      case 'nacl-melt': return 'melt';
      case 'sugar': return 'sugar';
      case 'hcl': return 'hcl';
      default: return 'nacl';
    }
  }

  /* ---------- 8. 状态推导 ---------- */
  function stagesFor() {
    switch (state.preset) {
      case 'nacl-melt': return DATA.NACL_MELT_STAGES;
      case 'sugar': return DATA.SUGAR_STAGES;
      case 'hcl': return DATA.HCL_STAGES;
      default: return DATA.NACL_DISSOLVE_STAGES;
    }
  }
  function meltStageIndex() { return state.temp >= MELT_PT ? 2 : (state.temp >= 300 ? 1 : 0); }
  function stageIndex() {
    if (state.preset === 'nacl-melt') return meltStageIndex();
    return state.stage;
  }
  function getStageInfo() {
    if (state.preset === 'nacl-solid' && state.stage < 0) return SOLID_INIT;
    var arr = stagesFor();
    return arr[clamp(stageIndex(), 0, arr.length - 1)];
  }
  function isConducting() {
    switch (state.preset) {
      case 'nacl-solid': return false;
      case 'nacl-dissolve': return state.stage >= 2; /* 阶段③：自由移动的离子 → 导电 */
      case 'nacl-melt': return state.temp >= MELT_PT;
      case 'sugar': return false;
      case 'hcl': return state.stage >= 2;
    }
    return false;
  }
  function sceneNameText() {
    var info = getStageInfo();
    switch (state.preset) {
      case 'nacl-solid': return '固态 NaCl（未加水）';
      case 'nacl-dissolve': return 'NaCl 溶解 · ' + info.title;
      case 'nacl-melt': return 'NaCl 熔融 · ' + Math.round(state.temp) + ' ℃';
      case 'sugar': return '蔗糖溶解 · ' + info.title;
      case 'hcl': return 'HCl 溶于水 · ' + info.title;
    }
    return '';
  }
  function equationText() {
    if (state.preset === 'sugar') return DATA.EQUATIONS.sugar;
    if (state.preset === 'hcl') return DATA.EQUATIONS.hcl;
    return DATA.EQUATIONS.nacl;
  }

  /* ---------- 9. UI ---------- */
  var presetBtnEls = {};
  var heatUIClock = 0; /* 熔融加热时的 UI 刷新节流计时 */

  function buildPresetButtons() {
    var box = $('preset-btns');
    box.innerHTML = '';
    presetBtnEls = {};
    Object.keys(DATA.PRESETS).forEach(function (id) {
      var p = DATA.PRESETS[id];
      if (p.hiddenByDefault && !state.hclRevealed) return;
      var btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.innerHTML = p.label + '<small>' + p.desc + '</small>';
      btn.addEventListener('click', function () { applyPreset(id); });
      box.appendChild(btn);
      presetBtnEls[id] = btn;
    });
    $('btn-show-hcl').classList.toggle('hidden', state.hclRevealed);
  }

  function refreshUI() {
    var info = getStageInfo();
    var conduct = isConducting();

    Object.keys(presetBtnEls).forEach(function (id) {
      presetBtnEls[id].classList.toggle('active', id === state.preset);
    });

    $('scene-name').textContent = sceneNameText();
    buildStageDots();
    var dots = $('stage-indicator').children;
    var cur = stageIndex();
    for (var i = 0; i < dots.length; i++) {
      dots[i].className = 'stage-dot' + (i < cur ? ' done' : (i === cur ? ' active' : ''));
    }

    var box = $('conduct-result');
    if (conduct) {
      box.className = 'conduct-result on';
      $('conduct-icon').className = 'conduct-icon on';
      $('conduct-icon').textContent = '✔';
      $('conduct-text').className = 'conduct-text on';
      $('conduct-text').textContent = '导电（灯泡亮）';
    } else {
      box.className = 'conduct-result off';
      $('conduct-icon').className = 'conduct-icon off';
      $('conduct-icon').textContent = '✘';
      $('conduct-text').className = 'conduct-text off';
      $('conduct-text').textContent = '不导电（灯泡灭）';
    }
    $('conduct-reason').textContent = info.conductReason || '';

    /* 电离方程式浮层（展示区中上） */
    var eqo = $('eq-overlay');
    eqo.textContent = equationText();
    eqo.className = 'eq-overlay' + (state.preset === 'sugar' ? ' small' : '');
    buildLegend();

    var bw = $('btn-addwater'), bs = $('btn-stir'), bh = $('btn-heat');
    var showAdd = (state.preset === 'nacl-solid');
    bw.classList.toggle('hidden', !showAdd);
    bw.disabled = false;
    var showHeat = (state.preset === 'nacl-melt');
    bh.classList.toggle('hidden', !showHeat);
    bh.textContent = (showHeat && state.heating) ? '⏸ 停止加热' : '🔥 加热';
    var showStir = !showAdd && !showHeat;
    bs.classList.toggle('hidden', !showStir);
    if (showStir) bs.disabled = (stageIndex() >= stagesFor().length - 1);

    var showTemp = showHeat;
    $('temp-ctrl').classList.toggle('hidden', !showTemp);
    if (showTemp) {
      $('temp-slider').value = Math.round(state.temp);
      $('temp-value').textContent = Math.round(state.temp);
    }

    var bp = $('btn-play');
    bp.textContent = state.playing ? '⏸ 暂停' : '▶ 播放';
    bp.classList.toggle('paused-state', state.playing);
    /* 单步按钮：最后阶段变为"重放" */
    var atLast = stageIndex() >= stagesFor().length - 1;
    var bst = $('btn-step');
    bst.textContent = atLast ? '↺ 重放' : '⏭ 单步';
    bst.title = atLast ? '回到第一阶段重新演示' : '推进到下一阶段';

    var badge = $('scale-badge');
    if (state.scaleMode === 'schematic') { badge.style.display = ''; badge.textContent = CFG.scaleMode.schematic.caption; }
    else badge.style.display = 'none';

    var hasLattice = (state.preset === 'nacl-solid' || state.preset === 'nacl-dissolve' || state.preset === 'nacl-melt');
    $('chk-lattice').disabled = !hasLattice;

    refreshNumPanel();
    drawCircuit();
    refreshCompareActive();
    if (!HAS_3D) drawFallback();
  }

  /* ---------- 原子图示（展示区右下，随场景更新） ---------- */
  function hexColor(c) { return '#' + ('00000' + c.toString(16)).slice(-6); }
  function legendRow(dotColors, name) {
    var h = '<div class="lg-row">';
    dotColors.forEach(function (c) { h += '<span class="lg-dot" style="background:' + c + '"></span>'; });
    return h + '<span>' + name + '</span></div>';
  }
  function buildLegend() {
    var el = $('legend');
    if (!el) return;
    var na = hexColor(CFG.colors.naIon), cl = hexColor(CFG.colors.clIon);
    var water = [hexColor(CFG.colors.waterO), hexColor(CFG.colors.waterH)];
    var rows = '';
    if (state.preset === 'nacl-melt') {
      rows += legendRow([na], 'Na⁺（钠离子）');
      rows += legendRow([cl], 'Cl⁻（氯离子）');
    } else if (state.preset === 'sugar') {
      rows += legendRow([hexColor(CFG.colors.sugar)], '蔗糖分子');
      rows += legendRow(water, '水分子（O 红 · H 白）');
    } else if (state.preset === 'hcl') {
      if (state.stage >= 2) {
        /* 电离后：确实存在自由移动的 H⁺ 与 Cl⁻ */
        rows += legendRow([hexColor(0x5fb6dd)], 'H⁺（氢离子）');
        rows += legendRow([cl], 'Cl⁻（氯离子）');
      } else {
        /* 电离前：只有 HCl 分子（H—Cl 共价键），不存在 H⁺ 和 Cl⁻ */
        rows += legendRow([hexColor(0x5fb6dd), cl], 'HCl 分子（H—Cl 共价键，尚未电离）');
      }
      rows += legendRow(water, '水分子（O 红 · H 白）');
    } else if (state.preset === 'nacl-solid' && state.stage < 0) {
      rows += legendRow([na], 'Na⁺（钠离子）');
      rows += legendRow([cl], 'Cl⁻（氯离子）');
    } else {
      rows += legendRow([na], 'Na⁺（钠离子）');
      rows += legendRow([cl], 'Cl⁻（氯离子）');
      rows += legendRow(water, '水分子（O 红 · H 白）');
    }
    el.innerHTML = '<div class="lg-title">原子图示</div>' + rows;
  }

  function buildStageDots() {
    var box = $('stage-indicator');
    var n = (state.preset === 'nacl-solid') ? 0 : stagesFor().length;
    if (box.childElementCount !== n) {
      box.innerHTML = '';
      for (var i = 0; i < n; i++) {
        var d = document.createElement('div');
        d.className = 'stage-dot';
        box.appendChild(d);
      }
    }
  }

  function refreshNumPanel() {
    var el = $('num-panel');
    var R = CFG.realData;
    var html = '';
    if (state.preset === 'nacl-melt') {
      html += '<div>NaCl 熔点：<b>' + MELT_PT + ' ℃</b>（真实数据）</div>';
      html += '<div>画面离子数：27 个（<b>示意</b>）</div>';
      html += '<div class="real-scale">真实数量级：每摩尔 NaCl 含 ' + R.avogadro + ' 个 Na⁺ 与 ' + R.avogadro + ' 个 Cl⁻</div>';
      html += '<div>熔融电离不需要水，仅需达到熔点。</div>';
    } else if (state.preset === 'sugar') {
      html += '<div>画面蔗糖分子数：' + CFG.sugar.count + ' 个（<b>示意</b>）</div>';
      html += '<div>画面水分子数：' + CFG.water.count + ' 个（<b>示意</b>）</div>';
      html += '<div class="real-scale">蔗糖以分子形式分散，溶液中无离子。</div>';
    } else if (state.preset === 'hcl') {
      html += '<div>画面 HCl 分子数：' + CFG.hcl.moleculeCount + ' 个（<b>示意</b>）</div>';
      html += '<div>画面水分子数：' + CFG.water.count + ' 个（<b>示意</b>）</div>';
      html += '<div class="real-scale">真实数量级：' + R.avogadro + ' 数量级</div>';
    } else {
      html += '<div>画面晶格离子数：' + (CFG.lattice.sizeX * CFG.lattice.sizeY * CFG.lattice.sizeZ) + ' 个（<b>示意</b>）</div>';
      html += '<div>画面水分子数：' + CFG.water.count + ' 个（<b>示意</b>）</div>';
      html += '<div class="real-scale">真实数量级：每摩尔 NaCl 含 ' + R.avogadro + ' 个 Na⁺ 与 ' + R.avogadro + ' 个 Cl⁻</div>';
      html += '<div>真实半径：r(Na⁺)≈102 pm ＜ r(Cl⁻)≈181 pm</div>';
    }
    html += '<div class="disclaimer">※ 以上画面数值均为教学示意，非真实比例</div>';
    el.innerHTML = html;
  }

  /* ---------- 10. 预设与操作 ---------- */
  function applyPreset(id) {
    state.preset = id;
    state.playing = true; /* 切换预设后粒子动画即运行，便于观察 */
    state.heating = false;
    state.playClock = 0;
    state.temp = CFG.temperature.default;
    state.stage = (id === 'nacl-solid') ? -1 : 0;
    if (three) buildWorld();
    else if (!HAS_3D) drawFallback();
    refreshUI();
  }

  function doAddWater() {
    if (state.preset !== 'nacl-solid') return;
    state.preset = 'nacl-dissolve';
    state.stage = 0;
    state.playing = true; /* 加水后自动开始粒子动画 */
    if (three && sim && sim.kind === 'dissolve') {
      sim.showWaters = true;
      sim.waters.forEach(function (w) { w.group.visible = true; w.grow = 0; w.growDelay = rand(0, 0.9); });
      sim.appearStagger = true;
      applyStage(false);
    } else if (!HAS_3D) drawFallback();
    refreshUI();
  }

  function doStir() {
    if (sim) sim.swirl = 2.4;
    stepStage();
  }

  /* 单步：推进阶段；最后阶段时作为"重放" */
  function stepStage() {
    state.playing = true; // 显式推进阶段时恢复粒子动画，确保过渡可见
    if (state.preset === 'nacl-melt') {
      if (state.temp >= MELT_PT) setTemperature(CFG.temperature.default); // 重放：冷却复位
      else if (state.temp < 500) setTemperature(520);
      else setTemperature(MELT_PT);
      return;
    }
    if (stageIndex() >= stagesFor().length - 1) { replayStage(); return; }
    if (state.preset === 'nacl-solid') { doAddWater(); return; }
    state.stage = stageIndex() + 1;
    if (three) applyStage(false);
    else if (!HAS_3D) drawFallback();
    refreshUI();
  }

  /* 重放：回到第一阶段（离子回晶格 / 重新成键 / 团簇复位 / 熔融冷却） */
  function replayStage() {
    state.playing = true;
    if (state.preset === 'nacl-melt') { setTemperature(CFG.temperature.default); return; }
    state.stage = 0;
    if (three) applyStage(false);
    else if (!HAS_3D) drawFallback();
    refreshUI();
  }

  function setTemperature(t) {
    state.temp = clamp(t, CFG.temperature.min, CFG.temperature.max);
    if (three && sim && sim.kind === 'melt') setTempMelt(state.temp, false);
    refreshUI();
  }

  /* 播放 / 暂停：仅控制粒子动画的进行与否，不推进阶段 */
  function togglePlay() {
    state.playing = !state.playing;
    refreshUI();
  }

  /* 加热（熔融预设）：温度自动上升，可随时停止 */
  function toggleHeat() {
    state.heating = !state.heating;
    if (state.heating) state.playing = true; // 开始加热时恢复粒子动画，便于观察
    refreshUI();
  }

  function tickPlay(dt) {
    /* 熔融加热：温度自动上升（粒子动画由 playing 单独控制；UI 节流刷新防卡顿） */
    if (state.preset !== 'nacl-melt' || !state.heating) return;
    var nt = state.temp + 150 * state.speed * dt;
    var reached = nt >= CFG.temperature.max;
    if (reached) nt = CFG.temperature.max;
    var crossed = (state.temp < MELT_PT && nt >= MELT_PT); // 跨越熔点：导电性/阶段变化
    state.temp = nt;
    if (three && sim && sim.kind === 'melt') setTempMelt(nt, false);
    $('temp-slider').value = Math.round(nt);
    $('temp-value').textContent = Math.round(nt);
    $('scene-name').textContent = sceneNameText();
    heatUIClock += dt;
    if (reached || crossed || heatUIClock >= 0.2) {
      heatUIClock = 0;
      if (reached) state.heating = false;
      refreshUI();
    }
  }

  /* ---------- 11. 对比模式 ---------- */
  function buildCompareCards() {
    var grid = $('compare-grid');
    grid.innerHTML = '';
    DATA.COMPARE_CARDS.forEach(function (card) {
      if (card.hiddenByDefault && !state.hclRevealed) return;
      var el = document.createElement('div');
      el.className = 'compare-card';
      el.dataset.preset = card.preset;
      el.innerHTML =
        '<div class="cc-title">' + card.title + '</div>' +
        '<div class="cc-conduct ' + (card.bulb ? 'on' : 'off') + '">' + (card.bulb ? '✔ ' : '✘ ') + card.conduct + '</div>' +
        '<div class="cc-reason">' + card.reason + '</div>';
      var cv = document.createElement('canvas');
      cv.width = 200; cv.height = 86;
      cv.style.width = '100%'; cv.style.height = '86px';
      el.insertBefore(cv, el.firstChild);
      drawThumb(cv.getContext('2d'), 0, 0, 200, 86, card.id);
      el.addEventListener('click', function () {
        applyPreset(card.preset);
        closeCompare();
      });
      grid.appendChild(el);
    });
  }

  function refreshCompareActive() {
    var cards = $('compare-grid').children;
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('selected', cards[i].dataset.preset === state.preset);
    }
  }

  function closeCompare() { $('compare-overlay').classList.add('hidden'); }

  /* 缩略示意图（对比卡片 & 导出共用，Canvas 自绘） */
  function drawThumb(ctx, x, y, w, h, id) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2;
    function beaker(liquid) {
      if (liquid) {
        ctx.fillStyle = 'rgba(170,212,245,.5)';
        ctx.fillRect(cx - 44, 24, 88, 48);
      }
      ctx.strokeStyle = '#7f97a8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 46, 14); ctx.lineTo(cx - 46, 74); ctx.lineTo(cx + 46, 74); ctx.lineTo(cx + 46, 14);
      ctx.stroke();
    }
    function dot(px, py, r, c) {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    }
    if (id === 'nacl-solid') {
      var gx = cx - 36, gy = 20;
      for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
        var na = ((i + j) % 2 === 0);
        dot(gx + i * 24, gy + j * 13, na ? 3.4 : 5, na ? '#b84ad3' : '#8fce4a');
      }
      ctx.strokeStyle = '#9bb7cc'; ctx.setLineDash([4, 3]);
      ctx.strokeRect(gx - 10, gy - 8, 82, 56);
      ctx.setLineDash([]);
    } else if (id === 'nacl-dissolve') {
      beaker(true);
      for (var d = 0; d < 7; d++) dot(cx - 34 + d * 11, 30 + (d % 3) * 12, 3.4, '#b84ad3');
      for (var e = 0; e < 7; e++) dot(cx - 28 + e * 11, 38 + (e % 3) * 12, 5, '#8fce4a');
    } else if (id === 'nacl-melt') {
      var grad = ctx.createLinearGradient(0, 14, 0, 74);
      grad.addColorStop(0, '#fde8d8'); grad.addColorStop(1, '#f8b48a');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - 52, 18); ctx.lineTo(cx + 52, 18);
      ctx.lineTo(cx + 40, 70); ctx.lineTo(cx - 40, 70); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8a97a3'; ctx.lineWidth = 2; ctx.stroke();
      for (var m = 0; m < 8; m++) dot(cx - 32 + (m % 4) * 21, 34 + Math.floor(m / 4) * 18, (m % 2) ? 3.4 : 5, (m % 2) ? '#b84ad3' : '#8fce4a');
      ctx.fillStyle = '#c0392b'; ctx.font = 'bold 12px sans-serif';
      ctx.fillText('≥801℃', cx - 20, 68);
    } else if (id === 'sugar') {
      beaker(true);
      for (var s = 0; s < 10; s++) dot(cx - 36 + (s % 5) * 18, 30 + Math.floor(s / 5) * 18, 3.8, '#e8985a');
    } else if (id === 'hcl') {
      beaker(true);
      for (var q = 0; q < 5; q++) {
        dot(cx - 34 + q * 17, 34, 5, '#8fce4a');
        dot(cx - 34 + q * 17, 42, 2.2, '#9fc4dc');
      }
      for (var q2 = 0; q2 < 3; q2++) {
        dot(cx - 20 + q2 * 22, 58, 5, '#8fce4a');
        dot(cx - 10 + q2 * 22, 54, 2.2, '#9fc4dc');
      }
    }
    ctx.restore();
  }

  /* ---------- 12. 导出图片（PNG，Canvas 自绘，不依赖后端） ---------- */
  function exportImage() {
    var c = $('export-canvas');
    var W = CFG.exportImage.width, H = CFG.exportImage.height;
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#175685';
    ctx.font = 'bold 44px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('电解质的电离 · 导电性对比', W / 2, 78);
    ctx.font = '22px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#5a7086';
    ctx.fillText('判据：是否存在自由移动的离子（宏观—微观—符号 三重表征）', W / 2, 118);

    var cards = DATA.COMPARE_CARDS.filter(function (cd) { return !cd.hiddenByDefault || state.hclRevealed; });
    var cw = 250, ch = 330, gap = 24;
    var totalW = cards.length * cw + (cards.length - 1) * gap;
    var x0 = (W - totalW) / 2, y0 = 150;

    cards.forEach(function (card, idx) {
      var x = x0 + idx * (cw + gap);
      ctx.strokeStyle = card.bulb ? '#1e9e5a' : '#d43f3f';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y0, cw, ch);
      ctx.fillStyle = card.bulb ? '#f0faf4' : '#fdf4f4';
      ctx.fillRect(x + 2, y0 + 2, cw - 4, ch - 4);
      drawThumb(ctx, x + 25, y0 + 22, cw - 50, 110, card.id);
      ctx.fillStyle = '#1f3345';
      ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
      ctx.fillText(card.title, x + cw / 2, y0 + 168);
      ctx.fillStyle = card.bulb ? '#1e9e5a' : '#d43f3f';
      ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
      ctx.fillText((card.bulb ? '✔ ' : '✘ ') + card.conduct, x + cw / 2, y0 + 205);
      ctx.fillStyle = '#5a7086';
      ctx.font = '17px "Microsoft YaHei", sans-serif';
      wrapText(ctx, card.reason, x + cw / 2, y0 + 240, cw - 36, 24);
    });

    var ey = y0 + ch + 76;
    ctx.fillStyle = '#14395c';
    ctx.font = 'bold 38px Georgia, "Microsoft YaHei", serif';
    ctx.fillText('NaCl === Na⁺ + Cl⁻', W / 2 - (state.hclRevealed ? 200 : 0), ey);
    if (state.hclRevealed) ctx.fillText('HCl === H⁺ + Cl⁻', W / 2 + 200, ey);
    ctx.fillStyle = '#8a97a3';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText('※ 画面粒子数与比例为教学示意，非真实比例（真实数量级为 6.02×10²³/mol）', W / 2, H - 36);

    var a = document.createElement('a');
    a.download = '电解质的电离_对比与方程式.png';
    a.href = c.toDataURL('image/png');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function wrapText(ctx, text, cx, y, maxW, lineH) {
    var chars = text.split('');
    var line = '', lines = [];
    for (var i = 0; i < chars.length; i++) {
      if (ctx.measureText(line + chars[i]).width > maxW) { lines.push(line); line = chars[i]; }
      else line += chars[i];
    }
    if (line) lines.push(line);
    lines.forEach(function (ln, idx) { ctx.fillText(ln, cx, y + idx * lineH); });
  }

  /* ---------- 13. 帮助页（三个 Tab） ---------- */
  function buildHelp() {
    ['tab1', 'tab2', 'tab3'].forEach(function (tid) {
      var pane = $('help-' + tid);
      pane.innerHTML = '';
      var ul = document.createElement('ul');
      DATA.HELP[tid].items.forEach(function (it) {
        var li = document.createElement('li');
        li.textContent = it;
        ul.appendChild(li);
      });
      pane.appendChild(ul);
    });
  }

  /* ---------- 14. WebGL 降级：极简 2D 静态示意 ---------- */
  function drawFallback() {
    var cvs = $('fb-canvas');
    if (!cvs) return;
    var ctx = cvs.getContext('2d');
    if (!ctx) return;
    var W = cvs.width, H = cvs.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#175685';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.fillText(sceneNameText(), W / 2, 44);

    var info = getStageInfo();
    ctx.fillStyle = '#33475a';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    wrapText(ctx, info.text, W / 2, 90, W - 90, 30);

    drawThumb(ctx, W / 2 - 130, H / 2 - 60, 260, 140, state.preset === 'nacl-solid' ? 'nacl-solid'
      : state.preset === 'nacl-melt' ? 'nacl-melt'
      : state.preset === 'sugar' ? 'sugar'
      : state.preset === 'hcl' ? 'hcl' : 'nacl-dissolve');

    ctx.fillStyle = isConducting() ? '#1e9e5a' : '#d43f3f';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.fillText(isConducting() ? '✔ 导电（灯泡亮）' : '✘ 不导电（灯泡灭）', W / 2, H - 60);
    ctx.fillStyle = '#8a97a3';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillText('（2D 静态示意 · 交互面板仍可使用）', W / 2, H - 28);
  }

  /* ---------- 15. 事件绑定与初始化 ---------- */
  function bindEvents() {
    $('btn-reset').addEventListener('click', function () {
      state.preset = 'nacl-solid'; state.stage = -1;
      state.temp = CFG.temperature.default;
      state.speed = CFG.animation.speedSteps[CFG.animation.defaultSpeedIndex];
      state.playing = false; state.heating = false; state.playClock = 0;
      state.scaleMode = CFG.scaleMode.default;
      state.reduceMotion = false; state.latticeView = false;
      state.hclRevealed = false;
      $('chk-lattice').checked = false;
      $('chk-realscale').checked = false;
      $('chk-reduce').checked = false;
      document.body.classList.remove('reduce-motion');
      var sps = document.querySelectorAll('.speed-btn');
      for (var i = 0; i < sps.length; i++) sps[i].classList.toggle('active', parseFloat(sps[i].getAttribute('data-speed')) === state.speed);
      buildPresetButtons();
      buildCompareCards();
      if (three) buildWorld();
      else if (!HAS_3D) drawFallback();
      refreshUI();
    });

    $('btn-addwater').addEventListener('click', doAddWater);
    $('btn-stir').addEventListener('click', doStir);
    $('btn-heat').addEventListener('click', toggleHeat);
    $('btn-play').addEventListener('click', togglePlay);
    $('btn-step').addEventListener('click', stepStage);

    var sps = document.querySelectorAll('.speed-btn');
    for (var i = 0; i < sps.length; i++) {
      sps[i].addEventListener('click', function () {
        state.speed = parseFloat(this.getAttribute('data-speed'));
        for (var j = 0; j < sps.length; j++) sps[j].classList.remove('active');
        this.classList.add('active');
      });
    }

    $('temp-slider').addEventListener('input', function () {
      state.playing = true; // 拖动温度时恢复粒子动画，便于观察熔化过程
      setTemperature(parseFloat(this.value));
    });

    $('btn-compare').addEventListener('click', function () { $('compare-overlay').classList.remove('hidden'); });
    $('btn-compare-close').addEventListener('click', closeCompare);

    $('btn-help').addEventListener('click', function () { $('help-overlay').classList.remove('hidden'); });
    $('btn-help-close').addEventListener('click', function () { $('help-overlay').classList.add('hidden'); });
    var tabs = document.querySelectorAll('.help-tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].addEventListener('click', function () {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        this.classList.add('active');
        var panes = document.querySelectorAll('.help-pane');
        for (var k = 0; k < panes.length; k++) panes[k].classList.remove('active');
        $('help-' + this.getAttribute('data-tab')).classList.add('active');
      });
    }

    $('btn-export').addEventListener('click', exportImage);

    $('btn-show-hcl').addEventListener('click', function () {
      state.hclRevealed = true;
      buildPresetButtons();
      buildCompareCards();
      refreshUI();
    });

    $('chk-lattice').addEventListener('change', function () {
      state.latticeView = this.checked;
      applyLatticeView(false);
    });
    $('chk-realscale').addEventListener('change', function () {
      state.scaleMode = this.checked ? 'real' : 'schematic';
      if (three) buildWorld(); // 以当前状态重建（比例即时生效）
      refreshUI();
    });
    $('chk-reduce').addEventListener('change', function () {
      state.reduceMotion = this.checked;
      document.body.classList.toggle('reduce-motion', this.checked);
    });
  }

  /* ---------- 16. 主循环 ---------- */
  function loop() {
    requestAnimationFrame(loop);
    var dt = clock ? Math.min(clock.getDelta(), 0.05) : 0.016;
    tickPlay(dt);
    if (three && world) {
      updateSim(dt);
      applyCamera();
      three.renderer.render(three.scene, three.camera);
    } else if (!HAS_3D && sim === null) {
      /* 降级模式下无 3D 循环开销 */
    }
  }

  /* ---------- 17. 启动 ---------- */
  function init() {
    buildPresetButtons();
    buildCompareCards();
    buildHelp();
    bindEvents();

    if (HAS_3D) {
      if (!init3D()) {
        HAS_3D = false;
      }
    }
    if (!HAS_3D) {
      $('webgl-tip').classList.remove('hidden');
      $('webgl-tip').textContent = window.THREE
        ? '当前浏览器不支持 WebGL，已切换为 2D 静态示意。'
        : '未找到 Three.js（vendor/three.min.js）。请按 vendor/README.md 下载放置后刷新页面。';
      $('fallback-2d').classList.remove('hidden');
      $('stage3d').style.display = 'none';
      sim = { kind: 'fallback' };
      drawFallback();
    } else {
      buildWorld();
    }

    if (!clock) clock = { getDelta: function () { return 0.016; } }; /* 降级占位，避免空引用 */
    refreshUI();
    loop();
  }

  init();
})();
