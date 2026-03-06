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

export abstract class Geometry {
  abstract initialise(): Promise<void>;
  abstract triangles(): Triangle[];
  abstract view(): m.Children;
  abstract setTriangleMaterial(index: number, material: string): void;

  selectedIndex = -1;

  selectedTriangle(): Triangle | null {
    return this.triangles()[this.selectedIndex] || null;
  }
}

export class NoGeometry extends Geometry {
  async initialise(): Promise<void> {
    return;
  }

  triangles(): Triangle[] {
    return [];
  }

  view(): m.Children {
    return [];
  }

  setTriangleMaterial(index: number, material: string) {}
}

export class BoxRoomGeometry extends Geometry {
  geometry: Triangle[] = [];
  config: BoxRoomConfig = {
    xDim: 10,
    yDim: 10,
    zDim: 5,
    floorMaterial: "carpet",
    wallMaterial: "plaster",
    ceilingMaterial: "plaster",
  };

  async initialise() {
    this.geometry = await boxRoom(this.config);
  }

  setTriangleMaterial(index: number, material: string) {
    this.geometry[index].material = material;
  }

  triangles(): Triangle[] {
    return this.geometry;
  }

  view(): m.Children {
    return m("label.v", [
      "Room dimensions:",
      m("input.v", {
        type: "number",
        value: this.config.xDim,
        oninput: (e: InputEvent) => {
          this.config.xDim = parseFloat((e.target as HTMLInputElement).value);
          this.updateGeometry();
        },
      }),
      m("input.v", {
        type: "number",
        value: this.config.yDim,
        oninput: (e: InputEvent) => {
          this.config.yDim = parseFloat((e.target as HTMLInputElement).value);
          this.updateGeometry();
        },
      }),
      m("input.v", {
        type: "number",
        value: this.config.zDim,
        oninput: (e: InputEvent) => {
          this.config.zDim = parseFloat((e.target as HTMLInputElement).value);
          this.updateGeometry();
        },
      }),
    ]);
  }

  private async updateGeometry() {
    const dimensions = [this.config.xDim, this.config.yDim, this.config.zDim];

    // Don't update the geometry if there's a zero in it (this may occur if the user
    // deletes the value before typing another).
    if (dimensions.includes(0) || dimensions.includes(NaN)) {
      return;
    }

    this.geometry = await boxRoom(this.config);
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

  rotate(axis: "x" | "y" | "z") {
    rotate(this.geometry, axis);
    this.updateScaledGeometry();
  }

  view(): m.Children {
    return [
      m("label.v", [
        "Scale:",
        m("input.v", {
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
    ];
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
    return [
      m("label.v", [
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
    ];
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
