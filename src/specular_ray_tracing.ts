import { getGPUDevice } from "./lib";
import {
  FLOAT32_SIZE,
  Ray,
  SAMPLE_RATE,
  SPEED_OF_SOUND,
  Triangle,
  WORKGROUP_SIZE,
} from "./constants";
import { plotSpecularReflections } from "./draw";
import { trianglesToFloatArray } from "./floatarrays";
import { orientTriangles } from "./orient_surfaces";

type Vec3 = [number, number, number];

// From WebGPU specification
const MAX_STORAGE_BUFFER_SIZE = 134217728;

const SHOW_FACES = false;

// TODO: allow setting this somehow.
const OUTPUT_AUDIO_LENGTH = 4; // seconds.

// NOTE: placing at the exact origin [0,0,0] causes artefacts.
// TODO: once diffusion has been implemented, try [0,0,0] again.
const SOURCE_POSITION: Vec3 = [0.1, -0.1, -0.1];
const RECEIVER_POSITION: Vec3 = [8.5, 0.0, 0.0];

// TODO: frequency dependent.
const AIR_ABSORPTION_COEFF = 0.0013;

const CUBE_FACES: Triangle[] = [
  // Bottom face.
  {
    p1: [-10, -10, -10],
    p2: [10, -10, -10],
    p3: [-10, 10, -10],
  },
  {
    p1: [10, -10, -10],
    p2: [10, 10, -10],
    p3: [-10, 10, -10],
  },
  // Top face.
  {
    p1: [-10, -10, 10],
    p2: [10, -10, 10],
    p3: [-10, 10, 10],
  },
  {
    p1: [10, -10, 10],
    p2: [10, 10, 10],
    p3: [-10, 10, 10],
  },

  // Left face.
  {
    p1: [-10, -10, -10],
    p2: [-10, 10, 10],
    p3: [-10, -10, 10],
  },
  {
    p1: [-10, -10, -10],
    p2: [-10, 10, -10],
    p3: [-10, 10, 10],
  },
  // Right face.
  {
    p1: [10, -10, -10],
    p2: [10, 10, 10],
    p3: [10, -10, 10],
  },
  {
    p1: [10, -10, -10],
    p2: [10, 10, -10],
    p3: [10, 10, 10],
  },

  // Front face.
  {
    p1: [-10, -10, -10],
    p2: [10, -10, 10],
    p3: [-10, -10, 10],
  },
  {
    p1: [-10, -10, -10],
    p2: [10, -10, -10],
    p3: [10, -10, 10],
  },
  // Back face.
  {
    p1: [-10, 10, -10],
    p2: [10, 10, 10],
    p3: [-10, 10, 10],
  },
  {
    p1: [-10, 10, -10],
    p2: [10, 10, -10],
    p3: [10, 10, 10],
  },
];

interface Settings {
  rayCount: number;
  intersectionsPerPass: number;
  numberOfPasses: number;
}

const PLOT_SETTINGS: Settings = {
  rayCount: 10,
  intersectionsPerPass: 5,
  numberOfPasses: 1,
};

const ipp = Math.floor(MAX_STORAGE_BUFFER_SIZE / (2 * FLOAT32_SIZE * 20000));

const STRESS_TEST_SETTINGS: Settings = {
  rayCount: 20000,
  intersectionsPerPass: ipp,
  numberOfPasses: Math.ceil(20000 / ipp),
};

/**
 *
 * @returns uniform random number between -1 and 1.
 */
function rand() {
  return Math.random() * 2 - 1;
}

