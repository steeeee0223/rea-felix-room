import { $, THREE, makeCanvas, press, ready, screenMaterial, showError, studio } from './studio.js';
import { mount } from '../room/runtime/pc/basic.js';
import { createPCKeys, KEYS } from '../room/runtime/pckeys/pckeys.js';

const width = 720;
const height = 400;
const marginX = 0.05;
const marginY = 0.065;

// The original monitor button shares the bezel's mesh. Separate its triangles so it can be pressed.
function splitPowerButton(monitor) {
  const toLocal = new THREE.Matrix4().copy(monitor.matrixWorld).invert();
  const centroid = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (const mesh of monitor.children) {
    const index = mesh.geometry?.index;
    if (!index) continue;
    const position = mesh.geometry.attributes.position;
    const matrix = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
    const bezel = [], button = [];
    for (let i = 0; i < index.count; i += 3) {
      const face = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      centroid.set(0, 0, 0);
      for (const vertex of face) centroid.add(point.fromBufferAttribute(position, vertex));
      centroid.multiplyScalar(1 / 3).applyMatrix4(matrix);
      const isButton = Math.abs(centroid.x - 0.128) < 0.0095 && Math.abs(centroid.y - 0.052) < 0.0065
        && centroid.z > 0.0012 && centroid.z < 0.009;
      (isButton ? button : bezel).push(...face);
    }
    if (!button.length) continue;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(button);
    mesh.geometry.setIndex(bezel);
    const control = new THREE.Mesh(geometry, mesh.material);
    control.name = 'retro_mbtn';
    control.position.copy(mesh.position);
    control.quaternion.copy(mesh.quaternion);
    control.scale.copy(mesh.scale);
    monitor.add(control);
    return control;
  }
}

async function start() {
  const { model, bind, reset, setFrame } = await studio('computer');
  const input = $('#pc-input');
  const output = $('#pc-output');
  const power = $('#monitor-power');
  const screen = model.getObjectByName('retro_screen');
  const monitor = model.getObjectByName('retro_monitor');
  const lamp = model.getObjectByName('retro_led');
  const lampLevel = lamp.material.emissiveIntensity;
  const button = splitPowerButton(monitor);
  const canvas = makeCanvas(width, height);
  const tube = makeCanvas(800, 600);
  const ctx = tube.getContext('2d');
  const texture = new THREE.CanvasTexture(tube);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  screen.material = screenMaterial(texture, 1.48);

  const pc = mount({ canvas, width, height, start: 'ready', focused: true,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    open(url) { window.open(new URL(url, 'https://felixrieseberg.com/'), '_blank', 'noopener'); },
  });
  pc.attachKeyboard(input);
  input.addEventListener('focus', () => pc.input({ type: 'focus' }));
  input.addEventListener('blur', () => pc.input({ type: 'blur' }));
  const keys = createPCKeys(THREE, { root: model, input });
  const focus = () => input.focus({ preventScroll: true });
  $('#type').addEventListener('click', focus);
  $('#read-screen').addEventListener('click', () => { reset(true); focus(); });
  bind(screen, 'Type on the computer', ({ uv }) => {
    focus();
    if (uv) pc.input({ type: 'click', u: (uv.x - marginX) / (1 - 2 * marginX), v: (uv.y - marginY) / (1 - 2 * marginY) });
  });

  const keyboard = model.getObjectByName('retro_keyboard');
  const keyNames = { esc: 'Escape', enter: 'Enter', bksp: 'Backspace', tab: 'Tab', space: ' ',
    n8: 'ArrowUp', n4: 'ArrowLeft', n6: 'ArrowRight', n2: 'ArrowDown', 'n-': '-', 'n+': '+', 'n.': '.' };
  const pressKey = ({ object, face }) => {
    const attribute = object.geometry.getAttribute('pcKey');
    const key = attribute && face && KEYS[attribute.getX(face.a) - 1];
    if (!key) return;
    keys.tap(key.id);
    const value = keyNames[key.id] ?? key.chars[0] ?? (/^n\d$/.test(key.id) ? key.id[1] : key.codes[0]);
    if (value) pc.input({ type: 'keydown', key: value });
  };
  bind(keyboard, 'Press a key', pressKey);
  bind(model.getObjectByName('retro_legends'), 'Press a key', pressKey);
  bind(model.getObjectByName('retro_legends_light'), 'Press a key', pressKey);

  let on = true;
  let switched = -Infinity;
  let previousText = '';
  function togglePower() {
    press(button);
    on = !on;
    switched = performance.now();
    lamp.material.emissiveIntensity = on ? lampLevel : 0;
    power.setAttribute('aria-pressed', String(on));
  }
  power.addEventListener('click', togglePower);
  bind(button, 'Monitor power', togglePower);

  const w = tube.width * (1 - 2 * marginX), h = tube.height * (1 - 2 * marginY);
  setFrame((time, dt) => {
    keys?.frame(dt / 1000);
    const changed = pc.frame(time, dt);
    if (changed) {
      const text = pc.text();
      if (text !== previousText) output.textContent = previousText = text;
    }
    const elapsed = time - switched;
    if (!changed && elapsed >= 650) return;
    ctx.fillStyle = '#010302';
    ctx.fillRect(0, 0, tube.width, tube.height);
    const scale = on ? THREE.MathUtils.smoothstep(elapsed, 120, 480) : 1 - THREE.MathUtils.smoothstep(elapsed, 0, 170);
    if (scale > 0) ctx.drawImage(canvas, marginX * tube.width, (tube.height - h * scale) / 2, w, h * scale);
    texture.needsUpdate = true;
  });
  ready();
}

start().catch(error => {
  console.error(error);
  showError('The computer could not load. Reload the page to try again.');
});
