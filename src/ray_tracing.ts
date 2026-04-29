import {
  getGPUDevice,
  ComputeShaderPipeline,
  ShaderBuffer,
} from "./compute_shader";
import {
  FLAG_ALIVE,
  FLAG_ESCAPED,
  FLOAT32_SIZE,
  Material,
  Ray,
  SAMPLE_RATE,
  SPEED_OF_SOUND,
  STANDARD_MAX_STORAGE_BUFFER_SIZE,
  STANDARD_MAX_UNIFORM_BUFFER_SIZE,
  Triangle,
  WASM_MAX_STORAGE_BUFFER_SIZE,
  WASM_MAX_UNIFORM_BUFFER_SIZE,
  WORKGROUP_SIZE,
} from "./constants";
import { vDot, Vec3, vNormalise } from "./vectors";
import {
  materialsToFloatArray,
  raysToFloatArray,
  SIZEOF_MATERIAL,
  SIZEOF_RAY,
  trianglesToFloatArray,
} from "./floatarrays";
import { combineFilteredAudio } from "./dsp";
import { error, log } from "./log";
import { WasmPipeline } from "./wasm";

const AIR_ABSORPTION_COEFF = 0.0013;

export type Receiver = {
  position: Vec3;
  radius: number;
};

export type RayTraceOptions = {
  sourcePosition: Vec3;
  sourceDirection: Vec3 | null;
  receivers: Receiver[];
  useWasm: boolean;
  rayCount: number;
  throttle: number;
  rayPlotCount: number;
  bouncePlotCount: number;
  audioDuration: number;
  geometry: Triangle[];
  materials: Material[];
};

/**
 * Generate the shader code. This is written in WGSL.
 * If you're in VSCode, you can install the vscode-wgsl-literal plugin
 * to enable syntax highlighting.
 * @param receivers
 * @param materials
 * @param bounceCount bounces per shader pass.
 * @returns the WGSL code to be run on the compute shader.
 */