// TODO: this works but is rather crude.
function randomPointOnUnitSphere(): Vec3 {
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

function specularRayIntersectionShaderCode(intersectionCount: number) {
  return /* wgsl */ `
  struct Ray {
    x: f32,
    y: f32,
    z: f32,
    dx: f32,
    dy: f32,
    dz: f32,
    nx: f32,
    ny: f32,
    nz: f32,
    // TODO: these should really be integers.
    distanceTravelled: f32,
    intensity: f32,
  }

  struct Point {
    x: f32,
    y: f32,
    z: f32,
  }

  struct Triangle {
    x: f32, y: f32, z: f32,
    u1: f32, u2: f32, u3: f32,
    v1: f32, v2: f32, v3: f32,
  }

  struct Hit {
    time: f32,
    intensity: f32,
  }

  @group(0) @binding(0)
  var<storage, read_write> rayBuffer: array<Ray>;

  @group(0) @binding(1)
  var<storage, read> triangleBuffer: array<Triangle>;

  @group(0) @binding(2)
  var<storage, read_write> output: array<Hit>;

  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn main(
    @builtin(global_invocation_id)
    global_id : vec3u,
  ) {
    let rayIndex = global_id.x;

    let triangleCount = i32(arrayLength(&triangleBuffer));
    let rayCount = u32(arrayLength(&rayBuffer));

    // Avoid accessing the buffer out of bounds - this could happen
    // if NUM_RAYS and WORKGROUP_SIZE don't line up.
    if (rayIndex >= rayCount) {
      return;
    }

    let initialRay = rayBuffer[rayIndex];

    // This is more or less a line-by-line translation of the Möller–Trumbore intersection algorithm.
    // TODO: research triangle intersection algorithms to see if there are others - though this one seems to be really simple so
    //       I doubt it can be improved much.
    // TODO: one potential idea would be to store u x v with the triangle, which saves on one cross product
    //       per test. The additional memory strain might not actually make this any faster though.

    let smallestPositiveNormal = 1.17549435082228750797e-38f;
    let eps = smallestPositiveNormal;
    let eps1 = 1 + eps;

    var rayposition = vec3f(initialRay.x, initialRay.y, initialRay.z);
    var raydirection = vec3f(initialRay.dx, initialRay.dy, initialRay.dz);
    var raydistancetravelled = initialRay.distanceTravelled;
    var rayintensity = initialRay.intensity;

    var lastsurfacenormal = vec3(initialRay.nx, initialRay.ny, initialRay.nz);

    let receiverPosition = vec3(${RECEIVER_POSITION.join(",")});

    for (var n: u32 = 0; n < ${intersectionCount}; n++) {
      let index = rayIndex * ${intersectionCount} + n;

      // TODO: infinity
      var distance = 1e10;
      var closestTriangleIndex = triangleCount;
      var receiverRayTriangleDistance = 1e10; // TODO: infinity.

      let directionToReceiver = normalize(receiverPosition - rayposition);
      let distanceToReceiver = length(receiverPosition - rayposition);

      for (var i = 0; i < triangleCount; i++) {
        let triangle = triangleBuffer[i];

        // TODO: don't create a vec every time through the loop.
        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);
        let offset = vec3f(rayposition.x - triangle.x, rayposition.y - triangle.y, rayposition.z - triangle.z);

        let offset_cross_e1 = cross(offset, edge1);

        // Ray-trace to receiver.
        {
          // TODO: negative?
          let ray_cross_e2 = cross(directionToReceiver, edge2);

          // NOTE: greater than 0 iff ray is incident on backface.
          let dir = -dot(edge1, ray_cross_e2);  // directionToReceiver.(e1 x e2)

          let det = dot(edge1, ray_cross_e2);
          let inv_det = 1.0 / det;

          let u = inv_det * dot(offset, ray_cross_e2);
          let v = inv_det * dot(directionToReceiver, offset_cross_e1);

          let t = inv_det * dot(edge2, offset_cross_e1);

          // TODO: remove if?
          if (abs(det) < eps) || (u < -eps) || (v < -eps) || (u + v > eps1) {

          } else if (t > eps && dir >= 0) {
            receiverRayTriangleDistance = min(receiverRayTriangleDistance, t);
          }
        }

        // Ray-trace normal ray.
        let ray_cross_e2 = cross(raydirection, edge2);

        // NOTE: greater than 0 iff ray is incident on backface.
        let dir = -dot(edge1, ray_cross_e2);  // raydirection.(e1 x e2)

        let det = dot(edge1, ray_cross_e2);
        let inv_det = 1.0 / det;

        let u = inv_det * dot(offset, ray_cross_e2);
        let v = inv_det * dot(raydirection, offset_cross_e1);

        let t = inv_det * dot(edge2, offset_cross_e1);

        // NOTE: this happens in a single if-statement at the end of each loop (rather than as each value is calculated)
        //       to reduce the number of times branching occurs. The amount of branching matters, since work-groups
        //       in the GPU run in lockstep, and branching messes around with that.
        if ((abs(det) < eps) || (u < -eps) || (v < -eps) || (u + v > eps1)) {
          // Ray missed the triangle.
        } else if (t > eps && t < distance && dir >= 0) {
          distance = t;
          closestTriangleIndex = i;
        }
      }

      output[index].intensity = 0;

      // If the ray to the receiver did not hit a triangle before hitting the receiver,
      // add the contribution to the output.
      if (receiverRayTriangleDistance >= distanceToReceiver) {
        let cosNormalAngleToReceiver = dot(directionToReceiver, -lastsurfacenormal);

        // Only count if the ray is not intersecting the last surface.
        if (cosNormalAngleToReceiver > 0) {
          output[index].time = raydistancetravelled + distanceToReceiver;
          output[index].intensity = rayintensity * cosNormalAngleToReceiver;
        }
      }

      // This should always be true.
      if (closestTriangleIndex < triangleCount) {
        let triangle = triangleBuffer[closestTriangleIndex];
        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);

        let triangleNormal = normalize(cross(edge1, edge2));
        let reflected = normalize(reflect(raydirection, triangleNormal));
        let newposition = rayposition + raydirection * distance;

        rayposition = newposition;
        raydirection = reflected;
        raydistancetravelled += distance;
        rayintensity *= 0.9;
        lastsurfacenormal = triangleNormal;
      }
    }

    // Write the updated ray position/distance to the output buffer, ready for
    // the next pass.
    rayBuffer[rayIndex].x = rayposition.x;
    rayBuffer[rayIndex].y = rayposition.y;
    rayBuffer[rayIndex].z = rayposition.z;
    rayBuffer[rayIndex].dx = raydirection.x;
    rayBuffer[rayIndex].dy = raydirection.y;
    rayBuffer[rayIndex].dz = raydirection.z;
    rayBuffer[rayIndex].nx = lastsurfacenormal.x;
    rayBuffer[rayIndex].ny = lastsurfacenormal.y;
    rayBuffer[rayIndex].nz = lastsurfacenormal.z;
    rayBuffer[rayIndex].distanceTravelled = raydistancetravelled;
    rayBuffer[rayIndex].intensity = rayintensity;
  }
`;
}

class SpecularRayIntersections {
  device: GPUDevice;
  computePipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  outputBuffer: GPUBuffer;
  stagingBuffer: GPUBuffer;

  constructor(
    gpuDevice: GPUDevice,
    rays: Float32Array<ArrayBuffer>,
    triangles: Float32Array<ArrayBuffer>,
    output: Float32Array<ArrayBuffer>,
    code: string,
  ) {
    this.device = gpuDevice;

    const rayBuffer = this.device.createBuffer({
      size: rays.length * FLOAT32_SIZE,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
    const triangleBuffer = this.device.createBuffer({
      size: triangles.length * FLOAT32_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.outputBuffer = this.device.createBuffer({
      size: output.length * FLOAT32_SIZE,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });
    this.stagingBuffer = this.device.createBuffer({
      size: output.length * FLOAT32_SIZE,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Bind group layout and bind group define how the buffers are passed to the shader.
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0, // ray buffer
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 1, // triangle buffer
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2, // output buffer
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: rayBuffer } },
        { binding: 1, resource: { buffer: triangleBuffer } },
        { binding: 2, resource: { buffer: this.outputBuffer } },
      ],
    });

    // Create the GPU shader and compute pipeline.
    const shaderModule = this.device.createShaderModule({ code });
    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: { module: shaderModule, entryPoint: "main" },
    });

    // Schedule copying data into buffers.
    this.device.queue.writeBuffer(rayBuffer, 0, rays);
    this.device.queue.writeBuffer(triangleBuffer, 0, triangles);
    this.device.queue.writeBuffer(this.outputBuffer, 0, output);
  }

  async runPass(instancesCount: number) {
    // Schedule the GPU shader pass.
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(this.computePipeline);
    passEncoder.setBindGroup(0, this.bindGroup);

    passEncoder.dispatchWorkgroups(Math.ceil(instancesCount / WORKGROUP_SIZE));
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(
      this.outputBuffer,
      0,
      this.stagingBuffer,
      0,
      this.stagingBuffer.size,
    );

    console.time("run");

    // Execute the scheduled commands.
    this.device.queue.submit([commandEncoder.finish()]);

    // Map output buffers back to staging buffers (which can be read in JS).
    await this.stagingBuffer.mapAsync(
      GPUMapMode.READ,
      0,
      this.stagingBuffer.size,
    );

    console.timeEnd("run");

    // Get the data from the staging buffers, and unmap the staging buffers.
    const arrayDataOutput = this.stagingBuffer.getMappedRange().slice();

    // TODO: do we need a cleanup method for this class.
    this.stagingBuffer.unmap();

    // Convert to the correct type, and display the output.
    return new Float32Array(arrayDataOutput);
  }
}

