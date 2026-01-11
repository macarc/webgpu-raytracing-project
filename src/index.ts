import { rayTrace, Settings } from "./ray_tracing";
import { SAMPLE_RATE } from "./constants";
import { CUBE_FACES } from "./geometry_data";
import m from "mithril";
import Plotly, { Data } from "plotly.js-dist";

let state = {
  rayCount: 20000,
  minBounces: 10000,
  audioDuration: 10,
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
      state.ctx = new AudioContext();
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

let AppView = {
  view: function () {
    return m("div", [
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
              state.minBounces = parseInt((e.target as HTMLInputElement).value);
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
      ]),
      m(
        "div.progress-bar-holder",
        m("div.progress-bar", {
          style: `width: ${(100 * state.rayTracingProgress[0]) / state.rayTracingProgress[1]}%;`,
        }),
      ),
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
    ]);
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("#root");
  if (root) {
    m.mount(root, AppView);
  }
});
