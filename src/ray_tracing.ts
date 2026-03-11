import { getGPUDevice } from "./webgpu";
import {
  FLOAT32_SIZE,
  Material,
  Ray,
  SAMPLE_RATE,
  SPEED_OF_SOUND,
  Triangle,
  Vec3,
  WORKGROUP_SIZE,
} from "./constants";
import { materialsToFloatArray, trianglesToFloatArray } from "./floatarrays";
import { combineFilteredAudio } from "./dsp";

// From WebGPU specification
const STANDARD_MAX_STORAGE_BUFFER_SIZE = 134217728;
const STANDARD_MAX_UNIFORM_BUFFER_SIZE = 65536;

// TODO: frequency dependent.
const AIR_ABSORPTION_COEFF = 0.0013;

export type Receiver = {
  position: Vec3;
  radius: number;
};

export type Settings = {
  sourcePosition: Vec3;
  receivers: Receiver[];
  rayCount: number;
  throttle: number;
  rayPlotCount: number;
  bouncePlotCount: number;
  audioDuration: number;
  geometry: Triangle[];
  materials: Material[];
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

function normalize(v: Vec3): Vec3 {
  const magnitude = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  return [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude];
}

function specularRayIntersectionShaderCode(
  receivers: Receiver[],
  materials: Material[],
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
    material: f32,  // Index into materials array.
    x: f32, y: f32, z: f32,
    u1: f32, u2: f32, u3: f32,
    v1: f32, v2: f32, v3: f32,
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
  var<storage, read_write> distances: array<f32>;

  @group(0) @binding(3)
  var<storage, read_write> band_125_and_250: array<f32>;

  @group(0) @binding(4)
  var<storage, read_write> band_500_and_1000: array<f32>;

  @group(0) @binding(5)
  var<storage, read_write> band_2000_and_4000: array<f32>;

  @group(0) @binding(6)
  var<storage, read_write> x_and_y: array<f32>;

  @group(0) @binding(7)
  var<storage, read_write> z_and_ray_intensity: array<f32>;

  @group(0) @binding(8)
  var<uniform> materials: array<Material, ${materials.length}>;

  // From the spec:
  // Implementations may assume that overflow, infinities, and NaNs are not present during shader execution.
  // Therefore we define infinity to be the largest positive finite instead.
  const INFINITY: f32 = 0x1.fffffep+127f;
  
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

    var receiverPositions: array<vec3f, ${receivers.length}>;
    ${receivers.map((receiver, i) => "receiverPositions[" + i + "] = vec3f(" + receiver.position.join(",") + ");").join("")}

    var receiverRadii: array<f32, ${receivers.length}>;
    ${receivers.map((receiver, i) => "receiverRadii[" + i + "] = " + receiver.radius + ";").join("")}

    for (var n: u32 = 0; n < ${bounceCount}; n++) {
      var vecToReceivers: array<vec3f, ${receivers.length}>;
      var directionToReceivers: array<vec3f, ${receivers.length}>;
      var distanceToReceivers: array<f32, ${receivers.length}>;
      ${receivers.map((_, i) => "vecToReceivers[" + i + "] = receiverPositions[" + i + "] - rayposition;").join("")}
      ${receivers.map((_, i) => "directionToReceivers[" + i + "] = normalize(vecToReceivers[" + i + "]);").join("")}
      ${receivers.map((_, i) => "distanceToReceivers[" + i + "] = length(vecToReceivers[" + i + "]);").join("")}

      let lowerIndex = rayIndex * ${bounceCount * receivers.length} + n * ${receivers.length};
      let upperIndex = arrayLength(&distances) + lowerIndex;

      var rayTriangleDistance = INFINITY;
      var closestTriangleIndex = triangleCount;
      var receiverRayTriangleDistances: array<f32, ${receivers.length}>;
      ${receivers.map((_, i) => "receiverRayTriangleDistances[" + i + "] = INFINITY;").join("")}

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

        // Ray-trace to receivers.
        for (var j = 0; j < ${receivers.length}; j++) {
          // TODO: negative?
          let ray_cross_e2 = cross(directionToReceivers[j], edge2);

          // NOTE: greater than 0 iff ray is incident on backface.
          let dir = -dot(edge1, ray_cross_e2);  // directionToReceiver.(e1 x e2)

          let det = dot(edge1, ray_cross_e2);
          let inv_det = 1.0 / det;

          let u = inv_det * dot(offset, ray_cross_e2);
          let v = inv_det * dot(directionToReceivers[j], offset_cross_e1);

          let t = inv_det * dot(edge2, offset_cross_e1);

          if (
            // Ray intercepts the triangle.
            (abs(det) >= eps) && (u >= -eps) && (v >= -eps) && (u + v <= eps1)

            // Ray intercepts the triangle in the positive direction.
            && t >= eps && dir >= 0
          ) {
            receiverRayTriangleDistances[j] = min(receiverRayTriangleDistances[j], t);
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

      for (var j: u32 = 0; j < ${receivers.length}; j++) {
        band_125_and_250[lowerIndex + j] = 0;
        band_125_and_250[upperIndex + j] = 0;
        band_500_and_1000[lowerIndex + j] = 0;
        band_500_and_1000[upperIndex + j] = 0;
        band_2000_and_4000[lowerIndex + j] = 0;
        band_2000_and_4000[upperIndex + j] = 0;
      }

      // This should always be true - it should always intersect a triangle.
      if (closestTriangleIndex < triangleCount) {
        let triangle = triangleBuffer[closestTriangleIndex];
        let material = materials[u32(triangle.material)];

        // TODO: unroll this loop (and all the other receivers loops).
        for (var j: u32 = 0; j < ${receivers.length}; j++) {
          // If the ray to the receiver did not hit a triangle before hitting the receiver,
          // add the contribution to the output.
          if (receiverRayTriangleDistances[j] >= distanceToReceivers[j]) {
            let cosNormalAngleToReceiver = dot(directionToReceivers[j], -lastsurfacenormal);

            // Only count if the ray is not intersecting the last surface.
            if (cosNormalAngleToReceiver >= 0) {
              let rayTriangleDistance = raydistancetravelled + distanceToReceivers[j];
              let rayVecToClosestReceiverPoint = dot(vecToReceivers[j], raydirection) * raydirection;
              let distanceFromRayToReceiver = length(vecToReceivers[j] - rayVecToClosestReceiverPoint);
              let additionDueToRay = f32(distanceFromRayToReceiver <= receiverRadii[j]);
                
              // let totalIntensity = additionDueToRay + cosNormalAngleToReceiver;
              let totalIntensity = (1 - material.scatter) * additionDueToRay + material.scatter * cosNormalAngleToReceiver;
              // let totalIntensity = additionDueToRay;

              distances[lowerIndex + j] = rayTriangleDistance;

              band_125_and_250[lowerIndex + j] = intensity_125 * totalIntensity;
              band_125_and_250[upperIndex + j] = intensity_250 * totalIntensity;
              band_500_and_1000[lowerIndex + j] = intensity_500 * totalIntensity;
              band_500_and_1000[upperIndex + j] = intensity_1000 * totalIntensity;
              band_2000_and_4000[lowerIndex + j] = intensity_2000 * totalIntensity;
              band_2000_and_4000[upperIndex + j] = intensity_4000 * totalIntensity;
            }
          }
        }

        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);

        let triangleNormal = normalize(cross(edge1, edge2));
        let reflected = normalize(reflect(raydirection, triangleNormal));
        let newposition = rayposition + raydirection * rayTriangleDistance;

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

        // NOTE: if there is more than 1 receiver, then this is wasteful.
        x_and_y[lowerIndex] = newposition.x;
        x_and_y[upperIndex] = newposition.y;
        z_and_ray_intensity[lowerIndex] = newposition.z;
        z_and_ray_intensity[upperIndex] = (intensity_125 + intensity_250 + intensity_500 + intensity_1000 + intensity_2000 + intensity_4000) / 6;
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
          binding: 2, // distances
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 3, // band 250 and 500
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 4, // band 1000 and 2000
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 5, // band 2000 and 4000
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 6, // x and y
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 7, // z and ray intensity
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

export type RayTraceOutput = {
  audio: Float32Array<ArrayBuffer>[];
  bounceCoordinates: Float32Array<ArrayBuffer>[];
};

export async function rayTrace(
  settings: Settings,
  update: (bounces: number, totalBounces: number) => void,
): Promise<RayTraceOutput | null> {
  update(0, 1);

  console.time("Total (including setup)");
  console.log("Creating geometry");
  const rays: Ray[] = [];
  const triangles = settings.geometry;

  // Create the rays.
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  for (let i = 0; i < settings.rayCount; ++i) {
    const theta = (2 * Math.PI * i) / goldenRatio;
    const phi = Math.acos(1 - (2 * i) / settings.rayCount);
    const ray: Vec3 = [
      Math.cos(theta) * Math.sin(phi),
      Math.sin(theta) * Math.sin(phi),
      Math.cos(phi),
    ];

    rays.push({
      position: settings.sourcePosition,
      direction: normalize(ray),
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
  const bouncesPerPass = Math.max(
    1,
    Math.floor(
      ((1 - settings.throttle) * maxStorageBufferSize) /
        (2 * FLOAT32_SIZE * settings.rayCount * settings.receivers.length),
    ),
  );

  console.log("bouncesPerPass", bouncesPerPass);

  // TODO: expose this as a setting.
  const maxPasses = 10;

  const outputSize =
    2 * bouncesPerPass * settings.rayCount * settings.receivers.length;

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
    trianglesToFloatArray(triangles, settings.materials),
    materialsToFloatArray(settings.materials),
    [
      new Float32Array(outputSize / 2), // distance
      new Float32Array(outputSize), // band 125 and 250
      new Float32Array(outputSize), // band 500 and 1000
      new Float32Array(outputSize), // band 2000a and 4000
      new Float32Array(outputSize), // x and y
      new Float32Array(outputSize), // z and ray intensity
    ],
    specularRayIntersectionShaderCode(
      settings.receivers,
      settings.materials,
      bouncesPerPass,
    ),
  );

  const receiversCount = settings.receivers.length;

  const outputs: [
    Float32Array<ArrayBuffer>,
    Float32Array<ArrayBuffer>,
    Float32Array<ArrayBuffer>,
    Float32Array<ArrayBuffer>,
    Float32Array<ArrayBuffer>,
    Float32Array<ArrayBuffer>,
  ][] = [];

  for (let i = 0; i < receiversCount; ++i) {
    outputs.push([
      new Float32Array(SAMPLE_RATE * settings.audioDuration), // 125Hz
      new Float32Array(SAMPLE_RATE * settings.audioDuration), // 250Hz
      new Float32Array(SAMPLE_RATE * settings.audioDuration), // 500Hz
      new Float32Array(SAMPLE_RATE * settings.audioDuration), // 1kHz
      new Float32Array(SAMPLE_RATE * settings.audioDuration), // 2kHz
      new Float32Array(SAMPLE_RATE * settings.audioDuration), // 4kHz
    ]);
  }

  const THRESHOLD = 1e-12;
  let averageValue = 0;

  const gapBetweenIndicesToCount = Math.floor(
    settings.rayCount / settings.rayPlotCount,
  );

  const plottedRayCoordinates: Float32Array<ArrayBuffer>[] = [];

  for (let i = 0; i < settings.rayPlotCount; ++i) {
    plottedRayCoordinates.push(new Float32Array(4 * settings.bouncePlotCount));
    plottedRayCoordinates[i][0] = 1.0;
    plottedRayCoordinates[i][1] = settings.sourcePosition[0];
    plottedRayCoordinates[i][2] = settings.sourcePosition[1];
    plottedRayCoordinates[i][3] = settings.sourcePosition[2];
  }

  console.time("Total (excluding setup)");

  // TODO BUG: number of bounces to plot does not line up with actual number plotted.

  for (let i = 0; i < maxPasses; i++) {
    update((i + 1) * bouncesPerPass, maxPasses * bouncesPerPass);

    // Run the shader and get the result.
    const result = await rayTracer.runPass(settings.rayCount);

    let thisPassAverageValue = 0;
    let thisPassMaxValue = 0;

    for (let k = 0; k < receiversCount; ++k) {
      const output = outputs[k];

      for (let j = k; j < result[0].length; j += receiversCount) {
        const index = Math.round(SAMPLE_RATE * (result[0][j] / SPEED_OF_SOUND));
        const air_absorption = Math.exp(-result[0][j] * AIR_ABSORPTION_COEFF);

        const lowerIndex = j;
        const upperIndex = result[0].length + j;

        output[0][index] += result[1][lowerIndex] * air_absorption;
        output[1][index] += result[1][upperIndex] * air_absorption;
        output[2][index] += result[2][lowerIndex] * air_absorption;
        output[3][index] += result[2][upperIndex] * air_absorption;
        output[4][index] += result[3][lowerIndex] * air_absorption;
        output[5][index] += result[3][upperIndex] * air_absorption;

        // TODO: can probably do in shader.
        const avg =
          (result[1][lowerIndex] +
            result[1][upperIndex] +
            result[2][lowerIndex] +
            result[2][upperIndex] +
            result[3][lowerIndex] +
            result[3][upperIndex]) *
          air_absorption;
        thisPassAverageValue += Math.abs(avg);
        thisPassMaxValue = Math.max(Math.abs(avg), thisPassMaxValue);

        const rayIndex = Math.floor(j / (bouncesPerPass * receiversCount));
        const bounceIndex =
          bouncesPerPass * i +
          (j - bouncesPerPass * receiversCount * rayIndex) / receiversCount;
        if (
          k === 0 &&
          rayIndex % gapBetweenIndicesToCount === 0 &&
          rayIndex / gapBetweenIndicesToCount < plottedRayCoordinates.length &&
          bounceIndex < settings.bouncePlotCount
        ) {
          // Plus 1 so we skip the initial location.
          const pointIndex = (bounceIndex + 1) * 4;

          plottedRayCoordinates[rayIndex / gapBetweenIndicesToCount][
            pointIndex
          ] = result[5][upperIndex];
          plottedRayCoordinates[rayIndex / gapBetweenIndicesToCount][
            pointIndex + 1
          ] = result[4][lowerIndex];
          plottedRayCoordinates[rayIndex / gapBetweenIndicesToCount][
            pointIndex + 2
          ] = result[4][upperIndex];
          plottedRayCoordinates[rayIndex / gapBetweenIndicesToCount][
            pointIndex + 3
          ] = result[5][lowerIndex];
        }
      }
    }

    if (i === 0) {
      averageValue = thisPassAverageValue;
      console.log("average", thisPassAverageValue, averageValue);
    } else {
      if (thisPassAverageValue > averageValue) {
        // This could occur if the passes are so short that the first pass
        // has no audio in it at all.
        averageValue = thisPassAverageValue;
      } else if (thisPassMaxValue < THRESHOLD * averageValue) {
        console.log("below threshold on pass", i);
        update((i + 1) * bouncesPerPass, (i + 1) * bouncesPerPass);
        break;
      }
    }
  }

  const outputAudio = outputs.map((output) => combineFilteredAudio(...output));

  console.timeEnd("Total (excluding setup)");
  console.timeEnd("Total (including setup)");

  console.log(outputAudio.join(","));

  // Free all resources on the GPU.
  gpuDevice.destroy();

  return {
    audio: outputAudio,
    bounceCoordinates: plottedRayCoordinates,
  };
}
