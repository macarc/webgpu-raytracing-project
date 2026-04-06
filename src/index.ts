import { rayTrace, Receiver } from "./ray_tracing";
import {
  isOnMobile,
  Material,
  readFile,
  SAMPLE_RATE,
  saveFile,
  Triangle,
  Vec3,
} from "./constants";
import m from "mithril";
import Plotly, { Data } from "plotly.js-dist";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import FFT from "fft.js";
import { pad } from "./dsp";
import {
  BoxRoomGeometry,
  Geometry,
  LoadedGeometry,
  RoundGeometry,
} from "./geometry";
import { dispose } from "./dispose";

type Menu = "geometry" | "materials" | "raytracing";

type SavedState = {
  type: "webgpu-raytracing-project-state";
  rayCount: number;
  audioDuration: number;
  maxBounces: number;
  sourcePosition: Vec3;
  sourceDirection: Vec3 | null;
  receivers: Receiver[];
  rayPlotCount: number;
  bouncePlotCount: number;
  triangles: Triangle[] | null;
  materials: Material[];
  selectedChannels: number[];
};

const defaultSavedState: SavedState = {
  type: "webgpu-raytracing-project-state",
  rayCount: 20000,
  audioDuration: 10,
  maxBounces: 10000,
  sourcePosition: [0, 0, 0],
  sourceDirection: null,
  receivers: [
    { position: [3.0, -1.0, 0.0], radius: 0.2 },
    { position: [3.0, 1.0, 0.0], radius: 0.2 },
  ],
  rayPlotCount: 10,
  bouncePlotCount: 10,
  triangles: null,
  materials: [
    {
      name: "carpet",
      a125: 0.15,
      a250: 0.25,
      a500: 0.5,
      a1000: 0.6,
      a2000: 0.7,
      a4000: 0.7,
      scatter: 0.2,
    },
    {
      name: "concrete",
      a125: 0.12,
      a250: 0.09,
      a500: 0.07,
      a1000: 0.05,
      a2000: 0.05,
      a4000: 0.04,
      scatter: 0.1,
    },
    {
      name: "plaster",
      a125: 0.14,
      a250: 0.1,
      a500: 0.06,
      a1000: 0.05,
      a2000: 0.04,
      a4000: 0.04,
      scatter: 0.1,
    },
  ],
  selectedChannels: [0],
};

