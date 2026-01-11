import { rayTrace, Settings } from "./ray_tracing";
import { SAMPLE_RATE } from "./constants";
import { CUBE_FACES } from "./geometry_data";
import m from "mithril";

let state = {
  rayCount: 20000,
  minBounces: 5000,
  geometry: CUBE_FACES,
  audioToPlay: null as Float32Array | null,
  ctx: null as AudioContext | null,
  running: false,

  runRaytracing: async function () {
    state.running = true;
    state.audioToPlay = await rayTrace(state);
    state.running = false;
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
    const source = state.ctx.createBufferSource();
    source.buffer = sourceBuffer;

    // Start playing the audio buffer source.
    source.connect(state.ctx.destination);
    source.start(0);
  },
};

let AppView = {
  view: function () {
    return m("div", [
      m("section", { style: "border:1px solid black;" }, [
        m("label.block", [
          "Ray count:",
          m("input", {
            type: "number",
            min: "1",
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
            min: "0",
            value: state.minBounces,
            oninput: function (e: InputEvent) {
              state.minBounces = parseInt((e.target as HTMLInputElement).value);
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
        "button",
        {
          disabled: state.audioToPlay === null,
          onclick: state.playAudio,
        },
        "Play audio",
      ),
    ]);
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const root = document.querySelector("#root");
  if (root) {
    m.mount(root, AppView);
  }
});
