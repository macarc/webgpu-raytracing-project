import m from "mithril";
import { state } from "../state";
import { MagnitudePlot, WaveformPlot } from "../plots";
export function raytracingMenu() {
  return [
    m("section", [
      m("label", [
        "Ray count:",
        m("input", {
          type: "number",
          min: 1,
          value: state.settings.rayCount,
          onchange: function (e: InputEvent) {
            state.settings.rayCount = parseInt(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
      ]),
      m("label", [
        "Output duration (s):",
        m("input", {
          type: "number",
          min: 0,
          step: 0.1,
          value: state.settings.audioDuration,
          onchange: function (e: InputEvent) {
            state.settings.audioDuration = parseFloat(
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
        "Number of rays to plot:",
        m("input", {
          type: "number",
          min: 0,
          max: state.settings.rayCount,
          step: 1,
          value: state.settings.rayPlotCount,
          onchange: (e: InputEvent) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (val !== undefined && val > 0) {
              state.settings.rayPlotCount = val;
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
          value: state.settings.bouncePlotCount,
          onchange: (e: InputEvent) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (val !== undefined && val > 0) {
              state.settings.bouncePlotCount = val;
            }
          },
        }),
      ]),
      m("label", [
        m("input", {
          type: "checkbox",
          checked: state.settings.useWasm,
          onchange: () => {
            state.settings.useWasm = !state.settings.useWasm;
          },
        }),
        "Use Wasm ray-tracer",
      ]),
    ]),
    m("section", [
      m(
        "button",
        { class: state.running ? "stop" : "", onclick: state.runRaytracing },
        state.running ? "Stop raytracing" : "Run raytracing",
      ),
      m(
        "div.progress-bar-holder",
        m("div.progress-bar", {
          style: `width: ${(100 * state.progress.secondsElapsed) / state.progress.totalSeconds}%;`,
        }),
      ),
      m("span", [
        " ",
        state.progress.secondsElapsed.toFixed(2),
        "s / ",
        state.progress.totalSeconds.toFixed(2),
        "s, ",
        state.progress.bounceCount,
        " bounces ",
      ]),
      m("span", { style: "display: block;" }, [
        "Escaped rays: ",
        state.progress.escapedRayCount,
        " (",
        // || 0 so that division by 0 does not result in NaN being displayed.
        (
          (100 * state.progress.escapedRayCount) /
            state.progress.totalRayCount || 0
        ).toFixed(2),
        "%) Elapsed time: ",
        (state.progress.runTimeMs / 1000).toFixed(1),
        " (",
        // || 0 so that division by 0 does not result in NaN being displayed.
        (
          (1000 * state.progress.bounceCount * state.progress.totalRayCount) /
            state.progress.runTimeMs || 0
        ).toFixed(0),
        " bounces per second)",
      ]),
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
                state.settings.selectedChannels = channelsToPlay;
              },
              multiple: true,
            },
            state.raytracedAudio.map((_, i) =>
              m(
                "option",
                {
                  value: i,
                  selected: state.settings.selectedChannels.includes(i),
                },
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
      m(
        "button",
        {
          disabled: state.raytracedAudio.length === 0,
          onclick: state.downloadAudio,
        },
        "Download audio",
      ),
    ]),
    m(WaveformPlot),
    m(MagnitudePlot),
  ];
}
