import { MATERIAL_COLOURS, Triangle } from "../constants";
import m from "mithril";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { dispose } from "../helpers/dispose";
import { vAdd, vCross, Vec3, vNormalise, vSubtract } from "../vectors";
import { state } from "./state";
import { evenlyDistributedRays } from "../ray_tracing";
import { materialNameToIndex } from "../helpers/common";
import { log } from "../log";

export let Viewport = {
  scene: null as THREE.Scene | null,
  meshes: [] as THREE.Mesh[],
  selectedMesh: null as THREE.Mesh | null,
  normals: [] as THREE.ArrowHelper[],
  source: null as THREE.Mesh | null,
  sourceDirection: null as THREE.Line | null,
  receivers: [] as THREE.Mesh[],
  camera: null as THREE.Camera | null,
  rays: [] as THREE.Line[],

  // Since updating the mesh takes a little time (due to re-orienting the triangles),
  // this flag is set when updating to avoid another update interfering (e.g. if the
  // user holds down the up arrow next to the room's x dimension).
  updatingMesh: false,

  // If the user changes the mesh while it's updating, this flag is set so that it
  // can immediately re-update the mesh when the previous update finishes.
  triedToUpdateMeshWhileUpdating: false,

  // Store the last-used geometry, so that the mesh is only
  // redrawn if it changes (i.e. state.geometry doesn't match).
  geometryData: [] as Triangle[],
  selectedTriangle: -1,

  updatePlot: async function () {
    Viewport.rays.forEach((ray) => {
      Viewport.scene?.remove(ray);
      dispose(ray);
    });
    Viewport.rays = [];

    for (const ray of state.bounceCoordinates) {
      for (let i = 0; i < ray.length - 4; i += 4) {
        const points = [
          new THREE.Vector3(ray[i + 1], ray[i + 2], ray[i + 3]),
          new THREE.Vector3(ray[i + 5], ray[i + 6], ray[i + 7]),
        ];
        const material = new THREE.LineBasicMaterial({
          color: 0x0000ff,
          opacity: ray[i],
          transparent: true,
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, material);
        // Required to prevent issues with lines randomly disappearing.
        line.renderOrder = -1;
        Viewport.rays.push(line);
      }
    }

    Viewport.rays.forEach((ray) => {
      Viewport.scene?.add(ray);
    });
  },

  updateNormals: async function () {
    Viewport.normals.forEach((n) => {
      Viewport.scene?.remove(n);
      dispose(n);
    });

    Viewport.normals = [];

    const makeNormalArrow = (triangle: Triangle, isSelected: boolean) => {
      const e1 = vSubtract(triangle.p2, triangle.p1);
      const e2 = vSubtract(triangle.p3, triangle.p1);
      const normal = vNormalise(vCross(e1, e2));
      const centroid = vAdd(vAdd(triangle.p1, triangle.p2), triangle.p3).map(
        (p) => p / 3,
      ) as Vec3;

      const origin = new THREE.Vector3(...centroid);
      const dir = new THREE.Vector3(...normal);

      const colour = isSelected ? 0x00ff00 : 0xff0000;
      return new THREE.ArrowHelper(dir, origin, 1, colour, 0.2, 0.3);
    };

    const triangles = state.geometry.triangles();

    if (state.showNormals) {
      for (let i = 0; i < triangles.length; ++i) {
        const triangle = triangles[i];
        const arrow = makeNormalArrow(
          triangle,
          i === Viewport.selectedTriangle,
        );
        Viewport.normals.push(arrow);
      }
    } else if (triangles[Viewport.selectedTriangle] !== undefined) {
      Viewport.normals.push(
        makeNormalArrow(triangles[Viewport.selectedTriangle], true),
      );
    }

    // Draw initial ray directions.
    // This is disabled since it can cause a lot of lag - enabling does verify that the
    // rays are evenly distributed
    // const rays = evenlyDistributedRays(state.settings.rayCount, state.settings.sourcePosition, state.settings.sourceDirection);
    // for (const ray of rays) {
    //     const origin = new THREE.Vector3(...ray.position);
    //     const dir = new THREE.Vector3(...ray.direction);

    //     const colour = 0x0000ff;
    //     const arrow = new THREE.ArrowHelper(dir, origin, ray.intensity, colour, 0.2, 0);
    //     Viewport.normals.push(arrow);
    // }

    Viewport.normals.forEach((n) => {
      Viewport.scene?.add(n);
    });
  },

  updateMesh: async function () {
    if (Viewport.updatingMesh) {
      Viewport.triedToUpdateMeshWhileUpdating = true;
      return;
    }

    Viewport.updatingMesh = true;
    if (!Viewport.scene) {
      return;
    }

    // Remove the current plotted points if the geometry has changed
    if (Viewport.geometryData !== state.geometry.triangles()) {
      state.bounceCoordinates = [];
      Viewport.updatePlot();
    }

    // If the geometry or selection has changed, update it.
    if (
      Viewport.geometryData !== state.geometry.triangles() ||
      Viewport.selectedTriangle !== state.geometry.selectedIndex
    ) {
      const unselectedTriangles = state.geometry.triangles().slice();
      unselectedTriangles.splice(state.geometry.selectedIndex, 1);

      const selectedTriangle = state.geometry.selectedTriangle();

      let trianglesMeshes: THREE.Mesh[] = [];
      let triangles = state.geometry.triangles().slice();

      for (let i = 0; i < MATERIAL_COLOURS.length; ++i) {
        const trianglesWithMaterial = triangles.filter(
          (tri) =>
            materialNameToIndex(state.settings.materials, tri.material) === i,
        );
        triangles = triangles.filter(
          (tri) =>
            materialNameToIndex(state.settings.materials, tri.material) !== i,
        );


        const vertices = new Float32Array(
          trianglesWithMaterial
            .flatMap((triangle) => [
              ...triangle.p1,
              ...triangle.p2,
              ...triangle.p3,
            ]),
        );

        // Create geometry.
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

        // Create materials.
        const material = new THREE.MeshBasicMaterial({ color: MATERIAL_COLOURS[i] });
        material.transparent = true;
        material.opacity = 0.15;
        const wireframeMaterial = new THREE.MeshBasicMaterial({
          color: "red",
          wireframe: true,
        });

        trianglesMeshes.push(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, wireframeMaterial));
      }

      if (triangles.length > 0) {
        log("drawing extra materials as red");
        const vertices = new Float32Array(
          triangles
            .flatMap((triangle) => [
              ...triangle.p1,
              ...triangle.p2,
              ...triangle.p3,
            ]),
        );

        // Create geometry.
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

        // Create materials.
        const material = new THREE.MeshBasicMaterial({ color: "red" });
        material.transparent = true;
        material.opacity = 0.15;
        const wireframeMaterial = new THREE.MeshBasicMaterial({
          color: "red",
          wireframe: true,
        });

        trianglesMeshes.push(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, wireframeMaterial));

      }

      const selectedGeometry = new THREE.BufferGeometry();
      if (selectedTriangle) {
        selectedGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(
            new Float32Array([
              ...selectedTriangle.p1,
              ...selectedTriangle.p2,
              ...selectedTriangle.p3,
              // Backface.
              ...selectedTriangle.p2,
              ...selectedTriangle.p1,
              ...selectedTriangle.p3,
            ]),
            3,
          ),
        );
      } else {
        selectedGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(), 3),
        );
      }
      const selectedMaterial = new THREE.MeshBasicMaterial({ color: "green" });
      selectedMaterial.transparent = true;
      selectedMaterial.opacity = 0.9;

      // Remove old meshes.
      Viewport.meshes.forEach(mesh => {
        Viewport.scene?.remove(mesh);
        dispose(mesh);
      })
      if (Viewport.selectedMesh) {
        Viewport.scene.remove(Viewport.selectedMesh);
        dispose(Viewport.selectedMesh);
      }

      // Create the new meshes.
      Viewport.meshes = trianglesMeshes;
      Viewport.geometryData = state.geometry.triangles();
      Viewport.selectedTriangle = state.geometry.selectedIndex;

      Viewport.selectedMesh = new THREE.Mesh(
        selectedGeometry,
        selectedMaterial,
      );

      // Add the new meshes to the scene.
      Viewport.meshes.forEach(mesh => Viewport.scene?.add(mesh));
      if (Viewport.selectedMesh) {
        Viewport.scene.add(Viewport.selectedMesh);
      }
    }

    // Update the source and receiver positions.
    if (Viewport.source) {
      Viewport.source.position.set(...state.settings.sourcePosition);
      Viewport.source.visible = state.geometry.triangles().length > 0;
    }

    if (Viewport.sourceDirection) {
      Viewport.scene?.remove(Viewport.sourceDirection);
      dispose(Viewport.sourceDirection);
    }

    const sourceDirection = state.settings.sourceDirection;
    if (sourceDirection) {
      const points = [
        new THREE.Vector3(...state.settings.sourcePosition),
        new THREE.Vector3(
          ...state.settings.sourcePosition.map(
            (p, i) => p + sourceDirection[i],
          ),
        ),
      ];
      const material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      // Required to prevent issues with lines randomly disappearing.
      line.renderOrder = -1;

      Viewport.scene?.add(line);
      Viewport.sourceDirection = line;
    }

    Viewport.receivers.map((receiver) => {
      Viewport.scene?.remove(receiver);
      dispose(receiver);
    });

    Viewport.receivers = state.settings.receivers.map((receiver) => {
      const receiverMaterial = new THREE.MeshBasicMaterial({
        color: "blue",
      });
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.0),
        receiverMaterial,
      );

      const r = receiver.radius || 0;
      mesh.scale.set(r, r, r);
      mesh.position.set(...receiver.position);
      mesh.visible = state.geometry.triangles().length > 0;
      Viewport.scene?.add(mesh);
      return mesh;
    });

    Viewport.updateNormals();

    Viewport.updatingMesh = false;
    if (Viewport.triedToUpdateMeshWhileUpdating) {
      this.updateMesh();
    }
  },

  oncreate: async function (vnode: any) {
    state.updatePlot = Viewport.updatePlot.bind(Viewport);
    const scene = new THREE.Scene();
    Viewport.scene = scene;

    Viewport.camera = new THREE.PerspectiveCamera(
      75,
      vnode.dom.clientWidth / vnode.dom.clientHeight,
      0.1,
      1000,
    );
    // Set z-direction to be up.
    Viewport.camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      canvas: vnode.dom,
    });

    const sourceMaterial = new THREE.MeshBasicMaterial({
      color: "green",
    });
    const source = new THREE.Mesh(
      new THREE.SphereGeometry(0.2),
      sourceMaterial,
    );
    scene.add(source);
    Viewport.source = source;

    await Viewport.updateMesh();

    Viewport.camera.position.x = 20;
    Viewport.camera.position.y = -25;
    Viewport.camera.position.z = 25;

    const orbitControls = new OrbitControls(
      Viewport.camera,
      renderer.domElement,
    );

    renderer.setSize(vnode.dom.clientWidth, vnode.dom.clientHeight);
    renderer.setClearColor("white");

    const animate = () => {
      orbitControls.update();

      if (Viewport.camera) {
        renderer.render(scene, Viewport.camera);
      }
    };
    renderer.setAnimationLoop(animate);
  },
  onupdate: async function () {
    await Viewport.updateMesh();
  },
  onclick: function (e: MouseEvent) {
    if (Viewport.camera) {
      const canvas = e.target as HTMLCanvasElement;
      const x = (2 * e.clientX) / canvas.clientWidth - 1;
      const y = 1 - (2 * e.clientY) / canvas.clientHeight;

      const caster = new THREE.Raycaster();
      caster.setFromCamera(new THREE.Vector2(x, y), Viewport.camera);

      const triangles = state.geometry.triangles();

      const rootObject = new THREE.Group();

      for (let i = 0; i < triangles.length; ++i) {
        const tri = triangles[i];

        const vertices = new Float32Array([
          ...tri.p1,
          ...tri.p2,
          ...tri.p3,
          // Backface.
          ...tri.p2,
          ...tri.p1,
          ...tri.p3,
        ]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(vertices, 3),
        );

        const mesh = new THREE.Mesh(geometry);
        mesh.userData["triangleIndex"] = i;
        rootObject.add(mesh);
      }

      const intersections = caster.intersectObjects([rootObject], true);
      const indices = intersections.map(
        (intersection) =>
          (intersection.object.userData["triangleIndex"] as
            | number
            | undefined) || 0,
      );

      // Get the selected triangle. Clicking multiple times cycles through all triangles
      // under the cursor (starting with the closest one). This allows selecting triangles
      // that are 'hidden' beneath other ones.
      state.geometry.selectedIndex =
        indices[
          (indices.indexOf(state.geometry.selectedIndex) + 1) % indices.length
        ];

      dispose(rootObject);
    }
  },
  view: function () {
    return m("canvas.three", {
      onclick: this.onclick,
    });
  },
};
