import { element } from "./dom";
import type { ModelId } from "./viewer";

const models = {
  room: {
    label: "Room overview",
    alt: "Recovered desk, CRT monitor, and cassette tapes in the room",
    description:
      "The browser-exported interior, including the CRT, VCR, tapes, and desk props. The separately shipped models are placed where they appear in the room.",
  },
  wm: {
    label: "Cassette player",
    alt: "Portable cassette player with a radio dial and a visible tape compartment",
    description:
      "The portable radio cassette player has a separate model with its own baked texture atlas. Orbit it to inspect the controls and tape compartment.",
  },
  fl: {
    label: "Floppy disks",
    alt: "Three recovered floppy disks with colored shells and paper labels",
    description:
      "A stack of three 3½-inch floppy disks, shipped as a separate close-up model with its own texture atlas.",
  },
  ht: {
    label: "Heater",
    alt: "Recovered radiator with vertical columns and a valve",
    description:
      "The radiator beneath the window. The browser replaces an older group of radiator parts with this separately shipped model.",
  },
};

const stage = element("#stage", HTMLElement);
const still = element("#still", HTMLImageElement);
const progress = element("#progress", HTMLElement);
const hint = element("#hint", HTMLElement);
const reset = element("#reset", HTMLButtonElement);
const mode = element("#view-mode", HTMLButtonElement);
const notice = element("#notice", HTMLElement);
const buttons = [
  ...document.querySelectorAll<HTMLButtonElement>("button[data-model]"),
];

let selected: ModelId = "room";
let stillMode = false;
let viewer: ReturnType<typeof import("./viewer").createViewer> | undefined;
let generation = 0;
let unavailable = false;

function setPresentation(live: boolean, message = "") {
  stage.dataset.mode = live ? "live" : "still";
  still.setAttribute("aria-hidden", String(live));
  reset.disabled = !live;
  hint.textContent = live
    ? "Drag to orbit · Scroll or pinch to zoom"
    : "Still preview";
  notice.textContent = message;
  notice.hidden = !message;
  if (!live) viewer?.pause();
}

function showUnavailable() {
  unavailable = true;
  progress.hidden = true;
  mode.disabled = true;
  setPresentation(
    false,
    "Interactive 3D is unavailable in this browser. All four stills are available.",
  );
}

async function showModel() {
  const request = ++generation;
  setPresentation(false);
  progress.hidden = true;
  if (!viewer || stillMode || unavailable) return;
  progress.hidden = false;
  try {
    const model = await viewer.load(selected);
    if (request !== generation || unavailable) return;
    viewer.show(selected, model);
    setPresentation(true);
  } catch (error) {
    if (request !== generation || unavailable) return;
    console.error("Model load failed", error);
    setPresentation(
      false,
      "The model could not load. Switch to Still view and back to retry.",
    );
  } finally {
    if (request === generation) progress.hidden = true;
  }
}

function select(key: ModelId) {
  selected = key;
  const model = models[key];
  still.src = `${import.meta.env.BASE_URL}assets/stills/${key}.jpg`;
  still.alt = model.alt;
  element("#stage-label", HTMLElement).textContent = model.label;
  element("#model-description", HTMLElement).textContent = model.description;
  for (const button of buttons) {
    const active = button.dataset.model === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  void showModel();
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    const id = button.dataset.model;
    if (id === "room" || id === "wm" || id === "fl" || id === "ht") select(id);
  });
}
reset.addEventListener("click", () => viewer?.reset());
mode.addEventListener("click", () => {
  stillMode = !stillMode;
  mode.textContent = stillMode ? "Interactive 3D" : "Still view";
  void showModel();
});

try {
  const { createViewer } = await import("./viewer");
  viewer = createViewer(element("#canvas", HTMLElement), showUnavailable);
  mode.disabled = false;
  void showModel();
} catch (error) {
  console.error("Viewer initialization failed", error);
  showUnavailable();
}
