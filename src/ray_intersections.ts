import { runShader } from "./lib";
import { WORKGROUP_SIZE } from "./constants";

const NUM_RAYS = 20000;
const NUM_TRIANGLES = 3000;
const NUM_INTERSECTIONS = 20000;

// 6 floats (x, y, z, dx, dy, dz).
const RAY_BUFFER_LENGTH = NUM_RAYS * 6;

// 9 floats (x1, y1, z1, x2, y2, z2, x3, y3, z3).
const TRIANGLE_BUFFER_LENGTH = NUM_TRIANGLES * 9;

// 1 float (distance).
const RESULT_BUFFER_LENGTH = NUM_RAYS * 1;

/**
 *
 * @returns uniform random number between -1 and 1.
 */
function rand() {
  return Math.random() * 2 - 1;
}

// TODO: this works but is rather crude.
function randomPointOnUnitSphere() {
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

// Create the ray data.
const rayData = new Float32Array(RAY_BUFFER_LENGTH);

for (let i = 0; i < NUM_RAYS; ++i) {
  const ind = i * 6;

  rayData[ind + 0] = rand() * 100;
  rayData[ind + 1] = rand() * 100;
  rayData[ind + 2] = rand() * 100;

  let [dx, dy, dz] = randomPointOnUnitSphere();
  rayData[ind + 3] = dx;
  rayData[ind + 4] = dy;
  rayData[ind + 5] = dz;
}

// Create the triangle data.
const triangleData = new Float32Array(TRIANGLE_BUFFER_LENGTH);

for (let i = 0; i < NUM_TRIANGLES; ++i) {
  const ind = i * 9;

  let x1 = rand() * 100;
  let y1 = rand() * 100;
  let z1 = rand() * 100;
  let x2 = rand() * 100;
  let y2 = rand() * 100;
  let z2 = rand() * 100;
  let x3 = rand() * 100;
  let y3 = rand() * 100;
  let z3 = rand() * 100;

  triangleData[ind + 0] = x1;
  triangleData[ind + 1] = y1;
  triangleData[ind + 2] = z1;
  triangleData[ind + 3] = x2 - x1;
  triangleData[ind + 4] = y2 - y1;
  triangleData[ind + 5] = z2 - z1;
  triangleData[ind + 6] = x3 - x1;
  triangleData[ind + 7] = y3 - y1;
  triangleData[ind + 8] = z3 - z1;
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

    // This is more or less a line-by-line translation of the Möller–Trumbore intersection algorithm C++ example from Wikipedia.
    // TODO: research triangle intersection algorithms to see if there are others - though this one seems to be really simple so
    //       I doubt it can be improved much.

    let eps = 0.0000001; // TODO: find a principled value for this.
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

        // TODO: I removed a bunch of useless epsilon checks here, is that OK? It reduces time from >40s to 27s.
        // NOTE: this happens in a single if-statement at the end of each loop (rather than as each value is calculated)
        //       to reduce the number of times branching occurs. The amount of branching matters, since work-groups
        //       in the GPU run in lockstep, and branching messes around with that.
        if ((abs(det) < eps) || (u < -eps) || (u > eps1) || (v < -eps) || (u + v > eps1)) {
          // Ray missed the triangle.
        } else if (t > eps && t < output[index]) {
          output[index] = t;
        }
      }
    }
  }
`;
}

// Create the result data - this is initially infinity (i.e. no intersection).
let resultData = new Float32Array(RESULT_BUFFER_LENGTH).fill(Infinity);

export async function runRayIntersections() {
  const result = await runShader(
    rayIntersectionShaderCode(NUM_INTERSECTIONS),
    [
      {
        data: rayData,
        readonly: false,
        output: false,
      },
      {
        data: triangleData,
        readonly: true,
        output: false,
      },
      {
        data: resultData,
        readonly: false,
        output: true,
      },
    ],
    NUM_RAYS,
  );

  console.log(result);
}
