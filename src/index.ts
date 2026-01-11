import { rayTrace, Settings } from "./ray_tracing";
import { SAMPLE_RATE } from "./constants";
import { CUBE_FACES } from "./geometry_data";

let audioToPlay = new Float32Array();
let ctx: AudioContext | null = null;

async function withDisabled(
  element: HTMLButtonElement,
  fn: () => Promise<void>,
) {
  const text = element.innerText;
  element.innerText = "Running";
  element.disabled = true;
  await fn();
  element.innerText = text;
  element.disabled = false;
}

const RAY_TRACING_SETTINGS: Settings = {
  rayCount: 20000,
  maxBounces: 20000,
  geometry: CUBE_FACES,
};

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#run-raytracing")?.addEventListener("click", (e) =>
    withDisabled(e.target as HTMLButtonElement, async () => {
      audioToPlay =
        (await rayTrace(RAY_TRACING_SETTINGS)) || new Float32Array();
      const playBtn = document.querySelector("#play-audio");
      if (playBtn instanceof HTMLButtonElement) {
        playBtn.disabled = false;
      }
    }),
  );

  document.querySelector("#play-audio")?.addEventListener("click", (e) => {
    ctx = ctx || new AudioContext();

    const sourceBuffer = ctx.createBuffer(1, audioToPlay.length, SAMPLE_RATE);
    const channel0 = sourceBuffer.getChannelData(0);
    for (let i = 0; i < audioToPlay.length; ++i) {
      channel0[i] = audioToPlay[i];
    }

    const source = ctx.createBufferSource();
    source.buffer = sourceBuffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  });
});