function specularRayIntersectionShaderCode(
  receivers: Receiver[],
  materials: Material[],
  bounceCount: number,
) {
  return /* wgsl */ `
  // Struct definitions.

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
    distance_travelled: f32,
    intensity125: f32,
    intensity250: f32,
    intensity500: f32,
    intensity1000: f32,
    intensity2000: f32,
    intensity4000: f32,
  }

  struct Triangle {
    // Index into materials array.
    // All types must be a float, but this will be converted to an integer.
    // Only 2,048 materials can be stored and f32 can accurately store integers up to 2,048.
    material: f32,
    x: f32, y: f32, z: f32,
    u1: f32, u2: f32, u3: f32,
    v1: f32, v2: f32, v3: f32,
  }

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

  // Storage/uniform definitions.

  @group(0) @binding(0)
  var<storage, read_write> rayBuffer: array<Ray>;

  @group(0) @binding(1)
  var<storage, read> triangleBuffer: array<Triangle>;

  @group(0) @binding(2)
  var<storage, read_write> distances_and_ray_escaped_flags: array<f32>;

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

  // Shader code.
  
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

    let smallestPositiveNormal = 1.17549435082228750797e-38f;
    let eps = smallestPositiveNormal;
    let eps1 = 1 + eps;

    var rayposition = vec3f(initialRay.x, initialRay.y, initialRay.z);
    var raydirection = vec3f(initialRay.dx, initialRay.dy, initialRay.dz);
    var raydistancetravelled = initialRay.distance_travelled;

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

      let lowerIndex: u32 = rayIndex * ${bounceCount * receivers.length} + n * ${receivers.length};
      let upperIndex: u32 = arrayLength(&distances_and_ray_escaped_flags)/2 + lowerIndex;

      var rayTriangleDistance = INFINITY;
      var closestTriangleIndex = triangleCount;
      var receiverRayTriangleDistances: array<f32, ${receivers.length}>;
      ${receivers.map((_, i) => "receiverRayTriangleDistances[" + i + "] = INFINITY;").join("")}

      // Loop over each triangle, checking:
      // - if the ray from the current location to the receiver intercepts with the triangle.
      // - if the ray from the current location in the current direction intercepts with the triangle.
      for (var i = 0; i < triangleCount; i++) {
        let triangle = triangleBuffer[i];

        let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
        let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);
        let offset = vec3f(rayposition.x - triangle.x, rayposition.y - triangle.y, rayposition.z - triangle.z);

        let offset_cross_e1 = cross(offset, edge1);

        // Ray-trace (diffuse rain) to receivers.
        for (var j = 0; j < ${receivers.length}; j++) {
          // Möller–Trumbore.
          let ray_cross_e2 = cross(directionToReceivers[j], edge2);

          let det = dot(edge1, ray_cross_e2);
          let inv_det = 1.0 / det;

          let u = inv_det * dot(offset, ray_cross_e2);
          let v = inv_det * dot(directionToReceivers[j], offset_cross_e1);

          let t = inv_det * dot(edge2, offset_cross_e1);

          if (
            // Ray intercepts the triangle.
            (abs(det) >= eps) && (u >= -eps) && (v >= -eps) && (u + v <= eps1)

            // Ray intercepts the triangle in the positive direction.
            && t >= eps && det < 0
          ) {
            receiverRayTriangleDistances[j] = min(receiverRayTriangleDistances[j], t);
          }
        }

        // Ray-trace specular ray.

        // Möller–Trumbore.
        let ray_cross_e2 = cross(raydirection, edge2);

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
          && t >= eps && det < 0

          // Ray intercepts the triangle before the previously-closest triangle.
          && t < rayTriangleDistance
        ) {
          rayTriangleDistance = t;
          closestTriangleIndex = i;
        }
      }

      for (var j: u32 = 0; j < ${receivers.length}; j++) {
        distances_and_ray_escaped_flags[upperIndex + j] = ${FLAG_ESCAPED};

        // zero all intensities (in case the ray has escaped and these are not set below).
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

        for (var j: u32 = 0; j < ${receivers.length}; j++) {
          distances_and_ray_escaped_flags[upperIndex + j] = ${FLAG_ALIVE};
          distances_and_ray_escaped_flags[lowerIndex + j] = raydistancetravelled + distanceToReceivers[j];

          // If the ray to the receiver did not hit a triangle before hitting the receiver,
          // add the contribution to the output.
          if (receiverRayTriangleDistances[j] >= distanceToReceivers[j]) {
            let cosNormalAngleToReceiver = dot(directionToReceivers[j], -lastsurfacenormal);

            // Only count if the ray is not intersecting the last surface.
            if (cosNormalAngleToReceiver >= 0) {
              let rayVecToClosestReceiverPoint = dot(vecToReceivers[j], raydirection) * raydirection;
              let distanceFromRayToReceiver = length(vecToReceivers[j] - rayVecToClosestReceiverPoint);

              let receiverRadius = receiverRadii[j];

              let specularCoefficient = (1 - material.scatter) * f32(distanceFromRayToReceiver <= receiverRadius);
              let diffuseCoefficient = material.scatter * (1 - 1 / sqrt(pow(receiverRadius / distanceFromRayToReceiver, 2) + 1)) * 2 * cosNormalAngleToReceiver;
              let totalCoefficient = specularCoefficient + diffuseCoefficient;

              band_125_and_250[lowerIndex + j] = intensity_125 * totalCoefficient;
              band_125_and_250[upperIndex + j] = intensity_250 * totalCoefficient;
              band_500_and_1000[lowerIndex + j] = intensity_500 * totalCoefficient;
              band_500_and_1000[upperIndex + j] = intensity_1000 * totalCoefficient;
              band_2000_and_4000[lowerIndex + j] = intensity_2000 * totalCoefficient;
              band_2000_and_4000[upperIndex + j] = intensity_4000 * totalCoefficient;
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

        x_and_y[lowerIndex] = newposition.x;
        x_and_y[upperIndex] = newposition.y;
        z_and_ray_intensity[lowerIndex] = newposition.z;
        z_and_ray_intensity[upperIndex] = 0.25 * (intensity_250 + intensity_500 + intensity_1000 + intensity_2000);
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
    rayBuffer[rayIndex].distance_travelled = raydistancetravelled;
    rayBuffer[rayIndex].intensity125 = intensity_125;
    rayBuffer[rayIndex].intensity250 = intensity_250;
    rayBuffer[rayIndex].intensity500 = intensity_500;
    rayBuffer[rayIndex].intensity1000 = intensity_1000;
    rayBuffer[rayIndex].intensity2000 = intensity_2000;
    rayBuffer[rayIndex].intensity4000 = intensity_4000;
  }
`;
}

