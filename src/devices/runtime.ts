import type * as THREE from "three";

interface PlaybackInput {
  type: "play" | "stop" | "prev" | "next";
}

interface ChannelInstance {
  frame(time: number, dt: number): void;
  input?(event: PlaybackInput): void;
  stop(): void;
}

interface ChannelOptions {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  audio: { ctx: AudioContext; out: GainNode } | null;
}

export interface ChannelModule {
  default: { mount(options: ChannelOptions): ChannelInstance };
}

type PcInput =
  | { type: "focus" | "blur" }
  | { type: "click"; u: number; v: number }
  | { type: "keydown"; key: string };

interface BasicModule {
  mount(
    this: void,
    options: {
      canvas: HTMLCanvasElement;
      width: number;
      height: number;
      start: "ready";
      focused: boolean;
      reducedMotion: boolean;
      open(url: string): void;
    },
  ): {
    attachKeyboard(input: HTMLTextAreaElement): void;
    input(event: PcInput): void;
    frame(time: number, dt: number): boolean;
    text(): string;
  };
}

interface KeysModule {
  KEYS: readonly {
    id: string;
    chars: readonly string[];
    codes: readonly string[];
  }[];
  createPCKeys(
    this: void,
    three: typeof THREE,
    options: { root: THREE.Object3D; input: HTMLTextAreaElement },
  ): { tap(id: string): void; frame(dt: number): void } | null;
}

interface VcrModule {
  createVCRDoor(
    this: void,
    three: typeof THREE,
    options: { root: THREE.Object3D; scene: THREE.Scene },
  ): {
    insert(tape: THREE.Group): void;
    eject(tape: THREE.Group): number;
    stow(tape: THREE.Group): void;
    release(): void;
    frame(dt: number): void;
  };
}

// This boundary describes the local, versioned room scripts copied into the build.
const base = `${import.meta.env.BASE_URL}room/runtime/`;

async function loadRecovered<T>(path: string): Promise<T> {
  const url = new URL(base + path, location.origin).href;
  const module: unknown = await import(/* @vite-ignore */ url);
  return module as T;
}

export function loadBasic(): Promise<[BasicModule, KeysModule]> {
  return Promise.all([
    loadRecovered<BasicModule>("pc/basic.js"),
    loadRecovered<KeysModule>("pckeys/pckeys.js"),
  ]);
}

export function loadVcr(): Promise<VcrModule> {
  return loadRecovered<VcrModule>("vcrdoor/vcrdoor.js");
}
