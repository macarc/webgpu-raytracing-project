import { RayTrace, RayTraceProgress } from "../ray_tracing";
import { Material, SAMPLE_RATE } from "../constants";
import { createAudioBufferFrom, IS_ON_MOBILE } from "../helpers/common";
import { readFile, saveFile } from "../helpers/filesystem";
import m from "mithril";
import { fftConvolve, fftConvolvedSize } from "../dsp";
import {
  BoxRoomGeometry,
  fromSavedGeometry,
  Geometry,
  LoadedGeometry,
  RoundGeometry,
  SavedGeometry,
} from "../geometry";
import { encodeWavFileFromAudioBuffer } from "wav-file-encoder";
import { defaultSettings, Settings } from "./settings";
import { error, log } from "../log";

type Menu = "geometry" | "materials" | "raytracing";

const defaultRayTraceProgress: RayTraceProgress = {
  bounceCount: 0,
  secondsElapsed: 0,
  totalSeconds: 0,
  escapedRayCount: 0,
  totalRayCount: 0,
  runTimeMs: 0,
};

type SavedState = {
  type: "webgpu-raytracing-project-state-v2";
  settings: Settings;
  geometry: SavedGeometry | null;
};

function defaultSavedState(): SavedState {
  return {
    type: "webgpu-raytracing-project-state-v2",
    settings: defaultSettings(),
    geometry: null,
  };
}