let state = {
  ...defaultSavedState,
  throttle: isOnMobile ? 0.8 : 0,
  geometry: new BoxRoomGeometry() as Geometry,
  bounceCoordinates: [] as Float32Array<ArrayBuffer>[],
  menu: "geometry" as Menu,
  raytracedAudio: [] as Float32Array[],
  ctx: null as AudioContext | null,
  running: false,
  rayTracingProgress: [0, 0] as [number, number],
  source: null as AudioBufferSourceNode | null,

  initialise: async function () {
    await state.geometry.initialise();
  },

  loadFromLocalStorage: async function () {
    const stored = localStorage.getItem("state");
    if (stored) {
      const obj = JSON.parse(stored);
      if (obj["type"] === "webgpu-raytracing-project-state") {
        try {
          state.loadFromSaved(obj);
          return;
        } catch {}
      }
    }

    console.error("Could not load from local storage");
    state.loadFromSaved(defaultSavedState);
    await state.geometry.initialise();
  },

  toSavedState: function (): SavedState {
    return {
      type: "webgpu-raytracing-project-state",
      rayCount: this.rayCount,
      audioDuration: this.audioDuration,
      maxBounces: this.maxBounces,
      sourcePosition: this.sourcePosition,
      sourceDirection: this.sourceDirection,
      receivers: this.receivers,
      rayPlotCount: this.rayPlotCount,
      bouncePlotCount: this.bouncePlotCount,
      triangles: this.geometry.triangles(),
      materials: this.materials,
      selectedChannels: this.selectedChannels,
    };
  },

  loadFromSaved: function (saved: SavedState) {
    state.rayCount = saved.rayCount;
    state.audioDuration = saved.audioDuration;
    state.maxBounces = saved.maxBounces;
    state.sourcePosition = saved.sourcePosition;
    state.sourceDirection = saved.sourceDirection;
    state.receivers = saved.receivers;
    state.rayPlotCount = saved.rayPlotCount;
    state.bouncePlotCount = saved.bouncePlotCount;
    if (saved.triangles !== null) {
      state.geometry = LoadedGeometry.fromTriangles(saved.triangles);
    } else {
      state.geometry = new BoxRoomGeometry();
    }
    state.materials = saved.materials;
    state.selectedChannels = saved.selectedChannels;
  },

  saveToLocalStorage: function () {
    try {
      localStorage.setItem("state", JSON.stringify(state.toSavedState()));
    } catch (e) {
      console.error(
        "Could not save state - this is probably due to exceeding the storage limit.",
      );
      console.log(e);
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
            if (json["type"] === "webgpu-raytracing-project-state") {
              try {
                state.loadFromSaved(json as SavedState);
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
    state.loadFromSaved(defaultSavedState);
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

  setTestGeometry: async function () {
    // state.geometry = new LoadedGeometry("res/auditorium1_scale.glb");
    state.geometry = new LoadedGeometry("res/Modern Bathroom.3dm");
    await state.geometry.initialise();
  },

  setMenu: function (menu: Menu) {
    state.menu = menu;
  },

  runRaytracing: async function () {
    state.running = true;
    const rayTraceOutput = await rayTrace(
      {
        sourcePosition: state.sourcePosition,
        sourceDirection: state.sourceDirection,
        receivers: state.receivers,
        geometry: state.geometry.triangles(),
        materials: state.materials,
        rayCount: state.rayCount,
        throttle: state.throttle,
        maxBounces: state.maxBounces,
        rayPlotCount: state.rayPlotCount,
        bouncePlotCount: state.bouncePlotCount,
        audioDuration: state.audioDuration,
      },
      state.rayTraceUpdate,
    );
    state.raytracedAudio = rayTraceOutput?.audio || [];
    state.bounceCoordinates = rayTraceOutput?.bounceCoordinates || [];
    state.running = false;
    ThreeView.updatePlot();
  },

  audioChannelsToPlay: function () {
    const channels = [];
    for (const chan of state.selectedChannels) {
      if (chan < state.raytracedAudio.length) {
        channels.push(state.raytracedAudio[chan]);
      }
    }
    return channels;
  },

  rayTraceUpdate: async function (bounces: number, totalBounces: number) {
    state.rayTracingProgress = [bounces, totalBounces];
    m.redraw();
  },

  playAudio: function () {
    const audioChannels = state.audioChannelsToPlay();

    // Create an AudioContext if one does not exist.
    if (!state.ctx) {
      state.ctx = new AudioContext({
        sampleRate: SAMPLE_RATE,
      });
    }

    // Stop the audio if it is already playing.
    state.source?.stop();

    if (audioChannels.length === 1) {
      console.log("Playing mono audio");

      // Create the buffer to play.
      const sourceBuffer = state.ctx.createBuffer(
        1,
        audioChannels[0].length,
        SAMPLE_RATE,
      );
      const channel0 = sourceBuffer.getChannelData(0);
      for (let i = 0; i < audioChannels[0].length; ++i) {
        channel0[i] = audioChannels[0][i];
      }

      // Create the audio buffer source to play.
      state.source = state.ctx.createBufferSource();
      state.source.buffer = sourceBuffer;

      // Start playing the audio buffer source.
      state.source.connect(state.ctx.destination);
      state.source.start(0);
    } else if (audioChannels.length === 2) {
      console.log("Playing stereo");

      // Create the buffer to play.
      const sourceBuffer = state.ctx.createBuffer(
        2,
        audioChannels[0].length,
        SAMPLE_RATE,
      );
      const channel0 = sourceBuffer.getChannelData(0);
      const channel1 = sourceBuffer.getChannelData(1);
      for (let i = 0; i < audioChannels[0].length; ++i) {
        channel0[i] = audioChannels[0][i];
        channel1[i] = audioChannels[1][i];
      }

      // Create the audio buffer source to play.
      state.source = state.ctx.createBufferSource();
      state.source.buffer = sourceBuffer;

      // Start playing the audio buffer source.
      state.source.connect(state.ctx.destination);
      state.source.start(0);
    } else {
      console.log("Cannot play audio with ", audioChannels.length, "channels");
    }
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

    // TODO BUG: match sample rate.
    let inputBuffer = await state.ctx.decodeAudioData(inputAudioArrayBuffer);

    // Get the FFT size (a power of two).
    const fftMinSize = Math.max(inputBuffer.length, audioChannels.length);
    // https://stackoverflow.com/a/466256
    const fftSize = Math.pow(2, Math.ceil(Math.log(fftMinSize) / Math.log(2)));

    const f = new FFT(fftSize);

    // Create Fourier-domain arrays.
    const Y = f.createComplexArray();
    const irFFT = f.createComplexArray();

    let numChannels = audioChannels.length;

    const ir = audioChannels.slice();

    if (numChannels < inputBuffer.numberOfChannels) {
      if (numChannels === 1) {
        for (let i = 1; i < numChannels; ++i) {
          ir.push(ir[0]);
        }
      } else {
        console.log(
          `Cannot convolve input audio (${inputBuffer.numberOfChannels} channels) with IR (${numChannels})`,
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
        console.log(
          `Cannot convolve input audio (${inputBuffer.numberOfChannels} channels) with IR (${numChannels})`,
        );
        return;
      }
    }

    // Create output audio buffer.
    const sourceBuffer = await state.ctx.createBuffer(
      numChannels,
      fftSize,
      SAMPLE_RATE,
    );

    let maxValue = -Infinity;

    for (let i = 0; i < numChannels; ++i) {
      // Zero-pad data up to fftSize.
      const paddedInputData = Array.from(
        pad(inputBuffer.getChannelData(i), fftSize),
      );
      const paddedIrData = Array.from(pad(ir[i], fftSize));

      // DFT.
      // Y/irFFT contain interleaved (real, imaginary) samples.
      f.realTransform(Y, paddedInputData);
      f.realTransform(irFFT, paddedIrData);

      // Multiply (complex interleaved) irFFT by Y.
      // Only need to multiply up to fftSize/2 since the other half is
      // empty and populated by completeSpectrum() below.
      for (let i = 0; i <= fftSize / 2; i += 2) {
        const r1 = Y[i];
        const i1 = Y[i + 1];
        const r2 = irFFT[i];
        const i2 = irFFT[i + 1];

        Y[i] = r1 * r2 - i1 * i2;
        Y[i + 1] = r1 * i2 + r2 * i1;
      }

      // Complete Y using Hermitian symmetry (for real audio).
      f.completeSpectrum(Y);

      // Inverse transform audio.
      const output = f.createComplexArray();
      f.inverseTransform(output, Y);

      // Get output channel.
      const outputChannel = sourceBuffer.getChannelData(i);

      // Store every second sample (skipping imaginary samples).
      for (let j = 0; j < fftSize; ++j) {
        outputChannel[j] = output[j * 2];

        maxValue = Math.max(Math.abs(outputChannel[j]), maxValue);
      }
    }

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

    if (state.materials.map((m) => m.name).includes(newMaterial)) {
      state.geometry.setTriangleMaterial(
        state.geometry.selectedIndex,
        newMaterial,
      );
    } else {
      console.error("Unknown material", newMaterial);
    }
  },

  setMaterialBand: function (
    e: InputEvent,
    material: Material,
    band: "a125" | "a250" | "a500" | "a1000" | "a2000" | "a4000",
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
      state.materials.push({
        name: materialName,
        a125: 0,
        a250: 0,
        a500: 0,
        a1000: 0,
        a2000: 0,
        a4000: 0,
        // TODO: scatter
        scatter: 0.2,
      });
    }
  },

  addReceiver: function () {
    state.receivers.push({
      position: [0, 0, 0],
      radius: 0.2,
    });
  },

  deleteReceiver: function () {
    state.receivers.pop();
  },
};

function ScatterPlot(
  id: string,
  layout: Plotly.Layout,
  getData: (audio: Float32Array) => { x: number[]; y: number[] },
): m.Component {
  layout.margin = {
    t: 20,
    b: 20,
    l: 30,
    r: 20,
  };
  const PlotComponent = {
    lastAudio: [] as Float32Array[],
    lastData: [
      {
        x: [],
        y: [],
        type: "scatter",
      },
    ] as Data[],

    data: function (): Data[] {
      const audioToPlot = state.audioChannelsToPlay();
      if (
        audioToPlot.length === PlotComponent.lastAudio.length &&
        audioToPlot.every((chan, i) => chan === PlotComponent.lastAudio[i])
      ) {
        return PlotComponent.lastData;
      }

      PlotComponent.lastData = [];
      PlotComponent.lastAudio = [];

      for (let i = 0; i < audioToPlot.length; ++i) {
        const { x, y } = getData(audioToPlot[i] || []);

        PlotComponent.lastAudio.push(audioToPlot[i]);
        PlotComponent.lastData.push({
          x,
          y,
          type: "scatter",
        });
      }

      return PlotComponent.lastData;
    },
    oncreate: function () {
      Plotly.newPlot(id, PlotComponent.data() as Data[], layout);
    },
    onupdate: function () {
      Plotly.react(id, PlotComponent.data() as Data[], layout);
    },
    view: function () {
      return m("div.plot", { id });
    },
  };

  return PlotComponent;
}

let WaveformPlot = ScatterPlot(
  "waveform-plot",
  {} as Plotly.Layout,
  (audioToPlay: Float32Array) => {
    const x = new Array(audioToPlay.length);
    const y = new Array(audioToPlay.length);

    for (let i = 0; i < audioToPlay.length; ++i) {
      x[i] = i / SAMPLE_RATE;
      y[i] = audioToPlay[i];
    }

    return { x, y };
  },
);

let MagnitudePlot = ScatterPlot(
  "magnitude-plot",
  { yaxis: { type: "log" } } as Plotly.Layout,
  (audioToPlay: Float32Array) => {
    const x = new Array(audioToPlay.length);
    const y = new Array(audioToPlay.length);

    for (let i = 0; i < audioToPlay.length; ++i) {
      x[i] = i / SAMPLE_RATE;
      y[i] = Math.abs(audioToPlay[i]);
    }

    return { x, y };
  },
);

let ThreeView = {
  scene: null as THREE.Scene | null,
  mesh: null as THREE.Mesh | null,
  wireframeMesh: null as THREE.Mesh | null,
  selectedMesh: null as THREE.Mesh | null,
  source: null as THREE.Mesh | null,
  sourceDirection: null as THREE.Line | null,
  receivers: [] as THREE.Mesh[],
  camera: null as THREE.Camera | null,
  rays: [] as THREE.Line[],

  // Since updating the mesh takes a little time (due to re-orienting the triangles),
  // this flag is set when updating to avoid another update interfering (e.g. if the
  // user holds down the up arrow next to the room's x dimension).
  updatingMesh: false,

  // Store the last-used geometry, so that the mesh is only
  // redrawn if it changes (i.e. state.geometry doesn't match).
  geometryData: [] as Triangle[],
  selectedTriangle: -1,

  updatePlot: async function () {
    this.rays.forEach((ray) => {
      this.scene?.remove(ray);
      dispose(ray);
    });
    this.rays = [];

    for (const ray of state.bounceCoordinates) {
      for (let i = 0; i < ray.length - 4; i += 4) {
        const points = [
          new THREE.Vector3(ray[i + 1], ray[i + 2], ray[i + 3]),
          new THREE.Vector3(ray[i + 5], ray[i + 6], ray[i + 7]),
        ];
        const material = new THREE.LineBasicMaterial({
          color: 0x0000ff,
          opacity: ray[i],
          transparent: true,
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        // Required to prevent issues with lines randomly disappearing.
        line.renderOrder = -1;
        this.rays.push(line);
      }
    }

    this.rays.forEach((ray) => {
      this.scene?.add(ray);
    });
  },

  updateMesh: async function () {
    // TODO BUG: this will mean that some updates are skipped, which could include
    //           the final one. There should be a timeout or something to ensure
    //           that the final state is always correct.
    if (ThreeView.updatingMesh) {
      return;
    }

    ThreeView.updatingMesh = true;
    if (!ThreeView.scene) {
      return;
    }

    // Remove the current plotted points if the geometry has changed
    if (ThreeView.geometryData !== state.geometry.triangles()) {
      state.bounceCoordinates = [];
      ThreeView.updatePlot();
    }

    // If the geometry or selection has changed, update it.
    if (
      ThreeView.geometryData !== state.geometry.triangles() ||
      ThreeView.selectedTriangle !== state.geometry.selectedIndex
    ) {
      const unselectedTriangles = state.geometry.triangles().slice();
      unselectedTriangles.splice(state.geometry.selectedIndex, 1);

      const selectedTriangle = state.geometry.selectedTriangle();

      const vertices = new Float32Array(
        state.geometry
          .triangles()
          .flatMap((triangle) => [
            ...triangle.p1,
            ...triangle.p2,
            ...triangle.p3,
          ]),
      );

      // Create geometry.
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

      // Create materials.
      const material = new THREE.MeshBasicMaterial({ color: "red" });
      material.transparent = true;
      material.opacity = 0.1;
      const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: "red",
        wireframe: true,
      });

      const selectedGeometry = new THREE.BufferGeometry();
      if (selectedTriangle) {
        selectedGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            new Float32Array([
              ...selectedTriangle.p1,
              ...selectedTriangle.p2,
              ...selectedTriangle.p3,
              // Backface.
              ...selectedTriangle.p2,
              ...selectedTriangle.p1,
              ...selectedTriangle.p3,
            ]),
            3,
          ),
        );
      } else {
        selectedGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(), 3),
        );
      }
      const selectedMaterial = new THREE.MeshBasicMaterial({ color: "green" });
      selectedMaterial.transparent = true;
      selectedMaterial.opacity = 0.9;

      // Remove old meshes.
      if (ThreeView.mesh) {
        ThreeView.scene.remove(ThreeView.mesh);
        dispose(ThreeView.mesh);
      }
      if (ThreeView.selectedMesh) {
        ThreeView.scene.remove(ThreeView.selectedMesh);
        dispose(ThreeView.selectedMesh);
      }
      if (ThreeView.wireframeMesh) {
        ThreeView.scene.remove(ThreeView.wireframeMesh);
        dispose(ThreeView.wireframeMesh);
      }

      // Create the new meshes.
      ThreeView.mesh = new THREE.Mesh(geometry, material);
      ThreeView.wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
      ThreeView.geometryData = state.geometry.triangles();
      ThreeView.selectedTriangle = state.geometry.selectedIndex;

      ThreeView.selectedMesh = new THREE.Mesh(
        selectedGeometry,
        selectedMaterial,
      );

      // Add the new meshes to the scene.
      if (ThreeView.mesh) {
        ThreeView.scene.add(ThreeView.mesh);
      }
      if (ThreeView.selectedMesh) {
        ThreeView.scene.add(ThreeView.selectedMesh);
      }
      if (ThreeView.wireframeMesh) {
        ThreeView.scene.add(ThreeView.wireframeMesh);
      }
    }

    // Update the source and receiver positions.
    if (ThreeView.source) {
      ThreeView.source.position.set(...state.sourcePosition);
      ThreeView.source.visible = state.geometry.triangles().length > 0;
    }

    if (ThreeView.sourceDirection) {
      ThreeView.scene?.remove(ThreeView.sourceDirection);
      dispose(ThreeView.sourceDirection);
    }

    const sourceDirection = state.sourceDirection;
    if (sourceDirection) {
      const points = [
        new THREE.Vector3(...state.sourcePosition),
        new THREE.Vector3(
          ...state.sourcePosition.map((p, i) => p + sourceDirection[i]),
        ),
      ];
      const material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      // Required to prevent issues with lines randomly disappearing.
      line.renderOrder = -1;

      ThreeView.scene?.add(line);
      ThreeView.sourceDirection = line;
    }

    ThreeView.receivers.map((receiver) => {
      ThreeView.scene?.remove(receiver);
      dispose(receiver);
    });

    ThreeView.receivers = state.receivers.map((receiver) => {
      const receiverMaterial = new THREE.MeshBasicMaterial({
        color: "blue",
      });
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.0),
        receiverMaterial,
      );

      const r = receiver.radius || 0;
      mesh.scale.set(r, r, r);
      mesh.position.set(...receiver.position);
      mesh.visible = state.geometry.triangles().length > 0;
      ThreeView.scene?.add(mesh);
      return mesh;
    });

    ThreeView.updatingMesh = false;
  },

  oncreate: async function (vnode: any) {
    const scene = new THREE.Scene();
    ThreeView.scene = scene;

    ThreeView.camera = new THREE.PerspectiveCamera(
      75,
      vnode.dom.clientWidth / vnode.dom.clientHeight,
      0.1,
      1000,
    );
    // Set z-direction to be up.
    ThreeView.camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      canvas: vnode.dom,
    });

    const sourceMaterial = new THREE.MeshBasicMaterial({
      color: "green",
    });
    const source = new THREE.Mesh(
      new THREE.SphereGeometry(0.2),
      sourceMaterial,
    );
    scene.add(source);
    ThreeView.source = source;

    await ThreeView.updateMesh();

    ThreeView.camera.position.x = 20;
    ThreeView.camera.position.y = -25;
    ThreeView.camera.position.z = 25;

    const orbitControls = new OrbitControls(
      ThreeView.camera,
      renderer.domElement,
    );

    renderer.setSize(vnode.dom.clientWidth, vnode.dom.clientHeight);
    renderer.setClearColor("white");

    const animate = () => {
      orbitControls.update();

      if (ThreeView.camera) {
        renderer.render(scene, ThreeView.camera);
      }
    };
    renderer.setAnimationLoop(animate);
  },
  onupdate: async function () {
    await ThreeView.updateMesh();
  },
  onclick: function (e: MouseEvent) {
    if (ThreeView.camera) {
      const canvas = e.target as HTMLCanvasElement;
      const x = (2 * e.clientX) / canvas.clientWidth - 1;
      const y = 1 - (2 * e.clientY) / canvas.clientHeight;

      const caster = new THREE.Raycaster();
      caster.setFromCamera(new THREE.Vector2(x, y), ThreeView.camera);

      const triangles = state.geometry.triangles();

      const rootObject = new THREE.Group();

      for (let i = 0; i < triangles.length; ++i) {
        const tri = triangles[i];

        const vertices = new Float32Array([
          ...tri.p1,
          ...tri.p2,
          ...tri.p3,
          // Backface.
          ...tri.p2,
          ...tri.p1,
          ...tri.p3,
        ]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(vertices, 3),
        );

        const mesh = new THREE.Mesh(geometry);
        mesh.userData["triangleIndex"] = i;
        rootObject.add(mesh);
      }

      const intersections = caster.intersectObjects([rootObject], true);
      const indices = intersections.map(
        (intersection) =>
          (intersection.object.userData["triangleIndex"] as
            | number
            | undefined) || 0,
      );

      // Get the selected triangle. Clicking multiple times cycles through all triangles
      // under the cursor (starting with the closest one). This allows selecting triangles
      // that are 'hidden' beneath other ones.
      state.geometry.selectedIndex =
        indices[
          (indices.indexOf(state.geometry.selectedIndex) + 1) % indices.length
        ];

      dispose(rootObject);
    }
  },
  view: function () {
    return m("canvas.three", {
      onclick: this.onclick,
    });
  },
};

