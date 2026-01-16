import { getGPUDevice } from "./webgpu";
import {
  FLOAT32_SIZE,
  materials,
  Ray,
  SAMPLE_RATE,
  SPEED_OF_SOUND,
  Triangle,
  Vec3,
  WORKGROUP_SIZE,
} from "./constants";
import { materialsToFloatArray, trianglesToFloatArray } from "./floatarrays";
import { orientTriangles } from "./orient_surfaces";
import { combineFilteredAudio } from "./dsp";

// From WebGPU specification
const STANDARD_MAX_STORAGE_BUFFER_SIZE = 134217728;
const STANDARD_MAX_UNIFORM_BUFFER_SIZE = 65536;

const RECEIVER_RADIUS = 1.0;

// TODO: frequency dependent.
const AIR_ABSORPTION_COEFF = 0.0013;

export interface Settings {
  sourcePosition: Vec3;
  receiverPosition: Vec3;
  rayCount: number;
  minBounces: number;
  audioDuration: number;
  geometry: Triangle[];
}

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

function specularRayIntersectionShaderCode(
  receiverPosition: Vec3,
  bounceCount: number,
) {
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
    distanceTravelled: f32,
    intensity125: f32,
    intensity250: f32,
    intensity500: f32,
    intensity1000: f32,
    intensity2000: f32,
    intensity4000: f32,
  }

  struct Point {
    x: f32,
    y: f32,
    z: f32,
  }

  struct Triangle {
    material: u32,
    x: f32, y: f32, z: f32,
    u1: f32, u2: f32, u3: f32,
    v1: f32, v2: f32, v3: f32,
  }

  struct Hit {
    time: f32,
    intensity: f32,
  }

  // TODO: could this just be part of the Triangle.
  struct Material {
    r125: f32,
    r250: f32,
    r500: f32,
    r1000: f32,
    r2000: f32,
    r4000: f32,
    scatter: f32,

    // Padding - required since the uniform must be a multiple of 16 bytes long.
    _1: f32,
  }

  @group(0) @binding(0)
  var<storage, read_write> rayBuffer: array<Ray>;

  @group(0) @binding(1)
  var<storage, read> triangleBuffer: array<Triangle>;

  @group(0) @binding(2)
  var<storage, read_write> band_125: array<Hit>;

  @group(0) @binding(3)
  var<storage, read_write> band_250: array<Hit>;

  @group(0) @binding(4)
  var<storage, read_write> band_500: array<Hit>;

  @group(0) @binding(5)
  var<storage, read_write> band_1000: array<Hit>;

  @group(0) @binding(6)
  var<storage, read_write> band_2000: array<Hit>;

  @group(0) @binding(7)
  var<storage, read_write> band_4000: array<Hit>;

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

    var intensity_125 = initialRay.intensity125;
    var intensity_250 = initialRay.intensity250;
    var intensity_500 = initialRay.intensity500;
    var intensity_1000 = initialRay.intensity1000;
    var intensity_2000 = initialRay.intensity2000;
    var intensity_4000 = initialRay.intensity4000;

    var lastsurfacenormal = vec3(initialRay.nx, initialRay.ny, initialRay.nz);

    let receiverPosition = vec3f(${receiverPosition.join(",")});

    for (var n: u32 = 0; n < ${bounceCount}; n++) {
      let index = rayIndex * ${bounceCount} + n;

      // TODO: infinity
      var rayTriangleDistance = 1e10;
      var closestTriangleIndex = triangleCount;
      var receiverRayTriangleDistance = 1e10; // TODO: infinity.

      let vecToReceiver = receiverPosition - rayposition;
      let directionToReceiver = normalize(vecToReceiver);
      let distanceToReceiver = length(vecToReceiver);

      // Loop over each triangle, checking:
      // - if the ray from the current location to the receiver intercepts with the triangle.
      // - if the ray from the current location in the current direction intercepts with the triangle.
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

          if (
            // Ray intercepts the triangle.
            (abs(det) >= eps) && (u >= -eps) && (v >= -eps) && (u + v <= eps1)

            // Ray intercepts the triangle in the positive direction.
            && t >= eps && dir >= 0
          ) {
            receiverRayTriangleDistance = min(receiverRayTriangleDistance, t);
          }
        }

        // Ray-trace specular ray.
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
        if (
          // Ray intercepts the triangle.
          (abs(det) >= eps) && (u >= -eps) && (v >= -eps) && (u + v <= eps1)

          // Ray intercepts the triangle in the positive direction.
          && t >= eps && dir >= 0

          // Ray intercepts the triangle before the previously-closest triangle.
          && t < rayTriangleDistance
        ) {
          rayTriangleDistance = t;
          closestTriangleIndex = i;
        }
      }

      band_125[index].intensity = 0;
      band_250[index].intensity = 0;
      band_500[index].intensity = 0;
      band_1000[index].intensity = 0;
      band_2000[index].intensity = 0;
      band_4000[index].intensity = 0;

      // This should always be true - it should always intersect a triangle.
      if (closestTriangleIndex < triangleCount) {
        let triangle = triangleBuffer[closestTriangleIndex];
        let material = materials[triangle.material];

        // If the ray to the receiver did not hit a triangle before hitting the receiver,
        // add the contribution to the output.
        if (receiverRayTriangleDistance >= distanceToReceiver) {
          let cosNormalAngleToReceiver = dot(directionToReceiver, -lastsurfacenormal);

          let rayVecToClosestReceiverPoint = dot(vecToReceiver, raydirection);
          let distanceFromRayToReceiver = length(vecToReceiver - rayVecToClosestReceiverPoint);
          let additionDueToRay = f32(distanceFromRayToReceiver <= ${RECEIVER_RADIUS});

          // Only count if the ray is not intersecting the last surface.
          if (cosNormalAngleToReceiver > 0) {
            let rayTriangleDistance = raydistancetravelled + distanceToReceiver;

            let totalIntensity = (1-material.scatter) * additionDueToRay + material.scatter * cosNormalAngleToReceiver;

            // TODO: this is a waste of memory.
            band_125[index].time = rayTriangleDistance;
            band_250[index].time = rayTriangleDistance;
            band_500[index].time = rayTriangleDistance;
            band_1000[index].time = rayTriangleDistance;
            band_2000[index].time = rayTriangleDistance;
            band_4000[index].time = rayTriangleDistance;

            band_125[index].intensity = intensity_125 * totalIntensity;
            band_250[index].intensity = intensity_250 * totalIntensity;
            band_500[index].intensity = intensity_500 * totalIntensity;
            band_1000[index].intensity = intensity_1000 * totalIntensity;
            band_2000[index].intensity = intensity_2000 * totalIntensity;
            band_4000[index].intensity = intensity_4000 * totalIntensity;
          }
        }

        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);

        let triangleNormal = normalize(cross(edge1, edge2));
        let reflected = normalize(reflect(raydirection, triangleNormal));
        let newposition = rayposition + raydirection * distance;

        rayposition = newposition;
        raydirection = reflected;
        raydistancetravelled += rayTriangleDistance;
        lastsurfacenormal = triangleNormal;

        intensity_125 *= material.r125;
        intensity_250 *= material.r250;
        intensity_500 *= material.r500;
        intensity_1000 *= material.r1000;
        intensity_2000 *= material.r2000;
        intensity_4000 *= material.r4000;
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
    rayBuffer[rayIndex].intensity125 = intensity_125;
    rayBuffer[rayIndex].intensity250 = intensity_250;
    rayBuffer[rayIndex].intensity500 = intensity_500;
    rayBuffer[rayIndex].intensity1000 = intensity_1000;
    rayBuffer[rayIndex].intensity2000 = intensity_2000;
    rayBuffer[rayIndex].intensity4000 = intensity_4000;
  }
