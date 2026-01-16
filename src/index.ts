import { rayTrace } from "./ray_tracing";
import { SAMPLE_RATE, Vec3 } from "./constants";
import { CUBE_FACES } from "./geometry_data";
import m from "mithril";
import Plotly, { Data } from "plotly.js-dist";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { orientTriangles } from "./orient_surfaces";

let state = {
  rayCount: 20000,
  minBounces: 10000,
  audioDuration: 10,
  // NOTE: placing at the exact origin [0,0,0] causes artefacts.
  // TODO: once diffusion has been implemented, try [0,0,0] again.
  sourcePosition: [0.1, -0.1, -0.1] as Vec3,
  receiverPosition: [8.5, 0.0, 0.0] as Vec3,
  geometry: CUBE_FACES,

  audioToPlay: null as Float32Array | null,
  ctx: null as AudioContext | null,
  running: false,
  rayTracingProgress: [0, 0] as [number, number],
  source: null as AudioBufferSourceNode | null,

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
  oncreate: async function (vnode: any) {
    console.log(vnode);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      vnode.dom.clientWidth / vnode.dom.clientHeight,
      0.1,
      1000,
    );
    const renderer = new THREE.WebGLRenderer({
      canvas: vnode.dom,
    });

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(
      (await orientTriangles(CUBE_FACES)).flatMap((triangle) => [
        ...triangle.p1,
        ...triangle.p2,
        ...triangle.p3,
      ]),
    );
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.MeshBasicMaterial({ color: "red" });
    material.transparent = true;
    material.opacity = 0.1;

    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: "red",
      wireframe: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
    scene.add(wireframeMesh);

    const sourceMaterial = new THREE.MeshBasicMaterial({
      color: "green",
    });
    const source = new THREE.Mesh(
      new THREE.SphereGeometry(0.2),
      sourceMaterial,
    );
    source.translateX(state.sourcePosition[0]);
    source.translateY(state.sourcePosition[1]);
    source.translateZ(state.sourcePosition[2]);
    scene.add(source);

    const receiverMaterial = new THREE.MeshBasicMaterial({
      color: "blue",
    });
    const receiver = new THREE.Mesh(
      new THREE.SphereGeometry(1.0),
      receiverMaterial,
    );
    receiver.translateX(state.receiverPosition[0]);
    receiver.translateY(state.receiverPosition[1]);
    receiver.translateZ(state.receiverPosition[2]);
    scene.add(receiver);

    camera.position.z = 30;

    const orbitControls = new OrbitControls(camera, renderer.domElement);

    renderer.setSize(vnode.dom.clientWidth, vnode.dom.clientHeight);
    renderer.setClearColor("white");

    const animate = () => {
      orbitControls.update();
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);
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
