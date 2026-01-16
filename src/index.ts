import { rayTrace } from "./ray_tracing";
import { SAMPLE_RATE, Triangle, Vec3 } from "./constants";
import m from "mithril";
import Plotly, { Data } from "plotly.js-dist";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { orientTriangles } from "./orient_surfaces";
import { boxRoom } from "./geometry_data";

const INITIAL_GEOMETRY_DIMENSIONS = [10, 10, 5];

let state = {
  rayCount: 20000,
  minBounces: 10000,
  audioDuration: 10,
  // NOTE: placing at the exact origin [0,0,0] causes artefacts.
  // TODO: once diffusion has been implemented, try [0,0,0] again.
  sourcePosition: [0, 0, 0] as Vec3,
  receiverPosition: [3.0, 0.0, 0.0] as Vec3,
  geometryDimensions: [10, 10, 5] as Vec3,
  geometry: boxRoom({
    xDim: INITIAL_GEOMETRY_DIMENSIONS[0],
    yDim: INITIAL_GEOMETRY_DIMENSIONS[1],
    zDim: INITIAL_GEOMETRY_DIMENSIONS[2],
    floorMaterial: "carpet",
    wallMaterial: "plaster",
    ceilingMaterial: "plaster",
  }),

  audioToPlay: null as Float32Array | null,
  ctx: null as AudioContext | null,
  running: false,
  rayTracingProgress: [0, 0] as [number, number],
  source: null as AudioBufferSourceNode | null,

  updateGeometry: function () {
    // Don't update the geometry if there's a zero in it (this may occur if the user
    // deletes the value before typing another).
    if (
      state.geometryDimensions.includes(0) ||
      state.geometryDimensions.includes(NaN)
    ) {
      return;
    }

    state.geometry = boxRoom({
      xDim: state.geometryDimensions[0],
      yDim: state.geometryDimensions[1],
      zDim: state.geometryDimensions[2],
      floorMaterial: "carpet",
      wallMaterial: "plaster",
      ceilingMaterial: "plaster",
    });
  },

  runRaytracing: async function () {
    state.running = true;
    state.audioToPlay = await rayTrace(state, state.rayTraceUpdate);
    state.running = false;
  },

  rayTraceUpdate: async function (bounces: number, totalBounces: number) {
    state.rayTracingProgress = [bounces, totalBounces];
    m.redraw();
  },

  playAudio: function () {
    // If no ray-tracing has happened, ignore.
    if (!state.audioToPlay) {
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

    // Create the buffer to play.
    const sourceBuffer = state.ctx.createBuffer(
      1,
      state.audioToPlay.length,
      SAMPLE_RATE,
    );
    const channel0 = sourceBuffer.getChannelData(0);
    for (let i = 0; i < state.audioToPlay.length; ++i) {
      channel0[i] = state.audioToPlay[i];
    }

    // Create the audio buffer source to play.
    state.source = state.ctx.createBufferSource();
    state.source.buffer = sourceBuffer;

    // Start playing the audio buffer source.
    state.source.connect(state.ctx.destination);
    state.source.start(0);
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
    lastAudio: null as Float32Array | null,
    lastData: [
      {
        x: [],
        y: [],
        type: "scatter",
      },
    ] as Data[],

    data: function (): Data[] {
      if (
        state.audioToPlay === null ||
        state.audioToPlay === PlotComponent.lastAudio
      ) {
        return PlotComponent.lastData;
      }

      const { x, y } = getData(state.audioToPlay);

      PlotComponent.lastAudio = state.audioToPlay;
      PlotComponent.lastData = [
        {
          x,
          y,
          type: "scatter",
        },
      ];

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
  source: null as THREE.Mesh | null,
  receiver: null as THREE.Mesh | null,

  // Since updating the mesh takes a little time (due to re-orienting the triangles),
  // this flag is set when updating to avoid another update interfering (e.g. if the
  // user holds down the up arrow next to the room's x dimension).
  updatingMesh: false,

  // Store the last-used geometry, so that the mesh is only
  // redrawn if it changes (i.e. state.geometry doesn't match).
  geometryData: [] as Triangle[],

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

    // If the geometry has changed, update it.
    if (ThreeView.geometryData !== state.geometry) {
      // Create geometry.
      const geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array(
        (await orientTriangles(state.geometry)).flatMap((triangle) => [
          ...triangle.p1,
          ...triangle.p2,
          ...triangle.p3,
        ]),
      );
      geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

      // Create materials.
      const material = new THREE.MeshBasicMaterial({ color: "red" });
      material.transparent = true;
      material.opacity = 0.1;
      const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: "red",
        wireframe: true,
      });

      // Remove old meshes.
      if (ThreeView.mesh) {
        ThreeView.scene.remove(ThreeView.mesh);
      }
      if (ThreeView.wireframeMesh) {
        ThreeView.scene.remove(ThreeView.wireframeMesh);
      }

      // Create the new meshes.
      ThreeView.mesh = new THREE.Mesh(geometry, material);
      ThreeView.wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
      ThreeView.geometryData = state.geometry;

      // Add the new meshes to the scene.
      if (ThreeView.mesh) {
        ThreeView.scene.add(ThreeView.mesh);
      }
      if (ThreeView.wireframeMesh) {
        ThreeView.scene.add(ThreeView.wireframeMesh);
      }
    }

    // Update the source and receiver positions.
    if (ThreeView.source) {
      ThreeView.source.position.set(...state.sourcePosition);
    }
    if (ThreeView.receiver) {
      ThreeView.receiver.position.set(...state.receiverPosition);
    }

    ThreeView.updatingMesh = false;
  },

  oncreate: async function (vnode: any) {
    const scene = new THREE.Scene();
    ThreeView.scene = scene;

    const camera = new THREE.PerspectiveCamera(
      75,
      vnode.dom.clientWidth / vnode.dom.clientHeight,
      0.1,
      1000,
    );
    // Set z-direction to be up.
    camera.up.set(0, 0, 1);

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

    const receiverMaterial = new THREE.MeshBasicMaterial({
      color: "blue",
    });
    const receiver = new THREE.Mesh(
      new THREE.SphereGeometry(1.0),
      receiverMaterial,
    );
    scene.add(receiver);
    ThreeView.receiver = receiver;

    await ThreeView.updateMesh();

    camera.position.x = 20;
    camera.position.y = -25;
    camera.position.z = 25;

    const orbitControls = new OrbitControls(camera, renderer.domElement);

    renderer.setSize(vnode.dom.clientWidth, vnode.dom.clientHeight);
    renderer.setClearColor("white");

    const animate = () => {
      orbitControls.update();
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);
  },
  onupdate: async function () {
    await ThreeView.updateMesh();
  },
  view: function () {
    return m("canvas.three", {
      style: "position: fixed; top: 0; left: 0; width: 50vw; height: 100vh;",
    });
  },
};

