// ===== GLB 资产加载 + 卡通化 + 卡丁车实例 =====
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CARS } from './config.js';

const loader = new GLTFLoader();
let gradTex = null;

function gradientMap() {
  if (gradTex) return gradTex;
  const data = new Uint8Array([90, 160, 235]);
  gradTex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradTex.needsUpdate = true;
  gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
  return gradTex;
}

// 标准材质 → 卡通材质（保留颜色/贴图/自发光）
export function toonify(root) {
  const gm = gradientMap();
  root.traverse(o => {
    if (o.isMesh) {
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const em = src.emissive ? src.emissive.clone() : new THREE.Color(0, 0, 0);
      const strongEmit = em.r + em.g + em.b > 1.2 || (src.emissiveIntensity || 0) > 1.5;
      if (strongEmit) {
        o.material = new THREE.MeshBasicMaterial({ color: src.color ? src.color.clone() : new THREE.Color(1, 1, 1) });
        o.material.color.add(em.multiplyScalar(0.8));
        o.material.name = src.name;
      } else {
        const m = new THREE.MeshToonMaterial({
          color: src.color ? src.color.clone() : new THREE.Color(0.8, 0.8, 0.8),
          map: src.map || null,
          gradientMap: gm,
          emissive: em, emissiveIntensity: src.emissiveIntensity || 0,
        });
        m.name = src.name;
        o.material = m;
      }
      o.castShadow = false; o.receiveShadow = false;
    }
  });
  return root;
}

function loadGLB(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, g => resolve(g.scene), undefined, reject);
  });
}

export async function loadAll(onProgress) {
  const files = {
    kart: 'kart.glb',
    arch: 'arch.glb', boostpad: 'boostpad.glb', itembox: 'itembox.glb',
    missile: 'missile.glb', palm: 'palm.glb', sakura: 'sakura.glb',
    snowtree: 'snowtree.glb', candytree: 'candytree.glb', sign: 'sign.glb',
  };
  const names = Object.keys(files);
  const assets = { karts: [] };
  let done = 0;
  await Promise.all(names.map(async (key) => {
    const g = await loadGLB('models/' + files[key]);
    toonify(g);
    assets[key] = g;
    if (key === 'kart') for (let i = 0; i < 6; i++) assets.karts.push(g);
    done++;
    onProgress && onProgress(done, names.length, key);
  }));
  return assets;
}

// 单一基础车 + 按车型换色/尾翼开关（省 5/6 模型体积）
export function makeKartRig(kartIdx) {
  const car = CARS[kartIdx] || CARS[0];
  const proto = (assetsRef && assetsRef.karts[kartIdx]) || null;
  const rig = { root: new THREE.Group(), wheels: {}, spins: {}, flames: [], visYaw: 0 };
  if (!proto) return rig;
  const inst = proto.clone(true);
  // 材质按名换色（先克隆避免串色）
  const COLOR_KEYS = { Paint: 'paint', Accent: 'accent', Rim: 'rim', Helmet: 'helmet' };
  const matCache = new Map();
  inst.traverse(o => {
    if (!o.isMesh) return;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const key = src.name || '';
    if (COLOR_KEYS[key]) {
      if (!matCache.has(key)) matCache.set(key, src.clone());
      const m = matCache.get(key);
      m.color.set(car[COLOR_KEYS[key]]);
      o.material = m;
    }
  });
  inst.traverse(o => {
    if (!o.name) return;
    if (o.name.startsWith('Wheel')) rig.wheels[o.name.slice(5)] = o;
    else if (o.name.startsWith('Spin')) rig.spins[o.name.slice(4)] = o;
    else if (o.name.startsWith('Flame')) rig.flames.push(o);
    else if (o.name === 'Spoiler') o.visible = !!car.spoiler;
  });
  rig.root.add(inst);
  rig.model = inst;
  // 氮气火焰（隐藏的锥形 + 光晕精灵，由 effects 控制显隐）
  rig.flameMeshes = [];
  for (const anchor of rig.flames) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.9, 10),
      new THREE.MeshBasicMaterial({ color: 0xFFA63C, transparent: true, opacity: 0.95 }));
    cone.rotation.x = Math.PI / 2;   // 尖朝 -z（车尾）
    cone.position.set(0, 0, -0.25);
    anchor.add(cone);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xFFD37A, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    glow.scale.set(0.7, 0.7, 1);
    anchor.add(glow);
    rig.flameMeshes.push(cone);
    rig.flameMeshes.push(glow);
  }
  for (const f of rig.flameMeshes) f.visible = false;
  // 影子贴片
  const sh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 3.0),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.42, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2;
  rig.shadow = sh;
  return rig;
}

let assetsRef = null;
export function setAssets(a) { assetsRef = a; }

let _glowTex = null, _blobTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,220,140,1)');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(cv);
  return _glowTex;
}
function blobTexture() {
  if (_blobTex) return _blobTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(20,20,30,0.75)');
  g.addColorStop(1, 'rgba(20,20,30,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  _blobTex = new THREE.CanvasTexture(cv);
  return _blobTex;
}