function geometryMenu() {
  return [
    m("section", [
      m("button", { onclick: state.setBoxGeometry }, "Load box room"),
      m("button", { onclick: state.setRoundGeometry }, "Load sphere"),
      m("button", { onclick: state.setLoadGeometry }, "Load geometry"),
      m("button", { onclick: state.setTestGeometry }, "Load test geometry"),
    ]),
    state.geometry.view(),
    m("section", [
      m("label", [
        "Source position:",
        m("input", {
          type: "number",
          value: state.sourcePosition[0],
          onchange: function (e: InputEvent) {
            state.sourcePosition[0] = parseFloat(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
        m("input", {
          type: "number",
          value: state.sourcePosition[1],
          onchange: function (e: InputEvent) {
            state.sourcePosition[1] = parseFloat(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
        m("input", {
          type: "number",
          value: state.sourcePosition[2],
          onchange: function (e: InputEvent) {
            state.sourcePosition[2] = parseFloat(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
      ]),
      m("label", [
        "Directional source?",
        m("input", {
          type: "checkbox",
          checked: state.sourceDirection !== null,
          onchange: function (event: InputEvent) {
            const checked = (event.target as HTMLInputElement).checked;

            if (checked) {
              state.sourceDirection = [1, 0, 0];
            } else {
              state.sourceDirection = null;
            }
          },
        }),
      ]),
      state.sourceDirection
        ? m("label", [
            "Source direction:",
            m("input", {
              type: "number",
              value: state.sourceDirection?.[0],
              onchange: function (e: InputEvent) {
                if (state.sourceDirection !== null) {
                  state.sourceDirection[0] = parseFloat(
                    (e.target as HTMLInputElement).value,
                  );
                }
              },
            }),
            m("input", {
              type: "number",
              value: state.sourceDirection?.[1],
              onchange: function (e: InputEvent) {
                if (state.sourceDirection !== null) {
                  state.sourceDirection[1] = parseFloat(
                    (e.target as HTMLInputElement).value,
                  );
                }
              },
            }),
            m("input", {
              type: "number",
              value: state.sourceDirection?.[2],
              onchange: function (e: InputEvent) {
                if (state.sourceDirection) {
                  state.sourceDirection[2] = parseFloat(
                    (e.target as HTMLInputElement).value,
                  );
                }
              },
            }),
          ])
        : null,
    ]),

    state.receivers.map((receiver, i) =>
      m("section", [
        m("label", [
          `Receiver ${i} position:`,
          m("input", {
            type: "number",
            value: receiver.position[0],
            onchange: function (e: InputEvent) {
              receiver.position[0] = parseFloat(
                (e.target as HTMLInputElement).value,
              );
            },
          }),
          m("input", {
            type: "number",
            value: receiver.position[1],
            onchange: function (e: InputEvent) {
              receiver.position[1] = parseFloat(
                (e.target as HTMLInputElement).value,
              );
            },
          }),
          m("input", {
            type: "number",
            value: receiver.position[2],
            onchange: function (e: InputEvent) {
              receiver.position[2] = parseFloat(
                (e.target as HTMLInputElement).value,
              );
            },
          }),
        ]),
        m("label", [
          `Receiver ${i} radius (m):`,
          m("input", {
            type: "number",
            min: 0,
            step: 0.05,
            value: receiver.radius,
            onchange: function (e: InputEvent) {
              const r = parseFloat((e.target as HTMLInputElement).value);
              receiver.radius = r;
            },
          }),
        ]),
      ]),
    ),
    m("section", [
      m("button", { onclick: () => state.addReceiver() }, "Add receiver"),
      m("button", { onclick: () => state.deleteReceiver() }, "Delete receiver"),
    ]),
    m("section", [
      m("button", { onclick: () => state.saveState() }, "Save settings"),
      m("button", { onclick: () => state.loadState() }, "Load settings"),
      m(
        "button.reset",
        { onclick: () => state.resetSettings() },
        "Reset all settings",
      ),
    ]),
  ];
}

function materialsMenu() {
  return [
    m("section", [
      m("table.materials", [
        m("tr", [
          m("th", "Material"),
          m("th", "125Hz"),
          m("th", "250Hz"),
          m("th", "500Hz"),
          m("th", "1kHz"),
          m("th", "2kHz"),
          m("th", "4kHz"),
        ]),

        ...state.materials.map((material) =>
          m("tr", [
            m("td.material-name", material.name),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a125,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a125"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a250,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a250"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a500,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a500"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a1000,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a1000"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a2000,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a2000"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a4000,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a4000"),
              }),
            ),
          ]),
        ),
      ]),
      m("button", { onclick: state.createMaterial }, "Create material"),
    ]),
    state.geometry.selectedTriangle()
      ? m("section", [
          m("label", [
            "Selected triangle material:",
            ...state.materials.map((material) =>
              m("label", [
                m("input", {
                  type: "radio",
                  name: "select-material",
                  value: material.name,
                  checked:
                    state.geometry.selectedTriangle()?.material ===
                    material.name,
                  onchange: (e: InputEvent) => state.setSelectedMaterial(e),
                }),
                material.name,
              ]),
            ),
          ]),
        ])
      : null,
  ];
}

function raytracingMenu() {
  return [
    m("section", [
      m("label", [
        "Ray count:",
        m("input", {
          type: "number",
          min: 1,
          value: state.rayCount,
          onchange: function (e: InputEvent) {
            state.rayCount = parseInt((e.target as HTMLInputElement).value);
          },
        }),
      ]),
      m("label", [
        "Output duration (s):",
        m("input", {
          type: "number",
          min: 0,
          step: 0.1,
          value: state.audioDuration,
          onchange: function (e: InputEvent) {
            state.audioDuration = parseFloat(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
      ]),
      m("label", [
        "Throttle amount (%):",
        m("input", {
          type: "number",
          min: 0,
          max: 100,
          step: 1,
          value: state.throttle * 100,
          onchange: function (e: InputEvent) {
            const val = parseInt((e.target as HTMLInputElement).value);

            if (val !== undefined && val >= 0 && val <= 100) {
              state.throttle = val / 100;
            }
          },
        }),
      ]),
      m("label", [
        "Maximum number of bounces:",
        m("input", {
          type: "number",
          min: 0,
          step: 100,
          value: state.maxBounces,
          onchange: function (e: InputEvent) {
            const val = parseInt((e.target as HTMLInputElement).value);

            if (val !== undefined && val >= 0) {
              state.maxBounces = val;
            }
          },
        }),
      ]),
      m("label", [
        "Number of rays to plot:",
        m("input", {
          type: "number",
          min: 0,
          max: state.rayCount,
          step: 1,
          value: state.rayPlotCount,
          onchange: (e: InputEvent) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (val !== undefined && val > 0) {
              state.rayPlotCount = val;
            }
          },
        }),
      ]),
      m("label", [
        "Number of bounces to plot:",
        m("input", {
          type: "number",
          min: 1,
          max: 10000,
          step: 1,
          value: state.bouncePlotCount,
          onchange: (e: InputEvent) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (val !== undefined && val > 0) {
              state.bouncePlotCount = val;
            }
          },
        }),
      ]),
    ]),
    m("section", [
      m(
        "button",
        { disabled: state.running, onclick: state.runRaytracing },
        "Run raytracing",
      ),
      m(
        "div.progress-bar-holder",
        m("div.progress-bar", {
          style: `width: ${(100 * state.rayTracingProgress[0]) / state.rayTracingProgress[1]}%;`,
        }),
      ),
      " ",
      state.rayTracingProgress[0],
      " bounces",
    ]),
    m("section", [
      state.raytracedAudio.length > 0
        ? m(
            "select",
            {
              style: "display: block",
              onchange: (event: InputEvent) => {
                const selectElement = event.target as HTMLSelectElement;
                const channelsToPlay = [];
                for (const option of selectElement.options) {
                  if (option.selected) {
                    channelsToPlay.push(parseInt(option.value));
                  }
                }
                state.selectedChannels = channelsToPlay;
              },
              multiple: true,
            },
            state.raytracedAudio.map((_, i) =>
              m(
                "option",
                { value: i, selected: state.selectedChannels.includes(i) },
                `Channel ${i}`,
              ),
            ),
          )
        : null,
      m(
        "button",
        {
          disabled: state.raytracedAudio.length === 0,
          onclick: state.playAudio,
        },
        "Play audio",
      ),
      m(
        "button",
        {
          disabled: state.raytracedAudio.length === 0,
          onclick: state.playConvolved,
        },
        "Play convolved audio",
      ),
    ]),
    m(WaveformPlot),
    m(MagnitudePlot),
  ];
}

let AppView = {
  onupdate: function () {
    state.saveToLocalStorage();
  },
  view: function () {
    return m("div.root-container", [
      m(ThreeView),
      m("div.sidebar", [
        m("div.topbar", [
          m(
            "div.tab",
            {
              class: state.menu === "geometry" ? "selected" : "",
              onclick: () => state.setMenu("geometry"),
            },
            "Geometry",
          ),
          m("div.tab-gap"),
          m(
            "div.tab",
            {
              class: state.menu === "materials" ? "selected" : "",
              onclick: () => state.setMenu("materials"),
            },
            "Materials",
          ),
          m("div.tab-gap"),
          m(
            "div.tab",
            {
              class: state.menu === "raytracing" ? "selected" : "",
              onclick: () => state.setMenu("raytracing"),
            },
            "Raytracing",
          ),
        ]),
        m("section.menu-container", [
          state.menu === "geometry" ? geometryMenu() : null,
          state.menu === "materials" ? materialsMenu() : null,
          state.menu === "raytracing" ? raytracingMenu() : null,
        ]),
      ]),
    ]);
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  await state.loadFromLocalStorage();

  const root = document.querySelector("#root");
  if (root) {
    m.mount(root, AppView);
  }
});
