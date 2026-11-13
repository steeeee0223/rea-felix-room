import * as THREE from "three";

import { context2d, element } from "../dom";
import { loadBasic } from "./runtime";
import {
  makeCanvas,
  meshPart,
  part,
  press,
  ready,
  screenMaterial,
  showError,
  studio,
} from "./studio";

const width = 720;
const height = 400;
const marginX = 0.05;
const marginY = 0.065;

function isGeometry(geometry: unknown): geometry is THREE.BufferGeometry {
  return geometry instanceof THREE.BufferGeometry;
}

// The original monitor button shares the bezel's mesh. Separate its triangles so it can be pressed.
function splitPowerButton(monitor: THREE.Object3D) {
  const toLocal = new THREE.Matrix4().copy(monitor.matrixWorld).invert();
  const centroid = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (const mesh of monitor.children) {
    if (!(mesh instanceof THREE.Mesh)) continue;
    const source: unknown = mesh.geometry;
    if (!isGeometry(source)) continue;
    const index = source.index;
    if (!index) continue;
    const position = source.getAttribute("position");
    const matrix = new THREE.Matrix4().multiplyMatrices(
      toLocal,
      mesh.matrixWorld,
    );
    const bezel: number[] = [],
      button: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const face = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      centroid.set(0, 0, 0);
      for (const vertex of face)
        centroid.add(point.fromBufferAttribute(position, vertex));
      centroid.multiplyScalar(1 / 3).applyMatrix4(matrix);
      const isButton =
        Math.abs(centroid.x - 0.128) < 0.0095 &&
        Math.abs(centroid.y - 0.052) < 0.0065 &&
        centroid.z > 0.0012 &&
        centroid.z < 0.009;
      (isButton ? button : bezel).push(...face);
    }
    if (!button.length) continue;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes))
      geometry.setAttribute(name, attribute);
    geometry.setIndex(button);
    source.setIndex(bezel);
    const control = new THREE.Mesh(
      geometry,
      mesh.material instanceof THREE.Material ? mesh.material : undefined,
    );
    control.name = "retro_mbtn";
    control.position.copy(mesh.position);
    control.quaternion.copy(mesh.quaternion);
    control.scale.copy(mesh.scale);
    monitor.add(control);
    return control;
  }
}

async function start() {
  const [
    { model, bind, reset, setFrame },
    [{ mount }, { createPCKeys, KEYS }],
  ] = await Promise.all([studio("computer"), loadBasic()]);
  const input = element("#pc-input", HTMLTextAreaElement);
  const output = element("#pc-output", HTMLElement);
  const power = element("#monitor-power", HTMLButtonElement);
  const screen = meshPart(model, "retro_screen");
  const monitor = part(model, "retro_monitor");
  const lamp = meshPart(model, "retro_led");
  const lampLevel = lamp.material.emissiveIntensity;
  const button = splitPowerButton(monitor);
  const canvas = makeCanvas(width, height);
  const tube = makeCanvas(800, 600);
  const ctx = context2d(tube);
  const texture = new THREE.CanvasTexture(tube);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  screen.material = screenMaterial(texture, 1.48);

  const pc = mount({
    canvas,
    width,
    height,
    start: "ready",
    focused: true,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    open(url) {
      window.open(
        new URL(url, "https://felixrieseberg.com/"),
        "_blank",
        "noopener",
      );
    },
  });
  pc.attachKeyboard(input);
  input.addEventListener("focus", () => pc.input({ type: "focus" }));
  input.addEventListener("blur", () => pc.input({ type: "blur" }));
  const keys = createPCKeys(THREE, { root: model, input });
  const focus = () => input.focus({ preventScroll: true });
  element("#type", HTMLButtonElement).addEventListener("click", focus);
  element("#read-screen", HTMLButtonElement).addEventListener("click", () => {
    reset(true);
    focus();
  });
  bind(screen, "Type on the computer", ({ uv }) => {
    focus();
    if (uv)
      pc.input({
        type: "click",
        u: (uv.x - marginX) / (1 - 2 * marginX),
        v: (uv.y - marginY) / (1 - 2 * marginY),
      });
  });

  const keyboard = model.getObjectByName("retro_keyboard");
  const keyNames: Record<string, string> = {
    esc: "Escape",
    enter: "Enter",
    bksp: "Backspace",
    tab: "Tab",
    space: " ",
    n8: "ArrowUp",
    n4: "ArrowLeft",
    n6: "ArrowRight",
    n2: "ArrowDown",
    "n-": "-",
    "n+": "+",
    "n.": ".",
  };
  const pressKey = ({ object, face }: THREE.Intersection) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry: unknown = object.geometry;
    if (!isGeometry(geometry)) return;
    const attribute = geometry.getAttribute("pcKey");
    const key = attribute && face && KEYS[attribute.getX(face.a) - 1];
    if (!key) return;
    keys?.tap(key.id);
    const value =
      keyNames[key.id] ??
      key.chars[0] ??
      (/^n\d$/.test(key.id) ? key.id[1] : key.codes[0]);
    if (value) pc.input({ type: "keydown", key: value });
  };
  bind(keyboard, "Press a key", pressKey);
  bind(model.getObjectByName("retro_legends"), "Press a key", pressKey);
  bind(model.getObjectByName("retro_legends_light"), "Press a key", pressKey);

  let on = true;
  let switched = -Infinity;
  let previousText = "";
  function togglePower() {
    press(button);
    on = !on;
    switched = performance.now();
    lamp.material.emissiveIntensity = on ? lampLevel : 0;
    power.setAttribute("aria-pressed", String(on));
  }
  power.addEventListener("click", togglePower);
  bind(button, "Monitor power", togglePower);

  const w = tube.width * (1 - 2 * marginX),
    h = tube.height * (1 - 2 * marginY);
  setFrame((time, dt) => {
    keys?.frame(dt / 1000);
    const changed = pc.frame(time, dt);
    if (changed) {
      const text = pc.text();
      if (text !== previousText) output.textContent = previousText = text;
    }
    const elapsed = time - switched;
    if (!changed && elapsed >= 650) return;
    ctx.fillStyle = "#010302";
    ctx.fillRect(0, 0, tube.width, tube.height);
    const scale = on
      ? THREE.MathUtils.smoothstep(elapsed, 120, 480)
      : 1 - THREE.MathUtils.smoothstep(elapsed, 0, 170);
    if (scale > 0)
      ctx.drawImage(
        canvas,
        marginX * tube.width,
        (tube.height - h * scale) / 2,
        w,
        h * scale,
      );
    texture.needsUpdate = true;
  });
  ready();
}

start().catch((error) => {
  console.error(error);
  showError("The computer could not load. Reload the page to try again.");
});
