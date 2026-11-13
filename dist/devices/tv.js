import { $, THREE, makeCanvas, press, ready, screenMaterial, showError, studio } from './studio.js';
import { createVhs } from './vhs.js';
import { createVCRDoor } from '../room/runtime/vcrdoor/vcrdoor.js';
import posts from './posts.js';

const channelBase = 'https://758445d4.berlin-monitor-scene.pages.dev/84d7573f/channels/';
const programs = {
  intro: 'Welcome film', 'anthropic/keep-thinking': 'Anthropic', notion: 'Notion', stripe: 'Stripe',
  slack: 'Slack', microsoft: 'Microsoft', electron: 'Electron', fiddle: 'Electron Fiddle',
  clippy: 'Clippy', lmb: 'Language Model Builder', windows95: 'Windows 95', macintosh: 'macintosh.js',
};
const noMusic = new Set(['slack', 'electron', 'clippy', 'lmb', 'windows95', 'macintosh']);
const modeNames = ['Home', 'Work', 'Posts', 'Underscan', 'H/V delay', 'Blue only'];
const deckNames = ['Play', 'Stop', 'Previous chapter', 'Next chapter', 'Record indicator'];

function teletext(ctx, page) {
  const rows = posts.slice(page * 5, page * 5 + 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1024, 768);
  ctx.fillStyle = '#3838ff';
  ctx.fillRect(48, 96, 928, 148);
  ctx.font = 'bold 79px monospace';
  ctx.fillStyle = '#ffff20';
  ctx.fillText('NIGHTFAX', 83, 194);
  ctx.font = '31px monospace';
  ctx.fillStyle = '#76ffff';
  ctx.fillText('P100    POSTS & NOTES', 53, 73);
  ctx.fillText(`PAGE ${page + 1}/${Math.ceil(posts.length / 5)}`, 810, 73);
  rows.forEach((post, index) => {
    const y = 313 + index * 76;
    ctx.fillStyle = '#72ffff';
    ctx.fillText(String(101 + page * 5 + index), 75, y);
    ctx.fillStyle = index % 2 ? '#ffff20' : '#fff';
    ctx.fillText(post.t.length > 42 ? `${post.t.slice(0, 41)}…` : post.t, 178, y);
    ctx.fillStyle = '#57ff71';
    ctx.fillText(post.d.toUpperCase(), 178, y + 31);
  });
  ctx.fillStyle = '#ffff20';
  ctx.fillText('CLICK SCREEN FOR NEXT PAGE', 75, 737);
}

