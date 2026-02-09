import { Triangle } from "./constants";
import m from "mithril";
import {
  boxRoom,
  BoxRoomConfig,
  checkForHoles,
  loadGeometry,
} from "./geometry_helpers";

export abstract class Geometry {
  abstract initialise(): Promise<void>;
  abstract triangles(): Triangle[];
  abstract view(): m.Children;
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
      this.geometry = await loadGeometry(data);
    } else {
      const data = await open3DModel();
      this.geometry = await loadGeometry(data);
    }

    const hasHoles = checkForHoles(this.geometry);
    if (hasHoles !== false) {
      alert(
        "Loaded geometry has holes, so may not ray-trace correctly!\nUnconnected edge coordinates:\n" +
          hasHoles,
      );
    }

    this.updateScaledGeometry();
  }

  triangles(): Triangle[] {
    return this.scaledGeometry;
  }

  view(): m.Children {
    return m("label.v", [
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
    ]);
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

// Helper functions for loading geometry data from URL.

async function readFile(file: File): Promise<string | ArrayBuffer> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.addEventListener("error", rej);
    reader.addEventListener("load", (e) => {
      const data = e.target?.result;
      if (data) res(data);
    });
  });
}

type FileInput = HTMLInputElement & { files: FileList };

function open3DModel(): Promise<string | ArrayBuffer> {
  return new Promise((res, rej) => {
    // Create a temporary file input element, and use that to
    // prompt the user to select a file
    const f = document.createElement("input") as FileInput;

    f.setAttribute("type", "file");
    f.setAttribute("accept", ".gltf,.glb");

    f.addEventListener("change", async () => {
      if (f.files.length > 0) {
        const file = f.files.item(0);
        if (file) {
          try {
            const contents = await readFile(file);
            res(contents);
          } catch (e) {
            rej(e);
          }
        }
      }
    });

    f.click();
  });
}