`;
}

class SpecularRayTracer {
  device: GPUDevice;
  computePipeline: GPUComputePipeline;
  bindGroup: GPUBindGroup;
  outputBuffers: GPUBuffer[];
  stagingBuffers: GPUBuffer[];

  constructor(
    gpuDevice: GPUDevice,
    rays: Float32Array<ArrayBuffer>,
    triangles: Float32Array<ArrayBuffer>,
    materials: Float32Array<ArrayBuffer>,
    outputs: Float32Array<ArrayBuffer>[],
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
    const materialsBuffer = this.device.createBuffer({
      size: materials.length * FLOAT32_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.outputBuffers = outputs.map((output) =>
      this.device.createBuffer({
        size: output.length * FLOAT32_SIZE,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_SRC |
          GPUBufferUsage.COPY_DST,
      }),
    );
    this.stagingBuffers = outputs.map((output) =>
      this.device.createBuffer({
        size: output.length * FLOAT32_SIZE,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
    );

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
          binding: 2, // band 125
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 3, // band 250
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 4, // band 500
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 5, // band 1000
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 6, // band 2000
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 7, // band 4000
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 8, // materials
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: rayBuffer } },
        { binding: 1, resource: { buffer: triangleBuffer } },
        ...this.outputBuffers.map((buffer, i) => ({
          binding: 2 + i,
          resource: { buffer },
        })),
        { binding: 8, resource: { buffer: materialsBuffer } },
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
    this.device.queue.writeBuffer(materialsBuffer, 0, materials);
    for (let i = 0; i < outputs.length; i++) {
      this.device.queue.writeBuffer(this.outputBuffers[i], 0, outputs[i]);
    }
  }

  async runPass(instancesCount: number): Promise<Float32Array[]> {
    // Schedule the GPU shader pass.
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(this.computePipeline);
    passEncoder.setBindGroup(0, this.bindGroup);

    passEncoder.dispatchWorkgroups(Math.ceil(instancesCount / WORKGROUP_SIZE));
    passEncoder.end();

    for (let i = 0; i < this.outputBuffers.length; i++) {
      commandEncoder.copyBufferToBuffer(
        this.outputBuffers[i],
        0,
        this.stagingBuffers[i],
        0,
        this.stagingBuffers[i].size,
      );
    }

    console.time("run");

    // Execute the scheduled commands.
    this.device.queue.submit([commandEncoder.finish()]);

    // Map output buffers back to staging buffers (which can be read in JS).
    await Promise.all(
      this.stagingBuffers.map((buffer) =>
        buffer.mapAsync(GPUMapMode.READ, 0, buffer.size),
      ),
    );

    console.timeEnd("run");

    // Get the data from the staging buffers, and unmap the staging buffers.
    const arrayDataOutput = this.stagingBuffers.map((buffer) =>
      buffer.getMappedRange().slice(),
    );

    // TODO: do we need a cleanup method for this class.
    this.stagingBuffers.forEach((buffer) => buffer.unmap());

    // Convert to the correct type, and display the output.
    return arrayDataOutput.map((buffer) => new Float32Array(buffer));
  }
}

export async function rayTrace(
  settings: Settings,
  update: (bounces: number, totalBounces: number) => void,
): Promise<Float32Array<ArrayBuffer> | null> {
  console.time("Total (including setup)");
  console.log("Creating geometry");
  const rays: Ray[] = [];

  // Create the geometry.
  // Orient the triangles so that they all face outwards.
  const triangles = await orientTriangles(settings.geometry);

  // Create the rays.
  for (let i = 0; i < settings.rayCount; ++i) {
    rays.push({
      position: settings.sourcePosition,
      direction: randomPointOnUnitSphere(),
    });
  }

  const gpuDevice = await getGPUDevice();

  if (!gpuDevice) {
    throw new Error("Aborted due to null GPU device");
  }

  const maxStorageBufferSize =
    gpuDevice.limits.maxStorageBufferBindingSize ||
    STANDARD_MAX_STORAGE_BUFFER_SIZE;

  // Number of bounces per pass is limited by how large the output buffer is allowed to be.
  // Each ray outputs 2 floats (distance and intensity) per bounce.
  const maximumBouncesPerPass = Math.floor(
    maxStorageBufferSize / (2 * FLOAT32_SIZE * settings.rayCount),
  );

  const bouncesPerPass = Math.min(settings.minBounces, maximumBouncesPerPass);
  const numberOfPasses = Math.ceil(settings.minBounces / bouncesPerPass);

  const numberOfBounces = numberOfPasses * bouncesPerPass;

  const outputSize = 2 * bouncesPerPass * settings.rayCount;

  if (outputSize > maxStorageBufferSize) {
    console.log("Output buffer is too large, will not work");
  }

  const rayTracer = new SpecularRayTracer(
    gpuDevice,
    new Float32Array(
      rays.flatMap((ray) => [
        ...ray.position,
        ...ray.direction,
        ...[0, 0, 0],
        0,
        1,
        1,
        1,
        1,
        1,
        1,
      ]),
    ),
    trianglesToFloatArray(triangles),
    materialsToFloatArray(materials),
    [
      new Float32Array(outputSize),
      new Float32Array(outputSize),
      new Float32Array(outputSize),
      new Float32Array(outputSize),
      new Float32Array(outputSize),
      new Float32Array(outputSize),
    ],
    specularRayIntersectionShaderCode(
      settings.receiverPosition,
      bouncesPerPass,
    ),
  );

  console.time("Total (excluding setup)");

  // TODO BUG: don't cut this off arbitrarily.
  let output125 = new Float32Array(SAMPLE_RATE * settings.audioDuration);
  let output250 = new Float32Array(SAMPLE_RATE * settings.audioDuration);
  let output500 = new Float32Array(SAMPLE_RATE * settings.audioDuration);
  let output1000 = new Float32Array(SAMPLE_RATE * settings.audioDuration);
  let output2000 = new Float32Array(SAMPLE_RATE * settings.audioDuration);
  let output4000 = new Float32Array(SAMPLE_RATE * settings.audioDuration);

  for (let i = 0; i < numberOfPasses; i++) {
    update(i * bouncesPerPass, numberOfBounces);

    // Run the shader and get the result.
    const result = await rayTracer.runPass(settings.rayCount);

    for (let j = 0; j < result[0].length; j += 2) {
      const index = Math.round(SAMPLE_RATE * (result[0][j] / SPEED_OF_SOUND));
      const air_absorption = Math.exp(-result[0][j] * AIR_ABSORPTION_COEFF);
      output125[index] += result[0][j + 1] * air_absorption;
      output250[index] += result[1][j + 1] * air_absorption;
      output500[index] += result[2][j + 1] * air_absorption;
      output1000[index] += result[3][j + 1] * air_absorption;
      output2000[index] += result[4][j + 1] * air_absorption;
      output4000[index] += result[5][j + 1] * air_absorption;
    }
  }

  update(numberOfBounces, numberOfBounces);

  const outputAudio = combineFilteredAudio(
    output125,
    output250,
    output500,
    output1000,
    output2000,
    output4000,
  );

  console.timeEnd("Total (excluding setup)");
  console.timeEnd("Total (including setup)");

  console.log(outputAudio.join(","));

  return outputAudio;
}
