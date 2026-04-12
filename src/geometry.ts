import { Triangle } from "./constants";
import m from "mithril";
import {
  boxRoom,
  BoxRoomConfig,
  bufferGeometryToTriangles,
  checkForHoles,
  Format3D,
  loadGeometry,
  rotate,
} from "./geometry_helpers";
import { SphereGeometry } from "three";

export type SavedGeometry =
  | Triangle[]
  | { type: "box"; config: BoxRoomConfig; materials: string[] };

export async function fromSavedGeometry(s: SavedGeometry): Promise<Geometry> {
  if (Array.isArray(s)) {
    return LoadedGeometry.fromTriangles(s);
  } else {
    const geom = new BoxRoomGeometry();
    geom.config = s.config;
    await geom.initialise();
    s.materials.forEach((material, i) => geom.setTriangleMaterial(i, material));
    return geom;
  }
}

/**
 * The Geometry base class - all Geometry objects
 * (including shoebox room, sphere, etc.) derive from this class.
 */
export abstract class Geometry {
  /**
   * Initialise the geometry.
   */
  abstract initialise(): Promise<void>;

  /**
   * Get the triangles that make up the geometry.
   * This should return the same array if the geometry has not changed,
   * and a different array if the geometry has changed. TODO is this true.
   */
  abstract triangles(): Triangle[];

  /**
   * Set the material of a triangle.
   * @param index the index into .triangles() of the triangle.
   * @param material the name of the material.
   */
  abstract setTriangleMaterial(index: number, material: string): void;

  /**
   * View the sidebar UI that can modify the geometry.
   */
  abstract view(): m.Children;

  /**
   * The index into .triangles() of the selected triangle.
   * -1 if no triangles are selected.
   */
  public selectedIndex = -1;

  /**
   * Get the currently-selected triangle.
   * @returns the selected triangle, if present.
   */
  public selectedTriangle(): Triangle | null {
    return this.triangles()[this.selectedIndex] || null;
  }

  public savedGeometry(): SavedGeometry {
    return this.triangles();
  }
}

/**
 * A shoebox (cuboid) room.
 */
export class BoxRoomGeometry extends Geometry {
  /**
   * Configuration for the room.
   */
  config: BoxRoomConfig = {
    xDim: 10,
    yDim: 10,
    zDim: 5,
    floorMaterial: "carpet",
    wallMaterial: "plaster",
    ceilingMaterial: "plaster",
  };

  /**
   * The triangles that make up the room.
   * Updated in .updateGeometry().
   */
  geometry: Triangle[] = [];

  async initialise() {
    // TODO: check this works
    await this.updateGeometry();
    // this.geometry = await boxRoom(this.config);
  }

  setTriangleMaterial(index: number, material: string) {
    this.geometry[index].material = material;
  }

  triangles(): Triangle[] {
    return this.geometry;
  }

  public override savedGeometry(): SavedGeometry {
    return {
      type: "box",
      config: this.config,
      materials: this.triangles().map((tri) => tri.material),
    };
  }

  view(): m.Children {
    return m("section", [
      m("label", [
        "Room dimensions:",
        m("input", {
          type: "number",
          value: this.config.xDim,
          oninput: (e: InputEvent) => {
            this.config.xDim = parseFloat((e.target as HTMLInputElement).value);
            this.updateGeometry();
          },
        }),
        m("input", {
          type: "number",
          value: this.config.yDim,
          oninput: (e: InputEvent) => {
            this.config.yDim = parseFloat((e.target as HTMLInputElement).value);
            this.updateGeometry();
          },
        }),
        m("input", {
          type: "number",
          value: this.config.zDim,
          oninput: (e: InputEvent) => {
            this.config.zDim = parseFloat((e.target as HTMLInputElement).value);
            this.updateGeometry();
          },
        }),
      ]),
    ]);
  }

  /**
   * Update this.geometry with the triangles that match the current config.
   */
  private async updateGeometry(): Promise<void> {
    const dimensions = [this.config.xDim, this.config.yDim, this.config.zDim];

    // Don't update the geometry if there's a zero in it (this may occur if the user
    // deletes the value before typing another).
    if (dimensions.includes(0) || dimensions.includes(NaN)) {
      return;
    }

    const materials = this.geometry.map((tri) => tri.material);

    this.geometry = await boxRoom(this.config);

    // Retain materials when resizing.
    materials.map((material, i) => (this.geometry[i].material = material));

    m.redraw();
  }
}

export class LoadedGeometry extends Geometry {
  geometry: Triangle[] = [];
  scaledGeometry: Triangle[] = [];
  scale: number = 1;
  path: string | null;

  constructor(path: string | null = null) {
    super();
    this.path = path;
  }

  static fromTriangles(triangles: Triangle[]) {
    const g = new LoadedGeometry();
    g.geometry = triangles;
    g.updateScaledGeometry();
    return g;
  }

