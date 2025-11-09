import { getGPUDevice, runShader } from "./lib";
import { FLOAT32_SIZE, Ray, Triangle, WORKGROUP_SIZE } from "./constants";
import { plotSpecularReflections } from "./draw";
import {
  raysToFloatArray,
  trianglesToFloatArray,
  initialIntersectionsFloatArray,
} from "./floatarrays";

const PLOT_CUBE = true;
const SHOW_FACES = false;

const CUBE_FACES: Triangle[] = [
  // Bottom face.
  {
    p1: [-100, -100, -100],
    p2: [100, -100, -100],
    p3: [-100, 100, -100],
  },
  {
    p1: [100, -100, -100],
    p2: [100, 100, -100],
    p3: [-100, 100, -100],
  },
  // Top face.
  {
    p1: [-100, -100, 100],
    p2: [100, -100, 100],
    p3: [-100, 100, 100],
  },
  {
    p1: [100, -100, 100],
    p2: [100, 100, 100],
    p3: [-100, 100, 100],
  },

  // Left face.
  {
    p1: [-100, -100, -100],
    p2: [-100, 100, 100],
    p3: [-100, -100, 100],
  },
  {
    p1: [-100, -100, -100],
    p2: [-100, 100, -100],
    p3: [-100, 100, 100],
  },
  // Right face.
  {
    p1: [100, -100, -100],
    p2: [100, 100, 100],
    p3: [100, -100, 100],
  },
  {
    p1: [100, -100, -100],
    p2: [100, 100, -100],
    p3: [100, 100, 100],
  },

  // Front face.
  {
    p1: [-100, -100, -100],
    p2: [100, -100, 100],
    p3: [-100, -100, 100],
  },
  {
    p1: [-100, -100, -100],
    p2: [100, -100, -100],
    p3: [100, -100, 100],
  },
  // Back face.
  {
    p1: [-100, 100, -100],
    p2: [100, 100, 100],
    p3: [-100, 100, 100],
  },
  {
    p1: [-100, 100, -100],
    p2: [100, 100, -100],
    p3: [100, 100, 100],
  },
];

interface Settings {
  rayCount: number;
  triangleCount: number;
  intersectionsPerPass: number;
  numberOfPasses: number;
}

const PLOT_SETTINGS: Settings = {
  rayCount: PLOT_CUBE ? 10 : 1000,
  triangleCount: 50,
  intersectionsPerPass: 5,
  numberOfPasses: 10,
};

const STRESS_TEST_SETTINGS: Settings = {
  rayCount: 20000,
  triangleCount: 3000,
  intersectionsPerPass: 1000,
  numberOfPasses: 20,
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

function specularRayIntersectionShaderCode(intersectionCount: number) {
  return /* wgsl */ `
  struct Ray {
    x: f32,
    y: f32,
    z: f32,
    dx: f32,
    dy: f32,
    dz: f32,
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

  @group(0) @binding(0)
  var<storage, read> rayBuffer: array<Ray>;

  @group(0) @binding(1)
  var<storage, read> triangleBuffer: array<Triangle>;

  @group(0) @binding(2)
  var<storage, read_write> output: array<Point>;

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

    for (var n: u32 = 0; n < ${intersectionCount}; n++) {
      let index = rayIndex * ${intersectionCount} + n;

      // TODO: infinity
      var distance = 1e10;
      var closestTriangleIndex = triangleCount;

      for (var i = 0; i < triangleCount; i++) {
        let triangle = triangleBuffer[i];

        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);
        let ray_cross_e2 = cross(raydirection, edge2);
        let det = dot(edge1, ray_cross_e2);

        let inv_det = 1.0 / det;
        let offset = vec3f(rayposition.x - triangle.x, rayposition.y - triangle.y, rayposition.z - triangle.z);
        let u = inv_det * dot(offset, ray_cross_e2);

        let offset_cross_e1 = cross(offset, edge1);
        let v = inv_det * dot(raydirection, offset_cross_e1);

        let t = inv_det * dot(edge2, offset_cross_e1);

        // NOTE: this happens in a single if-statement at the end of each loop (rather than as each value is calculated)
        //       to reduce the number of times branching occurs. The amount of branching matters, since work-groups
        //       in the GPU run in lockstep, and branching messes around with that.
        if ((abs(det) < eps) || (u < -eps) || (v < -eps) || (u + v > eps1)) {
          // Ray missed the triangle.
        } else if (t > eps && t < distance) {
          distance = t;
          closestTriangleIndex = i;
        }
      }

      if (closestTriangleIndex < triangleCount) {
        let triangle = triangleBuffer[closestTriangleIndex];
        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);

        let triangleNormal = normalize(cross(edge1, edge2));
        let reflected = normalize(reflect(raydirection, triangleNormal));

        // TODO: find a good way to do this.
        let newposition = rayposition + raydirection * (distance - 0.0001);

        output[index].x = newposition.x;
        output[index].y = newposition.y;
        output[index].z = newposition.z;

        rayposition = newposition;
        raydirection = reflected;
      }
    }
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
          buffer: { type: "read-only-storage" },
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
  const rays: Ray[] = [];
  const triangles: Triangle[] = [];

  // Create the geometry.
  if (PLOT_CUBE) {
    triangles.push(...CUBE_FACES);
  } else {
    for (let i = 0; i < settings.triangleCount; ++i) {
      triangles.push({
        p1: [rand() * 100, rand() * 100, rand() * 100],
        p2: [rand() * 100, rand() * 100, rand() * 100],
        p3: [rand() * 100, rand() * 100, rand() * 100],
      });
    }
  }

  // Create the rays.
  for (let i = 0; i < settings.rayCount; ++i) {
    rays.push({
      position: [rand() * 100, rand() * 100, rand() * 100],
      direction: randomPointOnUnitSphere(),
    });
  }

  const gpuDevice = await getGPUDevice();

  if (!gpuDevice) {
    throw new Error("Aborted due to null GPU device");
  }

  const intersectionsRunner = new SpecularRayIntersections(
    gpuDevice,
    raysToFloatArray(rays),
    trianglesToFloatArray(triangles),
    initialIntersectionsFloatArray(
      3 * settings.intersectionsPerPass * settings.rayCount,
    ),
    specularRayIntersectionShaderCode(settings.intersectionsPerPass),
  );

  for (let i = 0; i < settings.numberOfPasses - 1; i++) {
    await intersectionsRunner.runPass(settings.rayCount);
  }

  // Run the shader and get the result.
  const result = await intersectionsRunner.runPass(settings.rayCount);

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

  const rayPositions: [number, number, number][][] = [];

  for (const ray of rays) {
    rayPositions.push([ray.position]);
  }

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