export type RayTraceOutput = {
  audio: Float32Array<ArrayBuffer>[];
  bounceCoordinates: Float32Array<ArrayBuffer>[];
};

export type RayTraceProgress = {
  bounceCount: number;
  secondsElapsed: number;
  totalSeconds: number;
  escapedRayCount: number;
  totalRayCount: number;
  runTimeMs: number;
};

export type UpdateFunction = (progress: RayTraceProgress) => void;

/**
 * Generate rayCount rays, equally spaced in a Fibonacci spiral.
 * @param rayCount 
 * @param sourcePosition 
 * @param sourceDirection 
 * @returns 
 */
export function evenlyDistributedRays(
  rayCount: number,
  sourcePosition: Vec3,
  sourceDirection: Vec3 | null,
): Ray[] {
  const rays: Ray[] = [];

  const direction = sourceDirection && vNormalise(sourceDirection);

  // Golden ratio.
  const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

  // Create the rays.
  for (let i = 0; i < rayCount; ++i) {
    const theta = (2 * Math.PI * i) / GOLDEN_RATIO;
    const phi = Math.acos(1 - (2 * i) / rayCount);
    const ray: Vec3 = [
      Math.cos(theta) * Math.sin(phi),
      Math.sin(theta) * Math.sin(phi),
      Math.cos(phi),
    ];

    let intensity = 1.0;

    if (direction !== null) {
      const rayDotDirection = vDot(ray, direction);
      intensity = (rayDotDirection + 1) / 2;
    }

    // const randomVariation: Vec3 = vScale(0.1, [Math.random()*2-1, Math.random()*2-1, Math.random()*2-1]);
    // const dir = vNormalise(vAdd(randomVariation, vNormalise(ray)))

    rays.push({
      position: sourcePosition,
      direction: vNormalise(ray), // dir
      intensity,
    });
  }

  return rays;
}

export class RayTrace {
  private cancelled = false;

  async cancel() {
    this.cancelled = true;
  }