  async initialise(): Promise<void> {
    if (this.path) {
      const resp = await fetch(this.path);
      const data = await resp.arrayBuffer();
      const filetype = pathToFormat3D(this.path);
      this.geometry = await loadGeometry(data, filetype);
    } else {
      const data = await open3DModel();
      this.geometry = await loadGeometry(data.data, data.filetype);
    }

    const hasHoles = checkForHoles(this.geometry);
    if (hasHoles !== false) {
      alert(
        "Loaded geometry has holes, so may not ray-trace correctly!\nUnconnected edge coordinates:\n" +
          hasHoles,
      );
    }

    // Initially rotate the geometry, since in most applications Y is up (not Z).
    // TODO: don't do this for 3dm files.
    rotate(this.geometry, "x");

    // Create the scaled geometry (the actual geometry which is used).
    this.updateScaledGeometry();
  }

  triangles(): Triangle[] {
    return this.scaledGeometry;
  }

  setTriangleMaterial(index: number, material: string) {
    this.geometry[index].material = material;
    this.updateScaledGeometry();
  }

  flipNormal(index: number) {
    if (this.geometry[index] !== undefined) {
      const p2 = this.geometry[index].p2;
      this.geometry[index].p2 = this.geometry[index].p3;
      this.geometry[index].p3 = p2;
      this.updateScaledGeometry();
    }
  }

  view(): m.Children {
    return m("section", [
      m("label", [
        "Scale:",
        m("input", {
          type: "number",
          min: 0,
          step: 0.1,
          value: this.scale,
          oninput: (e: InputEvent) => {
            this.scale = parseFloat((e.target as HTMLInputElement).value);
            this.updateScaledGeometry();
          },
        }),
      ]),
      m("button", { onclick: () => this.rotate("x") }, "Rotate X"),
      m("button", { onclick: () => this.rotate("y") }, "Rotate Y"),
      m("button", { onclick: () => this.rotate("z") }, "Rotate Z"),
    ]);
  }

  private rotate(axis: "x" | "y" | "z") {
    rotate(this.geometry, axis);
    this.updateScaledGeometry();
  }

  private updateScaledGeometry() {
    if (this.scale > 0) {
      this.scaledGeometry = this.geometry.map(
        (triangle) =>
          ({
            material: triangle.material,
            p1: triangle.p1.map((v) => v * this.scale),
            p2: triangle.p2.map((v) => v * this.scale),
            p3: triangle.p3.map((v) => v * this.scale),
          }) as Triangle,
      );
    }
  }
}

export class RoundGeometry extends Geometry {
  geometry: Triangle[] = [];
  radius = 20;
  minTriangleCount = 6000;
  actualTriangleCount = 0;

  constructor() {
    super();
    this.generateSphere();
  }

  async initialise(): Promise<void> {}

  triangles(): Triangle[] {
    return this.geometry;
  }

  setTriangleMaterial(index: number, material: string): void {
    this.geometry[index].material = material;
  }

  view(): m.Children {
    return m("section", [
      m("label", [
        "Minimum number of triangles:",
        m("input", {
          type: "number",
          value: this.minTriangleCount,
          min: 0,
          step: 1,
          onchange: (e: InputEvent) =>
            this.setMinTriangleCount(
              parseInt((e.target as HTMLInputElement).value),
            ),
        }),
      ]),
      m("span", ` Actual triangle count: ${this.actualTriangleCount}`),
    ]);
  }

  private setMinTriangleCount(count: number | undefined) {
    if (count) {
      this.minTriangleCount = count;
      this.generateSphere();
    }
  }

  private generateSphere() {
    const widthSegments = Math.ceil(Math.sqrt(this.minTriangleCount / 2));
    const heightSegments = Math.ceil(Math.sqrt(this.minTriangleCount / 2));
    console.log(
      "sphere with " + widthSegments * heightSegments * 2 + " triangles",
    );
    this.actualTriangleCount = widthSegments * heightSegments * 2;
    const sphere = new SphereGeometry(
      this.radius,
      widthSegments,
      heightSegments,
    );
    this.geometry = bufferGeometryToTriangles(sphere);
  }
}

// Helper functions for loading geometry data from URL.

async function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.addEventListener("error", rej);
    reader.addEventListener("load", (e) => {
      const data = e.target?.result;

      if (typeof data === "string") {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(data);
        res(encoded.buffer);
      } else if (data) {
        res(data);
      } else {
        rej("Loaded undefined object.");
      }
    });
  });
}

type FileInput = HTMLInputElement & { files: FileList };

function open3DModel(): Promise<{ filetype: Format3D; data: ArrayBuffer }> {
  return new Promise((res, rej) => {
    // Create a temporary file input element, and use that to
    // prompt the user to select a file
    const f = document.createElement("input") as FileInput;

    f.setAttribute("type", "file");
    f.setAttribute("accept", ".gltf,.glb,.3dm");

    f.addEventListener("change", async () => {
      if (f.files.length > 0) {
        const file = f.files.item(0);
        if (file) {
          try {
            const data = await readFile(file);
            res({
              filetype: pathToFormat3D(file.name),
              data,
            });
          } catch (e) {
            rej(e);
          }
        }
      }
    });

    f.click();
  });
}

function pathToFormat3D(path: string): Format3D {
  return path.toLowerCase().endsWith(".3dm") ? "3dm" : "gltf";
}
