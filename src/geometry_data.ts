import { Triangle } from "./constants";

export const CUBE_FACES: Triangle[] = [
  // Bottom face.
  {
    material: "carpet",
    p1: [-10, -10, -10],
    p2: [10, -10, -10],
    p3: [-10, 10, -10],
  },
  {
    material: "carpet",
    p1: [10, -10, -10],
    p2: [10, 10, -10],
    p3: [-10, 10, -10],
  },
  // Top face.
  {
    material: "plaster",
    p1: [-10, -10, 10],
    p2: [10, -10, 10],
    p3: [-10, 10, 10],
  },
  {
    material: "plaster",
    p1: [10, -10, 10],
    p2: [10, 10, 10],
    p3: [-10, 10, 10],
  },

  // Left face.
  {
    material: "plaster",
    p1: [-10, -10, -10],
    p2: [-10, 10, 10],
    p3: [-10, -10, 10],
  },
  {
    material: "plaster",
    p1: [-10, -10, -10],
    p2: [-10, 10, -10],
    p3: [-10, 10, 10],
  },
  // Right face.
  {
    material: "plaster",
    p1: [10, -10, -10],
    p2: [10, 10, 10],
    p3: [10, -10, 10],
  },
  {
    material: "plaster",
    p1: [10, -10, -10],
    p2: [10, 10, -10],
    p3: [10, 10, 10],
  },

  // Front face.
  {
    material: "plaster",
    p1: [-10, -10, -10],
    p2: [10, -10, 10],
    p3: [-10, -10, 10],
  },
  {
    material: "plaster",
    p1: [-10, -10, -10],
    p2: [10, -10, -10],
    p3: [10, -10, 10],
  },
  // Back face.
  {
    material: "plaster",
    p1: [-10, 10, -10],
    p2: [10, 10, 10],
    p3: [-10, 10, 10],
  },
  {
    material: "plaster",
    p1: [-10, 10, -10],
    p2: [10, 10, -10],
    p3: [10, 10, 10],
  },
];
