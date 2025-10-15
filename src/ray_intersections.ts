import { runShader } from "./lib";
import { Ray, Triangle, WORKGROUP_SIZE } from "./constants";
import { plotOutput } from "./draw";
import {
  raysToFloatArray,
  trianglesToFloatArray,
  initialIntersectionsFloatArray,
} from "./floatarrays";

interface Settings {
  rayCount: number;
  triangleCount: number;
  intersectionCount: number;
}

const PLOT_SETTINGS = {
  rayCount: 1000,
  triangleCount: 50,
  intersectionCount: 1,
};

const STRESS_TEST_SETTINGS = {
  rayCount: 20000,
  triangleCount: 3000,
  intersectionCount: 20000,
};

/**
 *
 * @returns uniform random number between -1 and 1.
 */
function rand() {
  return Math.random() * 2 - 1;
}

// TODO: this works but is rather crude.
function randomPointOnUnitSphere(): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  let r = Infinity;

  while (r > 1) {
    x = rand();
    y = rand();
    z = rand();
    r = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
  }

  return [x / r, y / r, z / r];
}

export function rayIntersectionShaderCode(intersectionCount: number) {
  return /* wgsl */ `
  struct Ray {
    x: f32,
    y: f32,
    z: f32,
    dx: f32,
    dy: f32,
    dz: f32,
  }

  struct Triangle {
    x: f32, y: f32, z: f32,
    u1: f32, u2: f32, u3: f32,
    v1: f32, v2: f32, v3: f32,
  }

  @group(0) @binding(0)
  var<storage, read_write> rayBuffer: array<Ray>;

  @group(0) @binding(1)
  var<storage, read> triangleBuffer: array<Triangle>;

  @group(0) @binding(2)
  var<storage, read_write> output: array<f32>;

  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn main(
    @builtin(global_invocation_id)
    global_id : vec3u,
  ) {
    let index = global_id.x;

    let triangleCount = i32(arrayLength(&triangleBuffer));
    let rayCount = u32(arrayLength(&rayBuffer));

    // Avoid accessing the buffer out of bounds - this could happen
    // if NUM_RAYS and WORKGROUP_SIZE don't line up.
    if (index >= rayCount) {
      return;
    }

    let ray = rayBuffer[index];

    // This is more or less a line-by-line translation of the Möller–Trumbore intersection algorithm.
    // TODO: research triangle intersection algorithms to see if there are others - though this one seems to be really simple so
    //       I doubt it can be improved much.
    // TODO: one potential idea would be to store u x v with the triangle, which saves on one cross product
    //       per test. The additional memory strain might not actually make this any faster though.

    let smallestPositiveNormal = 1.17549435082228750797e-38f;
    let eps = smallestPositiveNormal;
    let eps1 = 1 + eps;

    let raydirection = vec3f(ray.dx, ray.dy, ray.dz);

    for (var n = 0; n < ${intersectionCount}; n++) {
      for (var i = 0; i < triangleCount; i++) {
        let triangle = triangleBuffer[i];

        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);
        let ray_cross_e2 = cross(raydirection, edge2);
        let det = dot(edge1, ray_cross_e2);

        let inv_det = 1.0 / det;
        let offset = vec3f(ray.x - triangle.x, ray.y - triangle.y, ray.z - triangle.z);
        let u = inv_det * dot(offset, ray_cross_e2);

        let offset_cross_e1 = cross(offset, edge1);
        let v = inv_det * dot(raydirection, offset_cross_e1);

        let t = inv_det * dot(edge2, offset_cross_e1);

        // NOTE: this happens in a single if-statement at the end of each loop (rather than as each value is calculated)
        //       to reduce the number of times branching occurs. The amount of branching matters, since work-groups
        //       in the GPU run in lockstep, and branching messes around with that.
        if ((abs(det) < eps) || (u < -eps) || (v < -eps) || (u + v > eps1)) {
          // Ray missed the triangle.
        } else if (t > eps && t < output[index]) {
          output[index] = t;
        }
      }
    }
  }
`;
}

async function runRayIntersections(settings: Settings): Promise<{
  rays: Ray[];
  triangles: Triangle[];
  result: Float32Array | null;
}> {
  const rays: Ray[] = [];
  const triangles: Triangle[] = [];

  // Create the rays.
  for (let i = 0; i < settings.rayCount; ++i) {
    rays.push({
      position: [rand() * 100, rand() * 100, rand() * 100],
      direction: randomPointOnUnitSphere(),
    });
  }

  // Create the geometry.
  for (let i = 0; i < settings.triangleCount; ++i) {
    triangles.push({
      p1: [rand() * 100, rand() * 100, rand() * 100],
      p2: [rand() * 100, rand() * 100, rand() * 100],
      p3: [rand() * 100, rand() * 100, rand() * 100],
    });
  }

  // Run the shader and get the result.
  const result = await runShader(
    rayIntersectionShaderCode(settings.intersectionCount),
    [
      {
        data: raysToFloatArray(rays),
        readonly: false,
        output: false,
      },
      {
        data: trianglesToFloatArray(triangles),
        readonly: true,
        output: false,
      },
      {
        data: initialIntersectionsFloatArray(settings.rayCount),
        readonly: false,
        output: true,
      },
    ],
    settings.rayCount,
  );

  return { rays, triangles, result: result && result[0] };
}

export async function plotRayIntersections() {
  const { rays, triangles, result } = await runRayIntersections(PLOT_SETTINGS);
  console.log(result);
  console.log("plotting...");
  plotOutput(
    triangles,
    rays.map((ray, i) => [ray, result?.[i] || 0]),
  );
}

export async function stressTestRayIntersections() {
  const { rays, triangles, result } =
    await runRayIntersections(STRESS_TEST_SETTINGS);
  console.log(result);
}