async function start() {
  const { renderer, model, bind, reset, scene, setFrame } = await studio('tv');
  const mesh = name => model.getObjectByName(name);
  const signal = makeCanvas(1024, 768);
  const ctx = signal.getContext('2d');
  const vhs = createVhs(renderer, signal);
  const screen = mesh('screen');
  screen.position.z += 0.005;
  screen.material = screenMaterial(vhs.texture, 1.6);
  const status = $('#playback-status');
  const choice = $('#tape-choice');
  const tvPower = $('#tv-power');
  const deckPower = $('#deck-power');
  const sound = $('#sound');
  const volume = $('#volume');
  const tracking = $('#tracking');
  const chroma = $('#chroma');
  const modeButtons = [...document.querySelectorAll('[data-mode]')];
  const playButton = $('[data-deck="0"]');
  const stopButton = $('[data-deck="1"]');
  const ejectButton = $('#eject');
  for (const [id, name] of Object.entries(programs)) choice.add(new Option(name, id));
  choice.value = 'intro';

  const door = createVCRDoor(THREE, { root: model, scene });
  const tape = new THREE.Group();
  const parts = model.children.filter(item => item.name.startsWith('tape_'));
  tape.position.copy(parts[0].position);
  tape.quaternion.copy(parts[0].quaternion);
  model.add(tape);
  model.updateMatrixWorld(true);
  for (const item of parts) tape.attach(item);
  tape.position.set(0.13, 0.778, 0.29);
  tape.rotation.set(0, -0.11, 0);
  const rest = tape.position.clone();
  const restRotation = tape.quaternion.clone();
  const neutral = new THREE.Quaternion();
  const front = new THREE.Vector3(-0.07, 0.828, 0.31);
  const inside = front.clone().setZ(0.075);
  const route = new THREE.CatmullRomCurve3([rest, new THREE.Vector3(0.11, 0.869, 0.4), front]);
  tape.visible = false;
  let motion;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const indicator = makeCanvas(384, 128);
  const display = indicator.getContext('2d');
  const displayTexture = new THREE.CanvasTexture(indicator);
  displayTexture.flipY = false;
  displayTexture.colorSpace = THREE.SRGBColorSpace;
  mesh('vfd').material = screenMaterial(displayTexture, 1.65);

  let on = true;
  let deckOn = true;
  let playing = false;
  let loaded = true;
  let input = 0;
  let page = 0;
  let tapeId = 'intro';
  let instance;
  let version = 0;
  let loading = false;
  let failure = false;
  let audio;
  let gain;
  let muted = true;
  let recordUntil = 0;
  let changedAt = -Infinity;
  const toggles = [false, false, false];
  const knobs = [volume, tracking, chroma];
  const knobRotations = knobs.map((_, i) => mesh(`knob_${i}`).rotation.clone());
  const lamps = ['led_power', ...modeNames.map((_, i) => `led_${i}`), 'vcr_led'].map(name => {
    const led = mesh(name);
    led.material = led.material.clone();
    return led;
  });
  function light(led, color) {
    led.material.emissive.set(color ?? '#000');
    led.material.emissiveIntensity = color ? 4 : 0;
  }
  function sync() {
    tvPower.setAttribute('aria-pressed', String(on));
    deckPower.setAttribute('aria-pressed', String(deckOn));
    sound.setAttribute('aria-pressed', String(!muted));
    sound.textContent = muted ? 'Enable sound' : 'Mute';
    modeButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i < 3 ? input === i : toggles[i - 3])));
    light(lamps[0], on ? '#58ff88' : '#ff3020');
    modeNames.forEach((_, i) => light(lamps[i + 1], on && (i < 3 ? input === i : toggles[i - 3]) ? i < 3 ? '#58ff88' : '#ffa42e' : null));
    light(lamps.at(-1), !deckOn || performance.now() < recordUntil ? '#ff3020' : '#58ff88');
    playButton.setAttribute('aria-pressed', String(playing));
    stopButton.setAttribute('aria-pressed', String(!playing));
    ejectButton.disabled = !loaded || Boolean(motion);
    playButton.disabled = Boolean(motion && !loaded);
    choice.disabled = playButton.disabled;
    const text = failure ? 'Signal unavailable · press Play to retry' : !on ? 'TV off' : input === 2 ? 'Posts · Nightfax'
      : !deckOn ? 'VCR off' : !loaded ? 'Tape ejected' : loading || motion ? 'Loading tape…' : playing ? `Playing · ${programs[tapeId]}` : 'Press Play';
    if (status.textContent !== text) status.textContent = text;
    display.fillStyle = '#080d0d';
    display.fillRect(0, 0, 384, 128);
    display.font = 'bold 54px monospace';
    display.fillStyle = deckOn ? '#80ffda' : '#6c847b';
    display.fillText(!deckOn ? '23:04' : !loaded ? 'EJECT' : loading ? 'LOAD' : playing ? 'PLAY' : 'STOP', 20, 86);
    displayTexture.needsUpdate = true;
    instance?.input?.({ type: active() ? 'play' : 'stop' });
  }
  function active() { return on && deckOn && loaded && playing && input !== 2 && !motion && !document.hidden; }

  async function load() {
    const ticket = ++version;
    instance?.stop();
    instance = undefined;
    const id = tapeId;
    loading = true;
    failure = false;
    sync();
    try {
      const get = path => import(`${channelBase}${path}.js`);
      const channel = noMusic.has(id) ? await get(`${id}.nomusic`).catch(() => get(id)) : await get(id);
      if (ticket !== version) return;
      instance = channel.default.mount({ canvas: signal, ctx, width: signal.width, height: signal.height,
        audio: audio ? { ctx: audio, out: gain } : null,
      });
      loading = false;
      sync();
    } catch (error) {
      if (ticket !== version) return;
      console.warn('Tape could not load', error);
      failure = true;
      loading = false;
      playing = false;
      sync();
    }
  }

  function animateTape(inserting) {
    if (motion) return;
    if (reduced) {
      tape.position.copy(inserting ? inside : rest);
      tape.quaternion.copy(inserting ? neutral : restRotation);
      tape.visible = !inserting;
      return;
    }
    tape.position.copy(inserting ? rest : inside);
    tape.quaternion.copy(inserting ? restRotation : neutral);
    tape.visible = true;
    if (inserting) door.insert(tape);
    const lead = inserting ? 0 : door.eject(tape) * 1000;
    motion = { inserting, start: performance.now() + lead };
  }
  function stepTape(time, dt) {
    if (motion) {
      const { inserting, start } = motion;
      const progress = THREE.MathUtils.smoothstep(time, start, start + 870);
      const position = inserting ? progress : 1 - progress;
      if (position < 0.68) tape.position.copy(route.getPoint(position / 0.68));
      else tape.position.lerpVectors(front, inside, (position - 0.68) / 0.32);
      tape.quaternion.slerpQuaternions(restRotation, neutral, Math.min(1, position / 0.58));
      if (progress === 1) {
        if (inserting) door.stow(tape);
        else door.release();
        motion = undefined;
        sync();
      }
    }
    door.frame(dt / 1000);
  }

  function play(id = tapeId) {
    if (motion && !loaded) return;
    const wasLoaded = loaded;
    const needsLoad = id !== tapeId || (!instance && !loading);
    tapeId = id;
    choice.value = id;
    deckOn = loaded = playing = true;
    if (input === 2) input = id === 'intro' ? 0 : 1;
    if (!wasLoaded) animateTape(true);
    ensureAudio();
    changedAt = performance.now();
    if (needsLoad) void load();
    else sync();
  }
  function selectMode(i) {
    press(mesh(`btn_${i}`));
    if (motion && !loaded && i < 2) return;
    if (i >= 3) toggles[i - 3] = !toggles[i - 3];
    else {
      input = i;
      if (i < 2) {
        play(i === 0 ? 'intro' : tapeId === 'intro' ? 'anthropic/keep-thinking' : tapeId);
        return;
      }
    }
    changedAt = performance.now();
    sync();
  }
  function transport(i) {
    press(mesh(`vcr_btn_${i}`));
    deckOn = true;
    if (i === 0) play();
    else if (i === 1) { playing = false; sync(); }
    else if (i === 4) {
      recordUntil = performance.now() + 1400;
      sync();
      setTimeout(sync, 1450);
    } else {
      instance?.input?.({ type: i === 2 ? 'prev' : 'next' });
      changedAt = performance.now();
      sync();
    }
  }
  function eject() {
    if (!loaded || motion) return;
    loaded = playing = false;
    animateTape(false);
    sync();
  }
  function setKnob(i) {
    const value = Number(knobs[i].value);
    const control = mesh(`knob_${i}`);
    control.rotation.copy(knobRotations[i]);
    control.rotateY((0.5 - value) * Math.PI * 1.5);
    if (gain) gain.gain.value = muted ? 0 : Number(volume.value);
  }
  function ensureAudio() {
    if (!audio && typeof AudioContext === 'function') {
      audio = new AudioContext();
      gain = audio.createGain();
      gain.connect(audio.destination);
      setKnob(0);
    }
    audio?.resume().catch(error => console.warn('Sound could not start', error));
  }
  function toggleSound() {
    if (typeof AudioContext !== 'function') return;
    muted = !muted;
    if (!muted) ensureAudio();
    setKnob(0);
    sync();
  }
  function togglePower() { press(mesh('btn_power')); on = !on; changedAt = performance.now(); sync(); }
  function toggleDeck() { press(mesh('vcr_power')); deckOn = !deckOn; changedAt = performance.now(); sync(); }
  tvPower.onclick = togglePower;
  deckPower.onclick = toggleDeck;
  sound.onclick = toggleSound;
  ejectButton.onclick = eject;
  choice.onchange = () => { input = choice.value === 'intro' ? 0 : 1; play(choice.value); };
  $('#screen-view').onclick = () => reset(true);
  bind(mesh('btn_power'), 'TV power', togglePower);
  bind(mesh('vcr_power'), 'VCR power', toggleDeck);
  bind(mesh('vcr_door'), 'Eject tape', eject);
  bind(tape, 'Insert tape', () => play());
  bind(screen, 'View screen', ({ uv }) => {
    if (input === 2 && on) {
      const row = uv ? Math.round(((uv.y - 0.5) * 1.1 + 0.5) * 768 - 313) / 76 : -1;
      const entry = Math.abs(row - Math.round(row)) < 0.39 ? posts[page * 5 + Math.round(row)] : undefined;
      if (entry && row >= -0.35 && row < 4.4) window.open(new URL(entry.u, 'https://felixrieseberg.com/'), '_blank', 'noopener');
      else page = (page + 1) % Math.ceil(posts.length / 5);
    } else reset(true);
  });
  modeButtons.forEach((button, i) => {
    button.onclick = () => selectMode(i);
    bind(mesh(`btn_${i}`), modeNames[i], button.onclick);
  });
  document.querySelectorAll('[data-deck]').forEach((button, i) => {
    button.onclick = () => transport(i);
    bind(mesh(`vcr_btn_${i}`), deckNames[i], button.onclick);
  });
  knobs.forEach((knob, i) => {
    knob.oninput = () => setKnob(i);
    const control = mesh(`knob_${i}`);
    const mark = mesh(`knob_${i}_mark`);
    if (mark) control.attach(mark);
    bind(control, ['Volume', 'Tracking', 'Chroma'][i], () => { knob.value = (Number(knob.value) + 0.2) % 1.05; setKnob(i); });
    setKnob(i);
  });
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || /^(SELECT|INPUT|BUTTON)$/.test(event.target.tagName)) return;
    if (/^[1-6]$/.test(event.key)) selectMode(Number(event.key) - 1);
  });

  let previous = '';
  setFrame((time, dt) => {
    stepTape(time, dt);
    const mode = `${on}/${deckOn}/${loaded}/${playing}/${loading}/${input}/${page}/${toggles}/${tracking.value}/${chroma.value}`;
    const dirty = mode !== previous;
    previous = mode;
    if (!dirty && !active() && time - changedAt > 410) return;
    if (on && input === 2) teletext(ctx, page);
    else if (active() && instance) instance.frame(time, dt);
    else if (dirty && (!instance || !deckOn || !loaded)) {
      ctx.fillStyle = '#0a1244';
      ctx.fillRect(0, 0, signal.width, signal.height);
      ctx.fillStyle = '#e9ecff';
      ctx.font = 'bold 54px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(loading ? 'LOADING TAPE' : deckOn && loaded && !failure ? 'PRESS PLAY' : 'NO SIGNAL', 512, 399);
      ctx.textAlign = 'left';
    }
    const u = vhs.uniforms;
    u.t.value = time / 1000;
    u.g.value = Math.max(0, 0.63 * (1 - (time - changedAt) / 410));
    u.trk.value = Number(tracking.value);
    u.sat.value = Number(chroma.value);
    u.us.value = Number(toggles[0]);
    u.hv.value = Number(toggles[1]);
    u.bo.value = Number(toggles[2]);
    screen.material.emissiveIntensity = on ? 1.6 : 0;
    vhs.draw();
  });
  sync();
  ready();
}

start().catch(error => {
  console.error(error);
  showError('The TV could not load. Reload the page to try again.');
});
