import { SAMPLE_RATE } from "../constants";
import m from "mithril";
import Plotly, { Data } from "plotly.js-dist";
import { state } from "./state";

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

export let WaveformPlot = ScatterPlot(
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

export let MagnitudePlot = ScatterPlot(
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
