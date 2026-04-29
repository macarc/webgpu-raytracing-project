import { Receiver } from "../ray_tracing";
import { Vec3 } from "../vectors";
import { Material } from "../constants";

export type Settings = {
  rayCount: number;
  audioDuration: number;
  sourcePosition: Vec3;
  sourceDirection: Vec3 | null;
  receivers: Receiver[];
  useWasm: boolean;
  rayPlotCount: number;
  bouncePlotCount: number;
  materials: Material[];
  selectedChannels: number[];
};

export function defaultSettings(): Settings {
  return {
    rayCount: 20000,
    audioDuration: 4,
    sourcePosition: [0, 0, 0],
    sourceDirection: null,
    receivers: [
      { position: [3.0, -1.0, 0.0], radius: 0.2 },
      { position: [3.0, 1.0, 0.0], radius: 0.2 },
    ],
    rayPlotCount: 10,
    useWasm: false,
    bouncePlotCount: 10,
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
}