let AppView = {
  view: function () {
    return m("div", [
      m(ThreeView),
      m("div.sidebar", [
        m("section", { style: "border:1px solid black;" }, [
          m("label.v", [
            "Room dimensions:",
            m("input.v", {
              type: "number",
              value: state.geometryDimensions[0],
              oninput: function (e: InputEvent) {
                state.geometryDimensions[0] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
                state.updateGeometry();
              },
            }),
            m("input.v", {
              type: "number",
              value: state.geometryDimensions[1],
              oninput: function (e: InputEvent) {
                state.geometryDimensions[1] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
                state.updateGeometry();
              },
            }),
            m("input.v", {
              type: "number",
              value: state.geometryDimensions[2],
              oninput: function (e: InputEvent) {
                state.geometryDimensions[2] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
                state.updateGeometry();
              },
            }),
          ]),
          m("label.v", [
            "Source position:",
            m("input.v", {
              type: "number",
              value: state.sourcePosition[0],
              oninput: function (e: InputEvent) {
                state.sourcePosition[0] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
            m("input.v", {
              type: "number",
              value: state.sourcePosition[1],
              oninput: function (e: InputEvent) {
                state.sourcePosition[1] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
            m("input.v", {
              type: "number",
              value: state.sourcePosition[2],
              oninput: function (e: InputEvent) {
                state.sourcePosition[2] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
          ]),
          m("label.v", [
            "Receiver position:",
            m("input.v", {
              type: "number",
              value: state.receiverPosition[0],
              oninput: function (e: InputEvent) {
                state.receiverPosition[0] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
            m("input.v", {
              type: "number",
              value: state.receiverPosition[1],
              oninput: function (e: InputEvent) {
                state.receiverPosition[1] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
            m("input.v", {
              type: "number",
              value: state.receiverPosition[2],
              oninput: function (e: InputEvent) {
                state.receiverPosition[2] = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
          ]),
        ]),
        m("section", { style: "border:1px solid black;" }, [
          m("label.block", [
            "Ray count:",
            m("input", {
              type: "number",
              min: 1,
              value: state.rayCount,
              oninput: function (e: InputEvent) {
                state.rayCount = parseInt((e.target as HTMLInputElement).value);
              },
            }),
          ]),
          m("label.block", [
            "Number of bounces:",
            m("input", {
              type: "number",
              min: 0,
              value: state.minBounces,
              oninput: function (e: InputEvent) {
                state.minBounces = parseInt(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
          ]),
          m("label.block", [
            "Output duration (s):",
            m("input", {
              type: "number",
              min: 0,
              step: 0.1,
              value: state.audioDuration,
              oninput: function (e: InputEvent) {
                state.audioDuration = parseFloat(
                  (e.target as HTMLInputElement).value,
                );
              },
            }),
          ]),
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
        ]),
        m(
          "button.block",
          {
            disabled: state.audioToPlay === null,
            onclick: state.playAudio,
          },
          "Play audio",
        ),
        m(WaveformPlot),
        m(MagnitudePlot),
      ]),
    ]);
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("#root");
  if (root) {
    m.mount(root, AppView);
  }
});