  async run(
    options: RayTraceOptions,
    update: UpdateFunction,
  ): Promise<RayTraceOutput | null> {
    const startTime = performance.now();

    this.cancelled = false;

    update({
      bounceCount: 0,
      secondsElapsed: 0,
      totalSeconds: options.audioDuration,
      escapedRayCount: 0,
      totalRayCount: options.rayCount,
      runTimeMs: performance.now() - startTime,
    });

    log("creating geometry");

    const rays = evenlyDistributedRays(
      options.rayCount,
      options.sourcePosition,
      options.sourceDirection,
    );

    const gpuDevice = await getGPUDevice();

    if (!gpuDevice) {
      error("no GPU device");
      return null;
    }

    const maxStorageBufferSize = options.useWasm
      ? WASM_MAX_STORAGE_BUFFER_SIZE
      : gpuDevice.limits.maxStorageBufferBindingSize ||
        STANDARD_MAX_STORAGE_BUFFER_SIZE;
    const maxUniformBufferSize = options.useWasm
      ? WASM_MAX_UNIFORM_BUFFER_SIZE
      : gpuDevice.limits.maxUniformBufferBindingSize ||
        STANDARD_MAX_UNIFORM_BUFFER_SIZE;

    // Number of bounces per pass is limited by how large the output buffer is allowed to be.
    // Each ray outputs 2 floats (distance and intensity) per bounce.
    const bouncesPerPass = Math.max(
      1,
      Math.floor(
        ((1 - options.throttle) * maxStorageBufferSize) /
          (2 * FLOAT32_SIZE * options.rayCount * options.receivers.length),
      ),
    );

    log("bouncesPerPass", bouncesPerPass);

    const bufferSize =
      2 * bouncesPerPass * options.rayCount * options.receivers.length;
    const halfBufferSize = bufferSize / 2;

    if (rays.length * SIZEOF_RAY > maxStorageBufferSize) {
      error(
        "ray buffer is too large, will not work! Try reducing the ray count.",
      );
      return null;
    }

    if (bufferSize * FLOAT32_SIZE > maxStorageBufferSize) {
      error(
        "output buffer is too large, will not work! Try reducing the ray count.",
      );
      return null;
    }

    if (options.materials.length * SIZEOF_MATERIAL >= maxUniformBufferSize) {
      error(
        "materials buffer is too large, will not work! Try reducing the number of materials.",
      );
      return null;
    }

    const buffers: ShaderBuffer[] = [
      {
        data: raysToFloatArray(rays),
        type: "storage",
        output: false,
      },
      {
        data: trianglesToFloatArray(options.geometry, options.materials),
        type: "read-only-storage",
        output: false,
      },
      {
        data: new Float32Array(bufferSize), // distance and ray escaped flag

        type: "storage",
        output: true,
      },
      {
        data: new Float32Array(bufferSize), // band 125 and 250

        type: "storage",
        output: true,
      },
      {
        data: new Float32Array(bufferSize), // band 500 and 1000

        type: "storage",
        output: true,
      },
      {
        data: new Float32Array(bufferSize), // band 2000 and 4000

        type: "storage",
        output: true,
      },
      {
        data: new Float32Array(bufferSize), // x and y

        type: "storage",
        output: true,
      },
      {
        data: new Float32Array(bufferSize), // z and ray intensity

        type: "storage",
        output: true,
      },
      {
        data: materialsToFloatArray(options.materials),
        type: "uniform",
        output: false,
      },
    ];

    const shader: ComputeShaderPipeline | WasmPipeline = options.useWasm
      ? new WasmPipeline(
          bouncesPerPass,
          options.geometry.length,
          options.receivers,
          buffers,
        )
      : new ComputeShaderPipeline(
          gpuDevice,
          specularRayIntersectionShaderCode(
            options.receivers,
            options.materials,
            bouncesPerPass,
          ),
          buffers,
        );

    if (shader instanceof WasmPipeline) {
      await shader.initialise();
    }

    const receiversCount = options.receivers.length;

    const sampleCount = Math.ceil(SAMPLE_RATE * options.audioDuration);

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
        new Float32Array(sampleCount), // 125Hz
        new Float32Array(sampleCount), // 250Hz
        new Float32Array(sampleCount), // 500Hz
        new Float32Array(sampleCount), // 1kHz
        new Float32Array(sampleCount), // 2kHz
        new Float32Array(sampleCount), // 4kHz
      ]);
    }

    const gapBetweenIndicesToCount = Math.floor(
      options.rayCount / options.rayPlotCount,
    );

    const plottedRayCoordinates: Float32Array<ArrayBuffer>[] = [];

    for (let i = 0; i < options.rayPlotCount; ++i) {
      plottedRayCoordinates.push(new Float32Array(4 * options.bouncePlotCount));
      plottedRayCoordinates[i][0] =
        rays[gapBetweenIndicesToCount * i].intensity;
      plottedRayCoordinates[i][1] = options.sourcePosition[0];
      plottedRayCoordinates[i][2] = options.sourcePosition[1];
      plottedRayCoordinates[i][3] = options.sourcePosition[2];
    }

    // TODO BUG: number of bounces to plot does not line up with actual number plotted.

    let minDistanceTravelled = 0;
    let minIndex = 0;
    let bounceCount = 0;

    // Layout of result buffers:
    // Buffers are actually really 2 buffers, each with length outputSize/2.
    // This is because there are too many types of data to fit into 8 buffers, so we
    // use 16 half-size buffers instead. lowerIndex refers to the buffer in the lower
    // half of the WebGPU buffer, upperIndex refers to the buffer in the upper half.
    //
    // |ray1recv1_1|ray1recv2_1|ray1recv1_2|ray1recv2_2|ray1recv1_3|ray1recv2_3|...

    let escapedRayCount = 0;

    while (!this.cancelled && minIndex < sampleCount) {
      update({
        bounceCount,
        secondsElapsed: minIndex / SAMPLE_RATE,
        totalSeconds: options.audioDuration,
        escapedRayCount,
        totalRayCount: options.rayCount,
        runTimeMs: performance.now() - startTime,
      });

      // Run the shader and get the result.
      const result = await shader.run(options.rayCount);

      minIndex = sampleCount;
      minDistanceTravelled = SPEED_OF_SOUND * sampleCount / SAMPLE_RATE;

      escapedRayCount = 0;

      for (let k = 0; k < receiversCount; ++k) {
        const output = outputs[k];

        for (let j = k; j < halfBufferSize; j += receiversCount) {
          const lowerIndex = j;
          const upperIndex = halfBufferSize + j;

          const rayIndex = Math.floor(j / (bouncesPerPass * receiversCount));
          const bounceIndex =
            bounceCount +
            (j - bouncesPerPass * receiversCount * rayIndex) / receiversCount;

          const distanceTravelled = result[0][lowerIndex];

          const index = Math.round(
            SAMPLE_RATE * (distanceTravelled / SPEED_OF_SOUND),
          );

          const airAbsorption = Math.exp(
            -distanceTravelled * AIR_ABSORPTION_COEFF,
          );

          // if (rayIndex === 1209343) {
          output[0][index] += result[1][lowerIndex] * airAbsorption;
          output[1][index] += result[1][upperIndex] * airAbsorption;
          output[2][index] += result[2][lowerIndex] * airAbsorption;
          output[3][index] += result[2][upperIndex] * airAbsorption;
          output[4][index] += result[3][lowerIndex] * airAbsorption;
          output[5][index] += result[3][upperIndex] * airAbsorption;
          // }

          const escaped = result[0][upperIndex] === FLAG_ESCAPED;

          if (escaped && lowerIndex % (bouncesPerPass * receiversCount) === 0) {
            escapedRayCount++;
          }

          if (
            !escaped &&
            (lowerIndex + receiversCount - k) %
              (bouncesPerPass * receiversCount) ===
              0
          ) {
            minIndex = Math.min(minIndex, index);
            minDistanceTravelled = Math.min(minDistanceTravelled, distanceTravelled)
          }

          // TODO: plot better rays.
          if (
            k === 0 &&
            rayIndex % gapBetweenIndicesToCount === 0 &&
            rayIndex / gapBetweenIndicesToCount <
              plottedRayCoordinates.length &&
            bounceIndex < options.bouncePlotCount
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
      bounceCount += bouncesPerPass;
    }

    update({
      bounceCount,
      secondsElapsed: minIndex / SAMPLE_RATE,
      totalSeconds: options.audioDuration,
      escapedRayCount,
      totalRayCount: options.rayCount,
      runTimeMs: performance.now() - startTime,
    });

    const outputAudio = outputs.map((output) =>
      combineFilteredAudio(...output),
    );

    // Free all resources on the GPU.
    shader.destroy();

    return {
      audio: outputAudio,
      bounceCoordinates: plottedRayCoordinates,
    };
  }
}
