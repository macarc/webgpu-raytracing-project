import { Mesh, Object3D } from "three";
import { Triangle } from "./constants";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { orientTriangles } from "./orient_surfaces";

export type BoxRoomConfig = {
  xDim: number;
  yDim: number;
  zDim: number;
  floorMaterial: string;
  wallMaterial: string;
  ceilingMaterial: string;
};

function isMesh(obj: Object3D): obj is Mesh {
  return (obj as Mesh).isMesh || false;
}

export async function loadGeometry(
  data: string | ArrayBuffer,
): Promise<Triangle[]> {
  const loader = new GLTFLoader();
  const model = await loader.parseAsync(data, "loaded model");

  const triangles: Triangle[] = [];

  model.scene.traverse((obj) => {
    if (isMesh(obj)) {
      const indices = obj.geometry.index;
      const vertexCoordinates = obj.geometry.getAttribute("position");
      if (indices && vertexCoordinates) {
        const idx = indices.array;
        const v = vertexCoordinates.array;

        for (let i = 0; i < idx.length; i += 3) {
          triangles.push({
            material: "plaster",
            p1: [v[idx[i] * 3], v[idx[i] * 3 + 1], v[idx[i] * 3 + 2]],
            p2: [
              v[idx[i + 1] * 3],
              v[idx[i + 1] * 3 + 1],
              v[idx[i + 1] * 3 + 2],
            ],
            p3: [
              v[idx[i + 2] * 3],
              v[idx[i + 2] * 3 + 1],
              v[idx[i + 2] * 3 + 2],
            ],
          });
        }
      } else if (vertexCoordinates) {
        const v = vertexCoordinates.array;

        for (let i = 0; i < v.length; i += 9) {
          triangles.push({
            material: "plaster",
            p1: [v[i], v[i + 1], v[i + 2]],
            p2: [v[i + 3], v[i + 4], v[i + 5]],
            p3: [v[i + 6], v[i + 7], v[i + 8]],
          });
        }
      }
    }
  });

  await orientTriangles(triangles);

  return triangles;
}

export async function boxRoom(config: BoxRoomConfig): Promise<Triangle[]> {
  const xp = config.xDim / 2;
  const yp = config.yDim / 2;
  const zp = config.zDim / 2;
  const unorientedTriangles: Triangle[] = [
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

  return orientTriangles(unorientedTriangles);
}