async function runRayIntersections(settings: Settings): Promise<{
  rays: Ray[];
  triangles: Triangle[];
  result: Float32Array | null;
}> {
  console.time("Total (including setup)");
  console.log("Creating geometry");
  const rays: Ray[] = [];

  // Create the geometry.
  // Orient the triangles so that they all face outwards.
  const triangles = await orientTriangles(CUBE_FACES);

  // Create the rays.
  for (let i = 0; i < settings.rayCount; ++i) {
    rays.push({
      position: SOURCE_POSITION,
      direction: randomPointOnUnitSphere(),
    });
  }

  const gpuDevice = await getGPUDevice();

  if (!gpuDevice) {
    throw new Error("Aborted due to null GPU device");
  }

  const outputSize = 2 * settings.intersectionsPerPass * settings.rayCount;

  if (outputSize > MAX_STORAGE_BUFFER_SIZE) {
    console.log("Output buffer is too large, will not work");
  }

  const intersectionsRunner = new SpecularRayIntersections(
    gpuDevice,
    new Float32Array(
      rays.flatMap((ray) => [
        ...ray.position,
        ...ray.direction,
        ...[0, 0, 0],
        0,
        1,
      ]),
    ),
    trianglesToFloatArray(triangles),
    new Float32Array(outputSize),
    specularRayIntersectionShaderCode(settings.intersectionsPerPass),
  );

  console.time("Total (excluding setup)");

  // TODO BUG: don't cut this off arbitrarily.
  let output = new Float32Array(SAMPLE_RATE * OUTPUT_AUDIO_LENGTH);

  for (let i = 0; i < settings.numberOfPasses; i++) {
    // Run the shader and get the result.
    const result = await intersectionsRunner.runPass(settings.rayCount);

    let t = 10;

    for (let j = 0; j < result.length; j += 2) {
      output[Math.round(SAMPLE_RATE * (result[j] / SPEED_OF_SOUND))] +=
        result[j + 1] * Math.exp(-result[j] * AIR_ABSORPTION_COEFF);
    }
  }

  // TODO BUG: need to raytrace this to check it is line-of-sight
  //           (otherwise there will be no direct sound).
  const directSoundDistance = Math.sqrt(
    Math.pow(SOURCE_POSITION[0] - RECEIVER_POSITION[0], 2) +
      Math.pow(SOURCE_POSITION[1] - RECEIVER_POSITION[1], 2) +
      Math.pow(SOURCE_POSITION[1] - RECEIVER_POSITION[1], 2),
  );
  output[Math.round(SAMPLE_RATE * (directSoundDistance / SPEED_OF_SOUND))] +=
    (20000 / (4 * Math.PI * directSoundDistance ** 2)) *
    Math.exp(-directSoundDistance * AIR_ABSORPTION_COEFF);

  const result = await intersectionsRunner.runPass(settings.rayCount);

  console.timeEnd("Total (excluding setup)");
  console.timeEnd("Total (including setup)");
  console.log("Output", output.join(","));

  return {
    rays,
    triangles,
    result,
  };
}

export async function plotRaySpecularReflections() {
  const { rays, triangles, result } = await runRayIntersections(PLOT_SETTINGS);
  console.log(result);
  console.log("plotting...");

  const rayPositions: Vec3[][] = [];

  for (const ray of rays) {
    rayPositions.push([ray.position]);
  }

  // TODO: now broken!!
  if (result) {
    for (let i = 0; i < (result?.length || 0); i += 3) {
      rayPositions[
        Math.floor(i / (3 * PLOT_SETTINGS.intersectionsPerPass))
      ].push([result[i], result[i + 1], result[i + 2]]);
    }
  }

  console.log(rayPositions);

  plotSpecularReflections(triangles, rayPositions, SHOW_FACES);
}

export async function stressTestRaySpecularReflections() {
  const { rays, triangles, result } =
    await runRayIntersections(STRESS_TEST_SETTINGS);
  console.log(result);
}
