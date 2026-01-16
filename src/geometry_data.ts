import { Triangle } from "./constants";

type BoxRoomConfig = {
  xDim: number;
  yDim: number;
  zDim: number;
  floorMaterial: string;
  wallMaterial: string;
  ceilingMaterial: string;
};

export function boxRoom(config: BoxRoomConfig): Triangle[] {
  const xp = config.xDim / 2;
  const yp = config.yDim / 2;
  const zp = config.zDim / 2;
  return [
    // Bottom face.
    {
      material: config.floorMaterial,
      p1: [-xp, -yp, -zp],
      p2: [xp, -yp, -zp],
      p3: [-xp, yp, -zp],
    },
    {
      material: config.floorMaterial,
      p1: [xp, -yp, -zp],
      p2: [xp, yp, -zp],
      p3: [-xp, yp, -zp],
    },
    // Top face.
    {
      material: config.ceilingMaterial,
      p1: [-xp, -yp, zp],
      p2: [xp, -yp, zp],
      p3: [-xp, yp, zp],
    },
    {
      material: config.ceilingMaterial,
      p1: [xp, -yp, zp],
      p2: [xp, yp, zp],
      p3: [-xp, yp, zp],
    },

    // Left face.
    {
      material: config.wallMaterial,
      p1: [-xp, -yp, -zp],
      p2: [-xp, yp, zp],
      p3: [-xp, -yp, zp],
    },
    {
      material: config.wallMaterial,
      p1: [-xp, -yp, -zp],
      p2: [-xp, yp, -zp],
      p3: [-xp, yp, zp],
    },
    // Right face.
    {
      material: config.wallMaterial,
      p1: [xp, -yp, -zp],
      p2: [xp, yp, zp],
      p3: [xp, -yp, zp],
    },
    {
      material: config.wallMaterial,
      p1: [xp, -yp, -zp],
      p2: [xp, yp, -zp],
      p3: [xp, yp, zp],
    },

    // Front face.
    {
      material: config.wallMaterial,
      p1: [-xp, -yp, -zp],
      p2: [xp, -yp, zp],
      p3: [-xp, -yp, zp],
    },
    {
      material: config.wallMaterial,
      p1: [-xp, -yp, -zp],
      p2: [xp, -yp, -zp],
      p3: [xp, -yp, zp],
    },
    // Back face.
    {
      material: config.wallMaterial,
      p1: [-xp, yp, -zp],
      p2: [xp, yp, zp],
      p3: [-xp, yp, zp],
    },
    {
      material: config.wallMaterial,
      p1: [-xp, yp, -zp],
      p2: [xp, yp, -zp],
      p3: [xp, yp, zp],
    },
  ];
}
