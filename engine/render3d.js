// G-Code 3D renderer: draws the same core state as render2d.js with three.js.
// Side view looks down -z at the x/y plane; top view looks down at x/z.
// A slot with a doodle becomes a camera-facing sprite of that picture.

import * as THREE from 'three';
import { COLORS } from './core.js';

const SKY = { day: 0x8fd0ff, night: 0x0b1026, sunset: 0xff9a6b, dawn: 0xb7c6ff, space: 0x02030a, storm: 0x4a5162, underwater: 0x0d5d8c, candy: 0xffc4e1 };
const GROUND = { grass: 0x4caf50, sand: 0xe3c98a, snow: 0xf2f6ff, water: 0x2f8fd8, lava: 0xff5a1f, stone: 0x8d8f98, ice: 0xbfe6ff, dirt: 0x8d5a3b };
const LIGHT = { day: [1.0, 2.2], night: [0.35, 0.6], sunset: [0.7, 1.8], dawn: [0.7, 1.6], space: [0.4, 1.8], storm: [0.5, 1.0], underwater: [0.6, 1.2], candy: [1.0, 2.0] };

function col(c) {
  try { return new THREE.Color(COLORS[c] || c); } catch { return new THREE.Color('#888'); }
}

export function createRender3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(8, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
  scene.add(hemi, sun, sun.target);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 150;
    sp[i * 3] = Math.sqrt(1 - u * u) * Math.cos(a) * r; sp[i * 3 + 1] = Math.abs(u) * r; sp[i * 3 + 2] = Math.sqrt(1 - u * u) * Math.sin(a) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true }));
  scene.add(stars);

  const WEATHER_N = 1500;
  const wGeo = new THREE.BufferGeometry();
  const wp = new Float32Array(WEATHER_N * 3);
  for (let i = 0; i < WEATHER_N; i++) { wp[i * 3] = (Math.random() - 0.5) * 50; wp[i * 3 + 1] = Math.random() * 25; wp[i * 3 + 2] = (Math.random() - 0.5) * 40; }
  wGeo.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  const weather = new THREE.Points(wGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12 }));
  scene.add(weather);

  const MAXP = 1500;
  const pMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  scene.add(pMesh);

  const meshes = new Map();
  const doodleTex = new WeakMap();
  const tmp = new THREE.Object3D();
  let lastKey = '';

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || camera.aspect !== w / h) {
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function setupWorld(c) {
    const key = [c.world.sky, c.world.ground, c.world.fog, c.world.weather, c.view].join('|');
    if (key === lastKey) return;
    lastKey = key;
    const sky = c.world.sky;
    const skyCol = SKY[sky] != null ? new THREE.Color(SKY[sky]) : col(sky);
    scene.background = skyCol;
    scene.fog = c.world.fog || sky === 'underwater' || sky === 'storm' ? new THREE.Fog(skyCol, 18, 70) : new THREE.Fog(skyCol, 60, 220);
    const [h, s] = LIGHT[sky] || LIGHT.day;
    hemi.intensity = h; sun.intensity = s;
    sun.color = sky === 'sunset' ? new THREE.Color(0xffc49a) : sky === 'night' ? new THREE.Color(0x9fb4ff) : new THREE.Color(0xffffff);
    ground.visible = c.world.ground !== 'none';
    groundMat.color = GROUND[c.world.ground] != null ? new THREE.Color(GROUND[c.world.ground]) : col(c.world.ground);
    groundMat.emissive = new THREE.Color(c.world.ground === 'lava' ? 0x661500 : 0x000000);
    groundMat.roughness = c.world.ground === 'ice' || c.world.ground === 'water' ? 0.2 : 0.95;
    stars.visible = sky === 'night' || sky === 'space' || !!c.world.stars;
    weather.visible = c.world.weather === 'rain' || c.world.weather === 'snow';
    weather.material.color = new THREE.Color(c.world.weather === 'rain' ? 0x9fc4ff : 0xffffff);
    weather.material.size = c.world.weather === 'rain' ? 0.08 : 0.18;
  }

  function mat(color, glow) {
    const m = new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.55, metalness: 0.05 });
    if (glow) { m.emissive = col(color); m.emissiveIntensity = 0.8; }
    return m;
  }

  function part(geo, m, x = 0, y = 0, z = 0, rx = 0, rz = 0) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.rotation.z = rz;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  function build(t, doodle) {
    const g = new THREE.Group();
    if (doodle) {
      let tex = doodleTex.get(doodle);
      if (!tex) { tex = new THREE.CanvasTexture(doodle); tex.colorSpace = THREE.SRGBColorSpace; doodleTex.set(doodle, tex); }
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      g.add(s); g.userData.sprite = s;
      return g;
    }
    const m = mat(t.color, t.glowOn);
    g.userData.mat = m;
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const S = (r, a = 24, b = 16) => new THREE.SphereGeometry(r, a, b);
    const C = (rt, rb, h, n = 24) => new THREE.CylinderGeometry(rt, rb, h, n);
    const dark = (c) => mat(new THREE.Color(col(c)).multiplyScalar(0.6).getStyle());
    switch (t.shape) {
      case 'sphere': g.add(part(S(0.5), m)); break;
      case 'cube': case 'box': case 'plane': g.add(part(new THREE.BoxGeometry(1, 1, 1, 1, 1, 1), m)); break;
      case 'cylinder': g.add(part(C(0.5, 0.5, 1), m)); break;
      case 'cone': g.add(part(C(0, 0.5, 1), m)); break;
      case 'pyramid': g.add(part(C(0, 0.6, 1, 4), m)); break;
      case 'torus': g.add(part(new THREE.TorusGeometry(0.36, 0.14, 16, 32), m)); break;
      case 'capsule': g.add(part(new THREE.CapsuleGeometry(0.35, 0.3, 8, 16), m)); break;
      case 'coin': m.metalness = 0.35; m.roughness = 0.35; m.emissive = col(t.color); m.emissiveIntensity = 0.25; g.add(part(C(0.5, 0.5, 1, 28), m, 0, 0, 0, Math.PI / 2)); break;
      case 'star': {
        const sh = new THREE.Shape();
        for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.22 : 0.5; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04 });
        geo.center(); g.add(part(geo, m)); break;
      }
      case 'heart': {
        const sh = new THREE.Shape();
        sh.moveTo(0, -0.4); sh.bezierCurveTo(-0.7, 0.05, -0.3, 0.6, 0, 0.2); sh.bezierCurveTo(0.3, 0.6, 0.7, 0.05, 0, -0.4);
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05 });
        geo.center(); g.add(part(geo, m)); break;
      }
      case 'diamond': g.add(part(new THREE.OctahedronGeometry(0.5), m)); m.metalness = 0.3; m.roughness = 0.1; break;
      case 'rock': g.add(part(new THREE.DodecahedronGeometry(0.5, 0), m)); m.flatShading = true; break;
      case 'tree': g.add(part(C(0.08, 0.1, 0.4), dark('brown'), 0, -0.3)); g.add(part(C(0, 0.45, 0.55, 12), m, 0, 0.05)); g.add(part(C(0, 0.35, 0.45, 12), m, 0, 0.3)); break;
      case 'house': g.add(part(B(0.8, 0.55, 0.8), m, 0, -0.2)); g.add(part(C(0, 0.62, 0.45, 4), mat('#b5332e'), 0, 0.28)); g.children[1].rotation.y = Math.PI / 4; g.add(part(B(0.16, 0.28, 0.02), dark('brown'), 0, -0.33, 0.41)); break;
      case 'rocket': g.add(part(C(0.28, 0.32, 0.6, 20), m, 0, 0)); g.add(part(C(0, 0.28, 0.3, 20), mat('red'), 0, 0.45)); for (let i = 0; i < 3; i++) { const f = part(B(0.04, 0.25, 0.25), mat('red'), Math.cos(i * 2.09) * 0.3, -0.3, Math.sin(i * 2.09) * 0.3); f.rotation.y = -i * 2.09; g.add(f); } g.add(part(S(0.12), mat('#ffb020', true), 0, -0.42)); g.add(part(S(0.08), mat('skyblue'), 0, 0.1, 0.27)); break;
      case 'car': g.add(part(B(1, 0.35, 0.55), m, 0, -0.1)); g.add(part(B(0.5, 0.3, 0.5), m, -0.05, 0.22)); for (const x of [-0.32, 0.32]) for (const z of [-0.3, 0.3]) g.add(part(C(0.14, 0.14, 0.1, 16), mat('black'), x, -0.3, z, Math.PI / 2)); break;
      case 'cloud': m.roughness = 1; for (const [x, y, r] of [[-0.25, 0, 0.3], [0.2, 0, 0.32], [0, 0.15, 0.36]]) g.add(part(S(r), m, x, y)); break;
      case 'person': g.add(part(new THREE.CapsuleGeometry(0.28, 0.35, 8, 16), m, 0, -0.08)); g.add(part(S(0.22), mat('#f2c9a0'), 0, 0.35)); g.add(part(S(0.04), mat('black'), 0.2, 0.38, 0.08)); g.add(part(S(0.04), mat('black'), 0.2, 0.38, -0.08)); break;
      case 'fish': g.add(part(S(0.4), m)); g.children[0].scale.set(1, 0.7, 0.45); g.add(part(C(0, 0.25, 0.3, 3), dark(t.color), -0.45, 0, 0, 0, Math.PI / 2)); break;
      case 'bird': g.add(part(S(0.3), m)); g.add(part(C(0, 0.07, 0.18, 8), mat('gold'), 0.35, 0, 0, 0, -Math.PI / 2)); g.add(part(B(0.3, 0.04, 0.5), dark(t.color), -0.05, 0.1)); g.userData.wing = g.children[2]; break;
      case 'ghost': m.transparent = true; m.opacity = 0.85; g.add(part(C(0.4, 0.45, 0.6, 20), m, 0, -0.1)); g.add(part(S(0.4), m, 0, 0.2)); g.add(part(S(0.06), mat('black'), 0.35, 0.25, 0.12)); g.add(part(S(0.06), mat('black'), 0.35, 0.25, -0.12)); break;
      case 'flower': g.add(part(C(0.03, 0.03, 0.6), mat('darkgreen'), 0, -0.2)); for (let i = 0; i < 6; i++) g.add(part(S(0.12), m, Math.cos(i) * 0.16, 0.18, Math.sin(i) * 0.16)); g.add(part(S(0.1), mat('yellow'), 0, 0.2)); break;
      case 'ufo': g.add(part(S(0.5, 24, 12), m)); g.children[0].scale.set(1, 0.3, 1); g.add(part(S(0.22), mat('#9fe3ff'), 0, 0.12)); break;
      case 'bullet': m.emissive = col(t.color); m.emissiveIntensity = 1.2; g.add(part(S(0.5, 10, 8), m)); break;
      case 'mushroom': g.add(part(C(0.15, 0.18, 0.5), mat('beige'), 0, -0.2)); g.add(part(new THREE.SphereGeometry(0.45, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.02)); break;
      case 'snowman': g.add(part(S(0.3), mat('white'), 0, -0.2)); g.add(part(S(0.2), mat('white'), 0, 0.22)); g.add(part(C(0, 0.04, 0.2, 8), mat('orange'), 0.25, 0.22, 0, 0, -Math.PI / 2)); g.add(part(C(0.14, 0.14, 0.18), m, 0, 0.45)); break;
      case 'cat': case 'dog': g.add(part(S(0.3), m, -0.1, -0.05)); g.children[0].scale.set(1.3, 0.8, 0.8); g.add(part(S(0.2), m, 0.3, 0.18)); if (t.shape === 'cat') { g.add(part(C(0, 0.07, 0.14, 4), m, 0.28, 0.38, 0.09)); g.add(part(C(0, 0.07, 0.14, 4), m, 0.28, 0.38, -0.09)); } else g.add(part(B(0.08, 0.2, 0.1), dark(t.color), 0.3, 0.15, 0.17)); break;
      default: g.add(part(S(0.5), m));
    }
    return g;
  }

  function sync(c, doodles) {
    const seen = new Set();
    for (const t of c.things) {
      if (!t.alive) continue;
      const doodle = doodles[t.slot] || null;
      let rec = meshes.get(t.id);
      if (rec && (rec.doodle !== doodle || rec.shape !== t.shape)) { scene.remove(rec.obj); meshes.delete(t.id); rec = null; }
      if (!rec) {
        rec = { obj: build(t, doodle), doodle, shape: t.shape, color: t.color };
        scene.add(rec.obj);
        meshes.set(t.id, rec);
      }
      seen.add(t.id);
      const o = rec.obj;
      o.visible = t.visible;
      o.position.set(t.pos.x + t.offset.x, t.pos.y + t.offset.y, t.pos.z + t.offset.z);
      const sx = t.dims[0] * t.scale * (2 - t.squash), sy = t.dims[1] * t.scale * t.squash, sz = t.dims[2] * t.scale * (2 - t.squash);
      if (o.userData.sprite) o.userData.sprite.scale.set(sx, sy, 1);
      else o.scale.set(sx, sy, sz);
      let yaw = 0;
      if (c.view === 'top' && t.control) yaw = Math.PI / 2 - (t.heading || 0);
      else if (t.facing && t.facing.x < 0) yaw = Math.PI;
      else if (c.view === 'top' && t.heading) yaw = Math.PI / 2 - t.heading;
      o.rotation.set(t.rot.x, t.rot.y + yaw, t.rot.z);
      const m = o.userData.mat;
      if (m) {
        const want = t.flash > 0 ? '#ffffff' : t.color;
        if (rec.color !== want) { m.color = col(want); if (t.glowOn) m.emissive = col(want); rec.color = want; }
        m.transparent = t.opacity < 1 || t.shape === 'ghost';
        if (t.opacity < 1) m.opacity = t.opacity;
      }
      if (o.userData.wing) o.userData.wing.rotation.x = Math.sin(t.age * 14) * 0.7;
    }
    for (const [id, rec] of meshes) if (!seen.has(id)) { scene.remove(rec.obj); meshes.delete(id); }
  }

  function placeCamera(c, dt) {
    const mode = c.world.camera;
    const tgt = c.things.find((t) => t.isPlayer && t.alive);
    let pos, look;
    if (mode === 'orbit') {
      const a = c.time * 0.15;
      pos = new THREE.Vector3(Math.sin(a) * 24, 12, Math.cos(a) * 24); look = new THREE.Vector3(0, 3, 0);
    } else if ((mode === 'chase' || mode === 'third') && tgt) {
      const h = c.view === 'top' ? tgt.heading || 0 : Math.PI / 2 * Math.sign(tgt.facing.x || 1);
      const fwd = new THREE.Vector3(Math.sin(h), 0, -Math.cos(h));
      pos = new THREE.Vector3(tgt.pos.x, tgt.pos.y + 4, tgt.pos.z).addScaledVector(fwd, -9);
      look = new THREE.Vector3(tgt.pos.x, tgt.pos.y + 1, tgt.pos.z).addScaledVector(fwd, 4);
    } else if (c.frame) {
      const f = c.frame;
      const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const d = Math.max(f.w / (2 * vt * camera.aspect), f.h / (2 * vt)) * 1.05 + 2;
      if (c.view === 'top') { pos = new THREE.Vector3(f.x, d * 0.82, -f.y + d * 0.58); look = new THREE.Vector3(f.x, 0, -f.y); }
      else { pos = new THREE.Vector3(f.x, f.y + d * 0.22, d); look = new THREE.Vector3(f.x, f.y, 0); }
    } else if (c.view === 'top') {
      pos = new THREE.Vector3(c.cam.x, 19, (c.cam.z || 0) + 13); look = new THREE.Vector3(c.cam.x, 0, c.cam.z || 0);
    } else {
      pos = new THREE.Vector3(c.cam.x, 7.5, 21); look = new THREE.Vector3(c.cam.x, 5.5, 0);
    }
    if (c.cam.shake > 0) pos.add(new THREE.Vector3((Math.random() - 0.5) * c.cam.shake, (Math.random() - 0.5) * c.cam.shake, 0));
    if (!camera.userData.init) { camera.position.copy(pos); camera.userData.look = look.clone(); camera.userData.init = true; }
    const k = 1 - Math.exp(-6 * dt);
    camera.position.lerp(pos, k);
    camera.userData.look.lerp(look, k);
    camera.lookAt(camera.userData.look);
    sun.position.set(camera.userData.look.x + 8, 18, camera.userData.look.z + 10);
    sun.target.position.copy(camera.userData.look);
    ground.position.x = camera.userData.look.x;
    ground.position.z = camera.userData.look.z;
    stars.position.copy(camera.position);
  }

  function draw(c, doodles = {}, dt = 1 / 60) {
    resize();
    setupWorld(c);
    sync(c, doodles);
    placeCamera(c, dt);
    let i = 0;
    for (const p of c.particles) {
      if (i >= MAXP) break;
      tmp.position.set(p.x, p.y, p.z);
      tmp.scale.setScalar(p.size * Math.max(0.2, p.life / p.max));
      tmp.updateMatrix();
      pMesh.setMatrixAt(i, tmp.matrix);
      pMesh.setColorAt(i, col(p.color));
      i++;
    }
    pMesh.count = i;
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
    if (weather.visible) {
      const arr = wGeo.attributes.position.array;
      const sp = c.world.weather === 'rain' ? 22 : 2;
      for (let j = 0; j < WEATHER_N; j++) {
        arr[j * 3 + 1] -= sp * dt;
        if (c.world.weather === 'snow') arr[j * 3] += Math.sin(c.time + j) * 0.01;
        if (arr[j * 3 + 1] < 0) arr[j * 3 + 1] = 25;
      }
      wGeo.attributes.position.needsUpdate = true;
      weather.position.set(camera.userData.look.x, 0, camera.userData.look.z);
    }
    renderer.render(scene, camera);
  }

  function toPlane(c, px, py) {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(px / r.width * 2 - 1, -(py / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const plane = c.view === 'top' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), 0) : new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return { u: 0, v: 0 };
    return c.view === 'top' ? { u: hit.x, v: -hit.z } : { u: hit.x, v: hit.y };
  }

  function dispose() {
    for (const [, rec] of meshes) scene.remove(rec.obj);
    meshes.clear();
    renderer.dispose();
  }

  function reset() {
    for (const [, rec] of meshes) scene.remove(rec.obj);
    meshes.clear();
    lastKey = '';
    camera.userData.init = false;
  }

  return { draw, toPlane, dispose, reset };
}
