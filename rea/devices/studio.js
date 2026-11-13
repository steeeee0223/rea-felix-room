import * as THREE from 'three';
import { OrbitControls } from '../room/vendor/addons/controls/OrbitControls.js';
import { GLTFLoader } from '../room/vendor/addons/loaders/GLTFLoader.js';

export { THREE };
export const $ = selector => document.querySelector(selector);

export function makeCanvas(width, height) {
  return Object.assign(document.createElement('canvas'), { width, height });
}

export function screenMaterial(texture, intensity) {
  return new THREE.MeshPhysicalMaterial({
    color: '#090d0b', roughness: 0.19, clearcoat: 1, clearcoatRoughness: 0.08,
    emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: intensity,
  });
}

export function press(mesh, distance = 0.0024) {
  if (mesh) mesh.userData.press = { start: performance.now(), distance };
}

export async function studio(device) {
  const host = $('#device-stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.domElement.addEventListener('webglcontextlost', () => showError('The 3D view stopped. Reload the page to try again.'));
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#242b27');
  const camera = new THREE.PerspectiveCamera(36, 1, 0.005, 15);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enablePan = false;
  orbit.enableDamping = true;
  orbit.maxPolarAngle = Math.PI * 0.49;
  const hemi = new THREE.HemisphereLight('#f9f4e5', '#6d786d', 2.15);
  const key = new THREE.DirectionalLight('#ffe9cc', 2.35);
  key.position.set(-3, 5, 4);
  const rim = new THREE.DirectionalLight('#bdd6ff', 1.1);
  rim.position.set(4, 2, -3);
  scene.add(hemi, key, rim);

  const { scene: model } = await new GLTFLoader().loadAsync(new URL(`${device}.glb`, import.meta.url).href);
  const legend = new THREE.MeshStandardMaterial({ color: '#22201b', roughness: 0.9 });
  const lightLegend = new THREE.MeshStandardMaterial({ color: '#dfd5be', roughness: 0.9 });
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const source = mesh.material;
    mesh.userData.mname = source.name;
    if (/^retro_legends/.test(mesh.name)) {
      mesh.material = mesh.name.endsWith('_light') ? lightLegend : legend;
      return;
    }
    if (/^(t_(btn|knob)_\d|t_power|t_input|rule_input|vcr_t\d)/.test(mesh.name)) {
      mesh.material = lightLegend;
      return;
    }
  });
  scene.add(model);
  model.updateMatrixWorld(true);

  const chassis = model.getObjectByName(device === 'computer' ? 'retro_monitor' : 'tv_chassis');
  const front = new THREE.Vector3(0, 0, 1).transformDirection(chassis.matrixWorld);
  const side = new THREE.Vector3(1, 0, 0).transformDirection(chassis.matrixWorld);
  const hardware = new THREE.Box3();
  for (const item of model.children) {
    if (!item.name.startsWith('tape_')) hardware.expandByObject(item, true);
  }
  const shadow = makeCanvas(128, 128);
  const shadowCtx = shadow.getContext('2d');
  const gradient = shadowCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, '#0008');
  gradient.addColorStop(1, '#0000');
  shadowCtx.fillStyle = gradient;
  shadowCtx.fillRect(0, 0, 128, 128);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 1.0), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadow), transparent: true, depthWrite: false,
  }));
  base.rotation.x = -Math.PI / 2;
  base.position.copy(hardware.getCenter(new THREE.Vector3()));
  base.position.y = hardware.min.y - 0.001;
  scene.add(base);

  const screen = model.getObjectByName(device === 'computer' ? 'retro_screen' : 'screen');
  const corners = box => [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y =>
    [box.min.z, box.max.z].map(z => new THREE.Vector3(x, y, z))));
  const points = [];
  model.traverse(mesh => {
    if (!mesh.isMesh || mesh.name.startsWith('tape_')) return;
    mesh.geometry.computeBoundingBox();
    points.push(...corners(mesh.geometry.boundingBox).map(point => point.applyMatrix4(mesh.matrixWorld)));
  });
  if (device === 'tv') points.push(new THREE.Vector3(0.25, hardware.min.y, 0.36));
  const screenPoints = corners(new THREE.Box3().setFromObject(screen, true));
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const actions = new Map();
  let start;
  let close = false;
  let lastTime = 0;
  let frame = () => {};

  function reset(screenOnly = false) {
    close = screenOnly;
    const sample = screenOnly ? screenPoints : points;
    const direction = front.clone().addScaledVector(side, screenOnly ? 0.04 : device === 'computer' ? 0.02 : -0.27);
    direction.y = screenOnly ? 0.035 : device === 'computer' ? 0.52 : 0.19;
    direction.normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const projection = new THREE.Box3().setFromPoints(sample.map(point => new THREE.Vector3(point.dot(right), point.dot(up), point.dot(direction))));
    const center = projection.getCenter(new THREE.Vector3());
    const target = right.clone().multiplyScalar(center.x).addScaledVector(up, center.y).addScaledVector(direction, center.z);
    const fov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (screenOnly ? 0.87 : 0.82);
    const offset = new THREE.Vector3();
    const distance = Math.max(...sample.map(point => {
      offset.subVectors(point, target);
      return offset.dot(direction) + Math.max(Math.abs(offset.dot(right)) / (fov * camera.aspect), Math.abs(offset.dot(up)) / fov);
    }));
    orbit.target.copy(target);
    camera.position.copy(target).addScaledVector(direction.normalize(), distance);
    orbit.minDistance = 0.26;
    orbit.maxDistance = Math.max(2.7, distance * 1.8);
    orbit.update();
  }

  function resize() {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    reset(close);
  }
  new ResizeObserver(resize).observe(host);
  resize();
  $('#reset-view').addEventListener('click', () => reset());

  function pick(event) {
    const bounds = host.getBoundingClientRect();
    pointer.set(2 * (event.clientX - bounds.left) / bounds.width - 1, 1 - 2 * (event.clientY - bounds.top) / bounds.height);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObject(model, true).find(({ object }) => {
      for (let node = object; node && node !== model; node = node.parent) if (!node.visible) return false;
      return true;
    });
  }
  function actionFor(hit) {
    if (!hit) return;
    for (let mesh = hit.object; mesh && mesh !== model; mesh = mesh.parent) {
      if (actions.has(mesh)) return actions.get(mesh);
    }
  }
  function bind(mesh, label, act) {
    if (mesh) actions.set(mesh, { label, act });
  }
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', event => { start = event.isPrimary && event.button === 0 ? event : undefined; });
  canvas.addEventListener('pointerup', event => {
    if (!start || event.pointerId !== start.pointerId) return;
    const distance = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY);
    start = undefined;
    if (distance > 6) return;
    const hit = pick(event);
    actionFor(hit)?.act(hit);
  });
  canvas.addEventListener('pointercancel', () => { start = undefined; });
  canvas.addEventListener('pointermove', event => {
    if (event.buttons || event.pointerType === 'touch') return;
    const action = actionFor(pick(event));
    canvas.style.cursor = action ? 'pointer' : 'grab';
    const tooltip = $('#device-tooltip');
    tooltip.hidden = !action;
    if (action) tooltip.textContent = action.label;
  });
  canvas.addEventListener('pointerleave', () => { $('#device-tooltip').hidden = true; });

  renderer.setAnimationLoop(time => {
    orbit.update();
    const dt = Math.min(80, lastTime ? time - lastTime : 16);
    lastTime = time;
    for (const mesh of actions.keys()) {
      const effect = mesh.userData.press;
      if (!effect) continue;
      const fraction = Math.min(1, Math.max(0, (time - effect.start) / 170));
      mesh.userData.rest ??= mesh.position.clone();
      mesh.position.copy(mesh.userData.rest);
      mesh.position.z -= Math.sin(fraction * Math.PI) * effect.distance;
      if (fraction === 1) delete mesh.userData.press;
    }
    frame(time, dt);
    renderer.render(scene, camera);
  });
  return { renderer, model, bind, reset, scene, setFrame(fn) { frame = fn; } };
}

export function showError(message) {
  const status = $('#device-status');
  status.textContent = message;
  status.hidden = false;
}

export function ready() {
  $('#device-status').hidden = true;
  $('#device-controls').disabled = false;
  $('#reset-view').disabled = false;
}