export let state = {
  settings: defaultSettings(),
  throttle: IS_ON_MOBILE ? 0.8 : 0,
  geometry: new BoxRoomGeometry() as Geometry,
  bounceCoordinates: [] as Float32Array<ArrayBuffer>[],
  menu: "geometry" as Menu,
  raytracedAudio: [] as Float32Array[],
  ctx: null as AudioContext | null,
  running: false,
  progress: defaultRayTraceProgress,
  source: null as AudioBufferSourceNode | null,
  rayTrace: new RayTrace(),
  showNormals: false,
  updatePlot: () => new Promise((res) => res(null)),
  exceededLocalStorage: false,

  initialise: async function () {
    await state.geometry.initialise();
  },

  loadFromLocalStorage: async function () {
    const stored = localStorage.getItem("state");
    if (stored) {
      const obj = JSON.parse(stored);
      if (obj["type"] === "webgpu-raytracing-project-state-v2") {
        try {
          await state.loadFromSaved(obj);
          return;
        } catch {
          error("could not load previously saved model/settings");
        }
      }
    }

    await state.loadFromSaved(defaultSavedState());
    await state.geometry.initialise();
  },

  toSavedState: function (): SavedState {
    return {
      type: "webgpu-raytracing-project-state-v2",
      settings: state.settings,
      geometry: state.geometry.triangles(),
    };
  },

  loadFromSaved: async function (saved: SavedState) {
    state.settings = saved.settings;

    if (saved.geometry !== null) {
      state.geometry = await fromSavedGeometry(saved.geometry);
    } else {
      state.geometry = new BoxRoomGeometry();
    }
  },

  saveToLocalStorage: function () {
    try {
      localStorage.setItem("state", JSON.stringify(state.toSavedState()));
    } catch (e) {
      // Only show this error once to avoid alert pop-ups from annoying the user.
      if (!state.exceededLocalStorage) {
        error(
          "could not save state - this is probably due to exceeding the storage limit.",
        );
        state.exceededLocalStorage = true;
      }
    }
  },

  saveState: function () {
    saveFile(
      "raytracing_model.json",
      JSON.stringify(state.toSavedState()),
      "text/json",
    );
  },

  loadState: function (): Promise<void> {
    return new Promise((res, rej) => {
      // Create a temporary file input element, and use that to
      // prompt the user to select a file
      const f = document.createElement("input") as HTMLInputElement & {
        files: FileList;
      };

      f.setAttribute("type", "file");
      f.setAttribute("accept", ".json,text/json");

      f.addEventListener("change", async () => {
        if (f.files.length === 1) {
          const file = f.files.item(0);
          if (file) {
            const contents = await readFile(file);
            const json = JSON.parse(contents);
            if (json["type"] === "webgpu-raytracing-project-state-v2") {
              try {
                await state.loadFromSaved(json as SavedState);
                res();
                return;
              } catch {
                rej("incorrect file format");
              }
            }
          }
        }
        rej("invalid selection");
      });

      // Trigger the file dialogue
      f.click();
    });
  },

  resetSettings: async function () {
    await state.loadFromSaved(defaultSavedState());
    await state.geometry.initialise();
  },

  setBoxGeometry: async function () {
    state.geometry = new BoxRoomGeometry();
    await state.geometry.initialise();
  },

  setRoundGeometry: async function () {
    state.geometry = new RoundGeometry();
    await state.geometry.initialise();
  },

  setLoadGeometry: async function () {
    state.geometry = new LoadedGeometry();
    await state.geometry.initialise();
  },

  setMenu: function (menu: Menu) {
    state.menu = menu;
  },

  runRaytracing: async function () {
    if (state.running) {
      state.rayTrace.cancel();
      state.running = false;
    } else {
      state.running = true;
      const rayTraceOutput = await state.rayTrace.run(
        {
          sourcePosition: state.settings.sourcePosition,
          sourceDirection: state.settings.sourceDirection,
          receivers: state.settings.receivers,
          geometry: state.geometry.triangles(),
          materials: state.settings.materials,
          rayCount: state.settings.rayCount,
          useWasm: state.settings.useWasm,
          throttle: state.throttle,
          rayPlotCount: state.settings.rayPlotCount,
          bouncePlotCount: state.settings.bouncePlotCount,
          audioDuration: state.settings.audioDuration,
        },
        state.rayTraceUpdate,
      );
      state.raytracedAudio = rayTraceOutput?.audio || [];
      state.bounceCoordinates = rayTraceOutput?.bounceCoordinates || [];
      state.running = false;

      state.updatePlot();
    }
  },

  audioChannelsToPlay: function () {
    const channels = [];
    for (const chan of state.settings.selectedChannels) {
      if (chan < state.raytracedAudio.length) {
        channels.push(state.raytracedAudio[chan]);
      }
    }
    return channels;
  },

  rayTraceUpdate: async function (progress: RayTraceProgress) {
    state.progress = progress;
    m.redraw();
  },

  playAudio: function () {
    // Create an AudioContext if one does not exist.
    if (!state.ctx) {
      state.ctx = new AudioContext({
        sampleRate: SAMPLE_RATE,
      });
    }

    // Stop the audio if it is already playing.
    state.source?.stop();

    const audioBuffer = state.createAudioBuffer(state.ctx);

    if (audioBuffer.numberOfChannels === 0) {
      error("no audio channels selected!");
      return;
    }

    if (audioBuffer.numberOfChannels > 2) {
      error("cannot play audio with more than 2 channels!");
      return;
    }

    // Create the audio gbuffer source to play.
    state.source = state.ctx.createBufferSource();
    state.source.buffer = audioBuffer;

    // Start playing the audio buffer source.
    state.source.connect(state.ctx.destination);
    state.source.start(0);
  },

  downloadAudio: function () {
    // Create an AudioContext if one does not exist.
    if (!state.ctx) {
      state.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    }

    const audioBuffer = state.createAudioBuffer(state.ctx);

    if (audioBuffer.numberOfChannels === 0) {
      return;
    }

    const wavFile = encodeWavFileFromAudioBuffer(audioBuffer, 1 /* float32 */);

    saveFile("raytraced_IR.wav", wavFile, "audio/wav");
  },

  createAudioBuffer: function (ctx: AudioContext): AudioBuffer {
    const audioChannels = state.audioChannelsToPlay();

    const sourceBuffer = ctx.createBuffer(
      audioChannels.length,
      audioChannels[0].length,
      SAMPLE_RATE,
    );
    for (let chan = 0; chan < audioChannels.length; ++chan) {
      const channel = sourceBuffer.getChannelData(chan);
      for (let i = 0; i < audioChannels[0].length; ++i) {
        channel[i] = audioChannels[chan][i];
      }
    }

    return sourceBuffer;
  },

  playConvolved: async function () {
    const audioChannels = state.audioChannelsToPlay();

    // If no ray-tracing has happened, ignore.
    if (audioChannels.length === 0) {
      return;
    }

    // Create an AudioContext if one does not exist.
    if (!state.ctx) {
      state.ctx = new AudioContext({
        sampleRate: SAMPLE_RATE,
      });
    }

    // Stop the audio if it is already playing.
    state.source?.stop();

    // Fetch the audio to be convolved.
    const inputAudio = await fetch("res/speechdirectsound_48.wav");
    const inputAudioArrayBuffer = await inputAudio.arrayBuffer();

    let inputBuffer = await state.ctx.decodeAudioData(inputAudioArrayBuffer);

    if (inputBuffer.sampleRate !== SAMPLE_RATE) {
      error(
        `input has sample rate ${inputBuffer.sampleRate}Hz (can only handle ${SAMPLE_RATE}Hz)`,
      );
      return;
    }

    let numChannels = audioChannels.length;

    let ir = createAudioBufferFrom(state.ctx, audioChannels);

    if (numChannels < inputBuffer.numberOfChannels) {
      if (numChannels === 1) {
        ir = createAudioBufferFrom(
          state.ctx,
          Array(inputBuffer.numberOfChannels).fill(audioChannels[0]),
        );
      } else {
        error(
          `cannot convolve input audio (${inputBuffer.numberOfChannels} channels) with IR (${numChannels})`,
        );
        return;
      }
    }

    if (numChannels > inputBuffer.numberOfChannels) {
      if (inputBuffer.numberOfChannels === 1) {
        const newInputBuffer = state.ctx.createBuffer(
          numChannels,
          inputBuffer.length,
          inputBuffer.sampleRate,
        );
        for (let i = 0; i < numChannels; ++i) {
          newInputBuffer.copyToChannel(inputBuffer.getChannelData(0), i);
        }
        inputBuffer = newInputBuffer;
      } else {
        error(
          `Cannot convolve input audio (${inputBuffer.numberOfChannels} channels) with IR (${numChannels})`,
        );
        return;
      }
    }

    // Create output audio buffer.
    const sourceBuffer = await state.ctx.createBuffer(
      numChannels,
      fftConvolvedSize(inputBuffer, ir),
      SAMPLE_RATE,
    );

    const maxValue = fftConvolve(inputBuffer, ir, sourceBuffer);

    // Create the audio buffer source to play.
    state.source = state.ctx.createBufferSource();
    state.source.buffer = sourceBuffer;

    // Add gain to cancel out volume increate due to multiplication.
    const gain = state.ctx.createGain();
    gain.gain.value = 1 / maxValue;

    // Start playing the audio buffer source.
    state.source.connect(gain);
    gain.connect(state.ctx.destination);
    state.source.start(0);
  },

  setSelectedMaterial: function (e: InputEvent) {
    const newMaterial = (e.target as HTMLInputElement).value;

    if (state.settings.materials.map((m) => m.name).includes(newMaterial)) {
      state.geometry.setTriangleMaterial(
        state.geometry.selectedIndex,
        newMaterial,
      );
    } else {
      error("Unknown material", newMaterial);
    }
  },

  flipNormal: function () {
    if (state.geometry instanceof LoadedGeometry) {
      state.geometry.flipNormal(state.geometry.selectedIndex);
    }
  },

  setMaterialBand: function (
    e: InputEvent,
    material: Material,
    band: "a125" | "a250" | "a500" | "a1000" | "a2000" | "a4000" | "scatter",
  ) {
    const el = e.target as HTMLInputElement;
    const value = parseFloat(el.value);

    if (value !== undefined && 0 <= value && value <= 1) {
      material[band] = value;
    }
  },

  createMaterial: function () {
    const materialName = prompt("Enter material name:");
    if (materialName) {
      state.settings.materials.push({
        name: materialName,
        a125: 0,
        a250: 0,
        a500: 0,
        a1000: 0,
        a2000: 0,
        a4000: 0,
        scatter: 0.2,
      });
    }
  },

  addReceiver: function () {
    state.settings.receivers.push({
      position: [0, 0, 0],
      radius: 0.2,
    });
  },

  deleteReceiver: function () {
    state.settings.receivers.pop();
  },
};
