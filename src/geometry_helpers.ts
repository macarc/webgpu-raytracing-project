import { BufferGeometry, Mesh, Object3D } from "three";
import { Triangle, Vec3 } from "./constants";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
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

export type Format3D = "3dm" | "gltf";

/* https://github.com/maximeq/three-js-disposer/blob/r4.130/src/disposer.ts */

function disposeNode(node: Object3D) {
  if (node instanceof Mesh) {
    if (node.geometry) {
      node.geometry.dispose();
    }

    if (node.material) {
      if (node.material && node.material.materials) {
        for (let i = 0; i < node.material.materials.length; ++i) {
          const mtrl = node.material.materials[i];
          if (mtrl.map) mtrl.map.dispose();
          if (mtrl.lightMap) mtrl.lightMap.dispose();
          if (mtrl.bumpMap) mtrl.bumpMap.dispose();
          if (mtrl.normalMap) mtrl.normalMap.dispose();
          if (mtrl.specularMap) mtrl.specularMap.dispose();
          if (mtrl.envMap) mtrl.envMap.dispose();

          mtrl.dispose(); // disposes any programs associated with the material
        }
      } else {
        if (node.material.map) node.material.map.dispose();
        if (node.material.lightMap) node.material.lightMap.dispose();
        if (node.material.bumpMap) node.material.bumpMap.dispose();
        if (node.material.normalMap) node.material.normalMap.dispose();
        if (node.material.specularMap) node.material.specularMap.dispose();
        if (node.material.envMap) node.material.envMap.dispose();

        node.material.dispose(); // disposes any programs associated with the material
      }
    }
  }
}

function disposeHierarchy(node: Object3D, callback: (node: Object3D) => void) {
  for (var i = node.children.length - 1; i >= 0; i--) {
    var child = node.children[i];
    disposeHierarchy(child, callback);
    callback(child);
  }
}

export function dispose(o: Object3D | null) {
  if (o) {
    disposeHierarchy(o, disposeNode);
  }
}

/* end https://github.com/maximeq/three-js-disposer/blob/r4.130/src/disposer.ts */

export function loadObjectFromData(
  data: ArrayBuffer,
  filetype: Format3D,
): Promise<Object3D> {
  if (filetype === "3dm") {
    const rhino = new Rhino3dmLoader();
    rhino.setLibraryPath("public/");
    return new Promise((res, rej) => rhino.parse(data, res, rej));
  } else {
    const loader = new GLTFLoader();
    return new Promise((res, rej) =>
      loader.parse(data, "[loaded model]", (gltf) => res(gltf.scene), rej),
    );
  }
}

export function bufferGeometryToTriangles(
  geometry: BufferGeometry,
): Triangle[] {
  const triangles: Triangle[] = [];

  const indices = geometry.getIndex();
  const vertexCoordinates = geometry.getAttribute("position");
  if (indices && vertexCoordinates) {
    const idx = indices.array;
    const v = vertexCoordinates.array;

    for (let i = 0; i < idx.length; i += 3) {
      triangles.push({
        material: "plaster",
        p1: [v[idx[i] * 3], v[idx[i] * 3 + 1], v[idx[i] * 3 + 2]],
        p2: [v[idx[i + 1] * 3], v[idx[i + 1] * 3 + 1], v[idx[i + 1] * 3 + 2]],
        p3: [v[idx[i + 2] * 3], v[idx[i + 2] * 3 + 1], v[idx[i + 2] * 3 + 2]],
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

  return triangles;
}

/**
 * Load a GLTF file.
 * Loads the triangles of all mesh objects from the file and
 * orients them.
 * @param data GLB file contents.
 * @returns oriented triangles loaded from the GLTF file.
 */
export async function loadGeometry(
  data: ArrayBuffer,
  filetype: Format3D,
): Promise<Triangle[]> {
  const object = await loadObjectFromData(data, filetype);
  const triangles: Triangle[] = [];

  object.traverse((obj) => {
    if (isMesh(obj)) {
      triangles.push(...bufferGeometryToTriangles(obj.geometry));
      obj.geometry.dispose();
    }
  });

  console.log("Loaded", triangles);

  await orientTriangles(triangles);

  dispose(object);

  return triangles;
}

/**
 * Create a shoebox room.
 * @param config settings for room.
 * @returns oriented triangles forming a cuboid with dimensions and materials specified by config.
 */
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

/**
 * Check whether a set of triangles forms a closed shape or has a hole.
 * This works by checking to ensure that all edges are shared by at least two
 * triangles in the list. This won't catch every case with a hole, but will
 * catch many practical cases.
 * O(n).
 * @param triangles geometry to check for holes in.
 * @returns a string containing the unconnected edges, or false if there are no holes.
 */
export function checkForHoles(triangles: Triangle[]): string | false {
  // Dictionary from (stringified) edge to number of occurrences in the triangles list.
  const edgeCounts: Record<string, number> = {};

  for (const triangle of triangles) {
    const edges = [
      [triangle.p1, triangle.p2],
      [triangle.p2, triangle.p3],
      [triangle.p3, triangle.p1],
    ];

    // Sort the vertices in each edge so that
    // the same edge will map to the same key in edgeCounts.
    const sortedEdges = edges.map((edge) => {
      if (edge[0].toString() > edge[1].toString()) {
        return [edge[1], edge[0]];
      }
      return edge;
    });

    // Add edges to edgeCounts.
    for (const edge of sortedEdges) {
      const key = edge.toString();
      if (Object.hasOwn(edgeCounts, key)) {
        edgeCounts[key]++;
      } else {
        edgeCounts[key] = 1;
      }
    }
  }

  let msg = "";

  // Check if any edges occur less than twice.
  for (const [edge, count] of Object.entries(edgeCounts)) {
    if (count === 1) {
      msg += edge + "\n";
    }
  }

  if (msg.length > 0) {
    return msg;
  }

  return false;
}

/**
 * Rotate a vector around one of the basis vector axes.
 * @param vec vector to rotate.
 * @param axisIndex index of axis.
 * @returns rotated vector.
 */
function swap2(vec: Vec3, axisIndex: 0 | 1 | 2): Vec3 {
  switch (axisIndex) {
    case 0:
      return [vec[0], -vec[2], vec[1]];
    case 1:
      return [-vec[2], vec[1], vec[0]];
    case 2:
      return [-vec[1], vec[0], vec[2]];
  }
}

/**
 * Rotate all triangles about an axis.
 * @param triangles triangles to rotate.
 * @param axis axis about which to rotate.
 */
export function rotate(triangles: Triangle[], axis: "x" | "y" | "z") {
  const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;

  for (const triangle of triangles) {
    triangle.p1 = swap2(triangle.p1, axisIndex);
    triangle.p2 = swap2(triangle.p2, axisIndex);
    triangle.p3 = swap2(triangle.p3, axisIndex);
  }
}
