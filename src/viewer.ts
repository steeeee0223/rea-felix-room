import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const path = `${import.meta.env.BASE_URL}assets/`;
const props = ["wm", "fl", "ht"] as const;

export type ModelId = "room" | (typeof props)[number];

interface Atlas {
  light: THREE.Texture;
  albedo: THREE.Texture | undefined;
  gamma: number;
  strength: number;
}

function atlasName(node: THREE.Object3D | null): string | undefined {
  const name: unknown = node?.userData.atlas;
  return typeof name === "string" ? name : undefined;
}
const obsolete = new Set([
  "gear_walkman",
  "gear_walkman_glass",
  "gear_floppies",
  "radiator_top",
  "radiator_bot",
  "radiator_pipe",
  "radiator_valve",
  "radiator_foot",
  "radiator_foot001",
  "radiator_col",
  ...Array.from(
    { length: 43 },
    (_, i) => `radiator_col${String(i + 1).padStart(3, "0")}`,
  ),
]);

async function checkedFetch(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Unable to load ${url} (${response.status})`);
  return response;
}

async function loadRoomBuffer() {
  const parts = await Promise.all(
    ["aa", "ab", "ac"].map(async (part) => {
      const response = await checkedFetch(`${path}model/room-${part}`);
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes.buffer;
}

function makeMaterials(root: THREE.Object3D, atlases: Record<string, Atlas>) {
  const replacements = new Map<string, THREE.MeshStandardMaterial>();
  root.traverse((mesh) => {
    if (!(mesh instanceof THREE.Mesh)) return;
    const geometry: unknown = mesh.geometry;
    if (
      !(geometry instanceof THREE.BufferGeometry) ||
      !geometry.hasAttribute("uv1")
    )
      return;
    const name = atlasName(mesh) ?? atlasName(mesh.parent);
    const atlas = name === undefined ? undefined : atlases[name];
    if (!atlas || mesh.name.startsWith("book_encyclopedia")) return;
    const source: unknown = mesh.material;
    if (!(source instanceof THREE.MeshStandardMaterial)) return;
    if (
      source.transparent ||
      (source instanceof THREE.MeshPhysicalMaterial &&
        source.transmission > 0) ||
      (source.metalness > 0.5 && !source.metalnessMap)
    )
      return;
    if (["window_glass", "screen", "gear_cord_beige"].includes(source.name))
      return;
    const key = source.uuid + name;
    let material = replacements.get(key);
    if (!material) {
      material = source.clone();
      if (atlas.albedo) {
        material.map = atlas.albedo;
        material.color.setRGB(1, 1, 1);
      }
      material.lightMap = atlas.light;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.atlasGamma = { value: atlas.gamma };
        shader.uniforms.atlasStrength = { value: atlas.strength };
        shader.fragmentShader =
          "uniform float atlasGamma; uniform float atlasStrength;\n" +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `
          #include <emissivemap_fragment>
          vec3 recoveredLight = pow(texture2D(lightMap, vLightMapUv).rgb, vec3(atlasGamma));
          totalEmissiveRadiance += recoveredLight * diffuseColor.rgb * atlasStrength;
        `,
        );
      };
      material.lightMapIntensity = 0;
      material.customProgramCacheKey = () => "recovered-room-lightmap";
      replacements.set(key, material);
    }
    mesh.material = material;
  });
}

export function createViewer(host: HTMLElement, onUnavailable: () => void) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    onUnavailable();
  });
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#272f2b");
  const camera = new THREE.PerspectiveCamera(32, 1, 0.002, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;

  scene.add(new THREE.HemisphereLight("#e7e8d7", "#5f4a38", 0.95));
  const keyLight = new THREE.DirectionalLight("#ffe3bd", 1.45);
  keyLight.position.set(-3, 4, 5);
  scene.add(keyLight);
  const fill = new THREE.DirectionalLight("#adc7de", 0.5);
  fill.position.set(4, 3, -2);
  scene.add(fill);
  const base = new THREE.Group();
  scene.add(base);

  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const atlases = new Map<string, Promise<Atlas>>();
  const cache = new Map<ModelId, Promise<THREE.Group>>();
  let metadata: Promise<unknown> | undefined;
  let active: { id: ModelId; model: THREE.Group } | undefined;
  let frame = 0;

  function render() {
    frame = 0;
    if (active) renderer.render(scene, camera);
  }
  function requestRender() {
    if (active && !frame) frame = requestAnimationFrame(render);
  }
  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    requestRender();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  controls.addEventListener("change", requestRender);

  function getAtlas(name: string): Promise<Atlas> {
    const cached = atlases.get(name);
    if (cached) return cached;
    const job = (async () => {
      metadata ??= checkedFetch(path + "bake/bake.json")
        .then((response) => response.json())
        .catch((error: unknown) => {
          metadata = undefined;
          throw error;
        });
      const data = await metadata;
      const config: unknown =
        data && typeof data === "object"
          ? Object.getOwnPropertyDescriptor(data, name)?.value
          : undefined;
      if (
        !config ||
        typeof config !== "object" ||
        !("g" in config) ||
        !("A" in config) ||
        typeof config.g !== "number" ||
        typeof config.A !== "number"
      ) {
        throw new Error(`Missing bake metadata for ${name}`);
      }
      const [light, albedo] = await Promise.all([
        textureLoader.loadAsync(`${path}bake/${name}_irrA.jpg`),
        name.startsWith("props")
          ? undefined
          : textureLoader.loadAsync(`${path}bake/${name}_albedo.jpg`),
      ]);
      for (const texture of [light, albedo]) {
        if (!texture) continue;
        texture.channel = 1;
        texture.flipY = false;
        texture.needsUpdate = true;
      }
      if (albedo) albedo.colorSpace = THREE.SRGBColorSpace;
      return { light, albedo, gamma: config.g, strength: config.A };
    })().catch((error: unknown) => {
      atlases.delete(name);
      throw error;
    });
    atlases.set(name, job);
    return job;
  }

  async function readModel(id: ModelId) {
    const result =
      id === "room"
        ? await loader.parseAsync(await loadRoomBuffer(), "")
        : await loader.loadAsync(`${path}model/${id}.glb`);
    const model = result.scene;
    const atlasNames = new Set<string>();
    model.traverse((node) => {
      const name = atlasName(node);
      if (name) atlasNames.add(name);
      const source: unknown =
        node instanceof THREE.Mesh ? node.material : undefined;
      if (
        node instanceof THREE.Mesh &&
        source instanceof THREE.MeshPhysicalMaterial &&
        source.transmission > 0
      ) {
        const glass = source.clone();
        glass.transmission = 0;
        glass.transparent = true;
        glass.opacity = 0.16;
        glass.depthWrite = false;
        glass.roughness = 0.08;
        node.material = glass;
      }
      if (
        id === "room" &&
        (obsolete.has(node.name) ||
          /^tv_(slat|vent)_(top|side|rear)/.test(node.name))
      )
        node.visible = false;
    });
    const mapping = Object.fromEntries(
      await Promise.all(
        [...atlasNames].map(
          async (name) => [name, await getAtlas(name)] as const,
        ),
      ),
    );
    makeMaterials(model, mapping);
    return model;
  }

  function load(id: ModelId): Promise<THREE.Group> {
    const cached = cache.get(id);
    if (cached) return cached;
    const job = (async () => {
      if (id !== "room") return readModel(id);
      const [room, ...extras] = await Promise.all([
        readModel("room"),
        ...props.map(load),
      ]);
      for (const extra of extras) room.add(extra.clone(true));
      return room;
    })().catch((error: unknown) => {
      cache.delete(id);
      throw error;
    });
    cache.set(id, job);
    return job;
  }

  function reset() {
    if (!active) return;
    if (active.id === "room") {
      controls.target.set(0.04, 1.1, 0.02);
      const direction = new THREE.Vector3(-0.13, 0.1, 1).normalize();
      camera.position.copy(controls.target).addScaledVector(direction, 1.75);
      controls.minDistance = 0.42;
      controls.maxDistance = 2.25;
      controls.minAzimuthAngle = -0.9;
      controls.maxAzimuthAngle = 0.9;
      controls.minPolarAngle = 0.6;
      controls.maxPolarAngle = 1.6;
    } else {
      const bounds = new THREE.Box3().setFromObject(active.model);
      const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
      controls.target.copy(bounds.getCenter(new THREE.Vector3()));
      const direction = new THREE.Vector3(
        0.65,
        active.id === "fl" ? 1.45 : 0.72,
        1,
      ).normalize();
      const halfAngle = THREE.MathUtils.degToRad(camera.fov / 2);
      const angle = Math.atan(Math.tan(halfAngle) * Math.min(1, camera.aspect));
      camera.position
        .copy(controls.target)
        .addScaledVector(direction, (radius / Math.sin(angle)) * 1.12);
      controls.minDistance = radius * 0.7;
      controls.maxDistance = radius * 8;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.minPolarAngle = 0.02;
      controls.maxPolarAngle = Math.PI - 0.02;
    }
    controls.update();
    requestRender();
  }

  return {
    load,
    show(id: ModelId, model: THREE.Group) {
      active = { id, model };
      base.clear();
      base.add(model);
      resize();
      reset();
      render();
    },
    reset,
    pause() {
      active = undefined;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
