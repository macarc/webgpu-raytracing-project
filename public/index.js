"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/constants.ts
  var FLOAT32_SIZE, WORKGROUP_SIZE, SAMPLE_RATE, SPEED_OF_SOUND;
  var init_constants = __esm({
    "src/constants.ts"() {
      "use strict";
      FLOAT32_SIZE = 4;
      WORKGROUP_SIZE = 64;
      SAMPLE_RATE = 48e3;
      SPEED_OF_SOUND = 340;
    }
  });

  // src/webgpu.ts
  async function getGPUDevice() {
    if (!navigator.gpu) {
      alert(
        "GPU/browser not supported.\nIf you're on Firefox, try setting dom.webgpu.enabled to true in about:config."
      );
      return null;
    }
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance"
    });
    if (!adapter) {
      console.error("No adapter");
      return null;
    }
    const device = await adapter.requestDevice();
    device.lost.then((info) => {
      console.error(`WebGPU device was lost: ${info.message}`);
      if (info.reason !== "destroyed") {
        console.log("Can restart if we want");
      }
    });
    return device;
  }
  async function runShader(code, buffers, instancesCount) {
    const device = await getGPUDevice();
    if (!device) {
      console.log("Aborted due to null GPUDevice.");
      return null;
    }
    const gpuBuffers = buffers.map(
      (buf) => device.createBuffer({
        size: buf.data.length * FLOAT32_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
      })
    );
    const bindGroupLayout = device.createBindGroupLayout({
      entries: buffers.map((buf, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: buf.readonly ? "read-only-storage" : "storage" }
      }))
    });
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: gpuBuffers.map((buffer, i) => ({
        binding: i,
        resource: { buffer }
      }))
    });
    const shaderModule = device.createShaderModule({ code });
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
      }),
      compute: { module: shaderModule, entryPoint: "main" }
    });
    buffers.forEach((buffer, i) => {
      device.queue.writeBuffer(gpuBuffers[i], 0, buffer.data);
    });
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(instancesCount / WORKGROUP_SIZE));
    passEncoder.end();
    const stagingBuffers = buffers.map(
      (buf) => buf.output ? device.createBuffer({
        size: buf.data.length * FLOAT32_SIZE,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      }) : null
    );
    stagingBuffers.forEach((stagingBuffer, i) => {
      if (stagingBuffer) {
        commandEncoder.copyBufferToBuffer(
          gpuBuffers[i],
          0,
          stagingBuffer,
          0,
          stagingBuffer.size
        );
      }
    });
    console.time("run");
    device.queue.submit([commandEncoder.finish()]);
    await Promise.all(
      stagingBuffers.map(
        (stagingBuffer) => stagingBuffer && stagingBuffer.mapAsync(GPUMapMode.READ, 0, stagingBuffer.size)
      )
    );
    console.timeEnd("run");
    const dataOutput = stagingBuffers.filter((b) => b !== null).map((stagingBuffer) => {
      const arrayDataOutput = stagingBuffer.getMappedRange().slice();
      stagingBuffer.unmap();
      return new Float32Array(arrayDataOutput);
    });
    return dataOutput;
  }
  var init_webgpu = __esm({
    "src/webgpu.ts"() {
      "use strict";
      init_constants();
    }
  });

  // src/floatarrays.ts
  function trianglesToFloatArray(triangles) {
    return new Float32Array(
      triangles.flatMap((triangle) => [
        ...triangle.p1,
        triangle.p2[0] - triangle.p1[0],
        triangle.p2[1] - triangle.p1[1],
        triangle.p2[2] - triangle.p1[2],
        triangle.p3[0] - triangle.p1[0],
        triangle.p3[1] - triangle.p1[1],
        triangle.p3[2] - triangle.p1[2]
      ])
    );
  }
  var init_floatarrays = __esm({
    "src/floatarrays.ts"() {
      "use strict";
    }
  });

  // src/orient_surfaces.ts
  async function orientTriangles(triangles) {
    let result = await runShader(
      shaderCode,
      [
        {
          data: trianglesToFloatArray(triangles),
          readonly: true,
          output: false
        },
        {
          data: new Float32Array(triangles.length),
          readonly: false,
          output: true
        }
      ],
      triangles.length
    );
    let flips = result && result[0];
    if (flips) {
      for (let i = 0; i < flips.length; i++) {
        const sign = flips[i];
        if (sign !== 1 && sign !== -1) {
          throw new Error(
            `Received invalid output ${sign} from triangle orientation shader.`
          );
        } else if (sign === -1) {
          const p2 = triangles[i].p3;
          const p3 = triangles[i].p2;
          triangles[i].p2 = p2;
          triangles[i].p3 = p3;
        }
      }
    } else {
      throw new Error(
        "Did not receive shader output from triangle orientation shader."
      );
    }
    return triangles;
  }
  var shaderCode;
  var init_orient_surfaces = __esm({
    "src/orient_surfaces.ts"() {
      "use strict";
      init_webgpu();
      init_constants();
      init_floatarrays();
      shaderCode = `
  struct Triangle {
    x: f32, y: f32, z: f32,
    u1: f32, u2: f32, u3: f32,
    v1: f32, v2: f32, v3: f32,
  }

  @group(0) @binding(0)
  var<storage, read> triangles: array<Triangle>;

  // TODO: these shouldn't really be floats.
  @group(0) @binding(1)
  var<storage, read_write> output: array<f32>;

  const INFINITY: f32 = 1e10;

  fn distanceTo(origin: vec3f, ray: vec3f, triangle: Triangle) -> f32 {
    let smallestPositiveNormal = 1.17549435082228750797e-38f;
    let eps = smallestPositiveNormal;
    let eps1 = 1 + eps;

    let edge1 = vec3f(triangle.u1, triangle.u2, triangle.u3);
    let edge2 = vec3f(triangle.v1, triangle.v2, triangle.v3);
    let offset = vec3f(origin.x - triangle.x, origin.y - triangle.y, origin.z - triangle.z);

    let ray_cross_e2 = cross(ray, edge2);
    let offset_cross_e1 = cross(offset, edge1);

    let det = dot(edge1, ray_cross_e2);
    let inv_det = 1.0 / det;

    let u = inv_det * dot(offset, ray_cross_e2);
    let v = inv_det * dot(ray, offset_cross_e1);

    let t = inv_det * dot(edge2, offset_cross_e1);

    if ((abs(det) < eps) || (u < -eps) || (v < -eps) || (u + v > eps1)) {
      // Ray missed the triangle.
    } else if (t > eps) {
      return t;
    }

    return INFINITY;
  }

  @compute @workgroup_size(${WORKGROUP_SIZE})
  fn main(
    @builtin(global_invocation_id)
    global_id : vec3u,
  ) {
    let index = global_id.x;

    let triangleCount = u32(arrayLength(&triangles));

    // Avoid accessing the buffer out of bounds - this could happen
    // if NUM_RAYS and WORKGROUP_SIZE don't line up.
    if (index >= triangleCount) {
      output[index] = 42;
      return;
    }

    let trgtTriangle = triangles[index];
    let targetCentre = vec3(
      trgtTriangle.x * 3 + (trgtTriangle.u1 + trgtTriangle.v1),
      trgtTriangle.y * 3 + (trgtTriangle.u2 + trgtTriangle.v2),
      trgtTriangle.z * 3 + (trgtTriangle.u3 + trgtTriangle.v3)
    ) / 3;

    var origin = vec3(0.0, 0.0, 0.0);
    var ray = normalize(targetCentre - origin);
    var targetDistance = distanceTo(origin, ray, trgtTriangle);

    // Since the origin (0,0,0) might be aligned with the triangle, in this case move the origin to (0,0,1).
    if (targetDistance == INFINITY) {
      origin.z += 1.0;
      ray = normalize(targetCentre - origin);
      targetDistance = distanceTo(origin, ray, trgtTriangle);
    }
    if (targetDistance == INFINITY) {
      output[index] = 42;
      return;
    }

    let target_edge_1 = vec3(trgtTriangle.u1, trgtTriangle.u2, trgtTriangle.u3);
    let target_edge_2 = vec3(trgtTriangle.v1, trgtTriangle.v2, trgtTriangle.v3);
    let currentRayNormalDirection = i32(dot(ray, cross(target_edge_1, target_edge_2)) > 0);

    var intersectionCount = 1;
    var intersectionsBeforeTargetCount = 0;

    for (var i: u32 = 0; i < triangleCount; i++) {
      let triangle = triangles[i];

      let distance = distanceTo(origin, ray, triangle);

      if (i != index && distance < INFINITY) {
        intersectionCount += 1;
        if (distance < targetDistance) {
          intersectionsBeforeTargetCount += 1;
        }
      }
    }

    var shouldFlip: i32 = currentRayNormalDirection * 2 - 1;

    // If the origin is outside the geometry, flip the sign.
    if (intersectionCount % 2 == 0) {
      shouldFlip *= -1;
    }

    // If the ray intersects an odd number of triangles before the current one,
    // flip the sign.
    if (intersectionsBeforeTargetCount % 2 == 1) {
      shouldFlip *= -1;
    }

    output[index] = f32(shouldFlip);
  }
`;
    }
  });

  // src/dsp.ts
  function ensure(t) {
    if (t !== true) {
      throw new Error("Ensure failed!");
    }
  }
  function filter(B, A, input) {
    ensure(A.length === B.length);
    ensure(A[0] === 1);
    const x = new Float64Array(input);
    const output = new Float64Array(input.length);
    for (let i = 0; i < A.length; ++i) {
      for (let j = 0; j <= i; ++j) {
        output[i] -= A[j] * output[i - j];
        output[i] += B[j] * x[i - j];
      }
    }
    for (let i = A.length; i < input.length; ++i) {
      for (let j = 0; j < A.length; ++j) {
        output[i] -= A[j] * output[i - j];
        output[i] += B[j] * x[i - j];
      }
    }
    return output;
  }
  function combineFilteredAudio(band_125, band_250, band_500, band_1000, band_2000, band_4000) {
    ensure(new Set([...arguments].map((i) => i.length)).size === 1);
    const audio_125 = filter(B0, A0, band_125);
    const audio_250 = filter(B1, A1, band_250);
    const audio_500 = filter(B2, A2, band_500);
    const audio_1000 = filter(B3, A3, band_1000);
    const audio_2000 = filter(B4, A4, band_2000);
    const audio_4000 = filter(B5, A5, band_4000);
    const output = new Float32Array(band_125.length);
    let maxVal = 0;
    for (let i = 0; i < audio_125.length; ++i) {
      output[i] = audio_125[i] + audio_250[i] + audio_500[i] + audio_1000[i] + audio_2000[i] + audio_4000[i];
      maxVal = Math.max(maxVal, Math.abs(output[i]));
    }
    for (let i = 0; i < output.length; ++i) {
      output[i] /= maxVal;
    }
    return output;
  }
  var A0, A1, A2, A3, A4, A5, B0, B1, B2, B3, B4, B5;
  var init_dsp = __esm({
    "src/dsp.ts"() {
      "use strict";
      A0 = [
        1,
        -5.97710280273096,
        14.8865696804245,
        -19.7752371006017,
        14.7773215278572,
        -5.88969646032918,
        0.978145155399091
      ];
      A1 = [
        1,
        -5.95261778163623,
        14.7673459816632,
        -19.5430940912569,
        14.5513887157824,
        -5.77979012308764,
        0.956767299736394
      ];
      A2 = [
        1,
        -5.89895954268595,
        14.5121134493874,
        -19.0579107531048,
        14.090719754987,
        -5.56136155784429,
        0.915398724423662
      ];
      A3 = [
        1,
        -5.77342904194451,
        13.9388867314386,
        -18.0128785058685,
        13.1407882124164,
        -5.13128137368724,
        0.837918571956601
      ];
      A4 = [
        1,
        -5.45398042338919,
        12.5790535567913,
        -15.6974643781023,
        11.1774733875855,
        -4.30667765748868,
        0.70186274596409
      ];
      A5 = [
        1,
        -4.57926317858504,
        9.33236799409301,
        -10.7411395683285,
        7.35796347695069,
        -2.84721146218067,
        0.491195076831595
      ];
      B0 = [
        16674007995305e-20,
        0,
        -500220239859151e-21,
        0,
        500220239859151e-21,
        0,
        -16674007995305e-20
      ];
      B1 = [
        131938414947782e-20,
        0,
        -395815244843347e-20,
        0,
        395815244843347e-20,
        0,
        -131938414947782e-20
      ];
      B2 = [
        103281444898781e-19,
        0,
        -309844334696344e-19,
        0,
        309844334696344e-19,
        0,
        -103281444898781e-19
      ];
      B3 = [
        791670726788158e-19,
        0,
        -237501218036447e-18,
        0,
        237501218036447e-18,
        0,
        -791670726788158e-19
      ];
      B4 = [
        583056136559946e-18,
        0,
        -0.00174916840967984,
        0,
        0.00174916840967984,
        0,
        -583056136559946e-18
      ];
      B5 = [
        0.00399558738785181,
        0,
        -0.0119867621635554,
        0,
        0.0119867621635554,
        0,
        -0.00399558738785181
      ];
    }
  });

  // src/ray_tracing.ts
  function rand() {
    return Math.random() * 2 - 1;
  }
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
  function specularRayIntersectionShaderCode(bounceCount) {
    return (
      /* wgsl */
      `
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

    // This is more or less a line-by-line translation of the M\xF6ller\u2013Trumbore intersection algorithm.
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

    let receiverPosition = vec3(${RECEIVER_POSITION.join(",")});

    for (var n: u32 = 0; n < ${bounceCount}; n++) {
      let index = rayIndex * ${bounceCount} + n;

      // TODO: infinity
      var distance = 1e10;
      var closestTriangleIndex = triangleCount;
      var receiverRayTriangleDistance = 1e10; // TODO: infinity.

      let vecToReceiver = receiverPosition - rayposition;
      let directionToReceiver = normalize(vecToReceiver);
      let distanceToReceiver = length(vecToReceiver);

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

      band_125[index].intensity = 0;
      band_250[index].intensity = 0;
      band_500[index].intensity = 0;
      band_1000[index].intensity = 0;
      band_2000[index].intensity = 0;
      band_4000[index].intensity = 0;

      // If the ray to the receiver did not hit a triangle before hitting the receiver,
      // add the contribution to the output.
      if (receiverRayTriangleDistance >= distanceToReceiver) {
        let cosNormalAngleToReceiver = dot(directionToReceiver, -lastsurfacenormal);

        // Only count if the ray is not intersecting the last surface.
        if (cosNormalAngleToReceiver > 0) {
          let distance = raydistancetravelled + distanceToReceiver;

          // TODO: this is a waste of memory.
          band_125[index].time = distance;
          band_250[index].time = distance;
          band_500[index].time = distance;
          band_1000[index].time = distance;
          band_2000[index].time = distance;
          band_4000[index].time = distance;

          band_125[index].intensity = intensity_125 * cosNormalAngleToReceiver;
          band_250[index].intensity = intensity_250 * cosNormalAngleToReceiver;
          band_500[index].intensity = intensity_500 * cosNormalAngleToReceiver;
          band_1000[index].intensity = intensity_1000 * cosNormalAngleToReceiver;
          band_2000[index].intensity = intensity_2000 * cosNormalAngleToReceiver;
          band_4000[index].intensity = intensity_4000 * cosNormalAngleToReceiver;
        }
      }

      // let distanceToClosestReceiverPoint = dot(vecToReceiver, raydirection);
      // let distanceFromRayToReceiver = length(vecToReceiver - distanceToClosestReceiverPoint*raydirection);

      // let receiverRadius = 1.0;

      // if (distanceFromRayToReceiver <= receiverRadius && abs(distanceToClosestReceiverPoint) <= distance) {
      //   band_125[index].intensity += intensity_125;
      //   band_250[index].intensity += intensity_250;
      //   band_500[index].intensity += intensity_500;
      //   band_1000[index].intensity += intensity_1000;
      //   band_2000[index].intensity += intensity_2000;
      //   band_4000[index].intensity += intensity_4000;
      // }

      // This should always be true - it should always intersect a triangle.
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
        lastsurfacenormal = triangleNormal;

        // Carpet, heavy
        // intensity_125 *= 0.63;
        // intensity_250 *= 0.59;
        // intensity_500 *= 0.37;
        // intensity_1000 *= 0.15;
        // intensity_2000 *= 0.04;
        // intensity_4000 *= 0.08;


        // Concrete
        intensity_125 *= 0.88;
        intensity_250 *= 0.91;
        intensity_500 *= 0.93;
        intensity_1000 *= 0.95;
        intensity_2000 *= 0.95;
        intensity_4000 *= 0.96;
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


    intensity_125 = initialRay.intensity125;
    intensity_250 = initialRay.intensity250;
    intensity_500 = initialRay.intensity500;
    intensity_1000 = initialRay.intensity1000;
    intensity_2000 = initialRay.intensity2000;
    intensity_4000 = initialRay.intensity4000;
  }
`
    );
  }
  async function rayTrace(settings) {
    console.time("Total (including setup)");
    console.log("Creating geometry");
    const rays = [];
    const triangles = await orientTriangles(settings.geometry);
    for (let i = 0; i < settings.rayCount; ++i) {
      rays.push({
        position: SOURCE_POSITION,
        direction: randomPointOnUnitSphere()
      });
    }
    const gpuDevice = await getGPUDevice();
    if (!gpuDevice) {
      throw new Error("Aborted due to null GPU device");
    }
    const maximumBouncesPerPass = Math.floor(
      MAX_STORAGE_BUFFER_SIZE / (2 * FLOAT32_SIZE * settings.rayCount)
    );
    const bouncesPerPass = Math.min(settings.minBounces, maximumBouncesPerPass);
    const numberOfPasses = Math.ceil(settings.minBounces / bouncesPerPass);
    const outputSize = 2 * bouncesPerPass * settings.rayCount;
    if (outputSize > MAX_STORAGE_BUFFER_SIZE) {
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
          1
        ])
      ),
      trianglesToFloatArray(triangles),
      [
        new Float32Array(outputSize),
        new Float32Array(outputSize),
        new Float32Array(outputSize),
        new Float32Array(outputSize),
        new Float32Array(outputSize),
        new Float32Array(outputSize)
      ],
      specularRayIntersectionShaderCode(bouncesPerPass)
    );
    console.time("Total (excluding setup)");
    let output125 = new Float32Array(SAMPLE_RATE * OUTPUT_AUDIO_LENGTH);
    let output250 = new Float32Array(SAMPLE_RATE * OUTPUT_AUDIO_LENGTH);
    let output500 = new Float32Array(SAMPLE_RATE * OUTPUT_AUDIO_LENGTH);
    let output1000 = new Float32Array(SAMPLE_RATE * OUTPUT_AUDIO_LENGTH);
    let output2000 = new Float32Array(SAMPLE_RATE * OUTPUT_AUDIO_LENGTH);
    let output4000 = new Float32Array(SAMPLE_RATE * OUTPUT_AUDIO_LENGTH);
    for (let i = 0; i < numberOfPasses; i++) {
      const result = await rayTracer.runPass(settings.rayCount);
      let t = 10;
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
    const directSoundDistance = Math.sqrt(
      Math.pow(SOURCE_POSITION[0] - RECEIVER_POSITION[0], 2) + Math.pow(SOURCE_POSITION[1] - RECEIVER_POSITION[1], 2) + Math.pow(SOURCE_POSITION[1] - RECEIVER_POSITION[1], 2)
    );
    const directSoundIndex = Math.round(
      SAMPLE_RATE * (directSoundDistance / SPEED_OF_SOUND)
    );
    const directSoundIntensity = rays.length / (4 * Math.PI * directSoundDistance ** 2) * Math.exp(-directSoundDistance * AIR_ABSORPTION_COEFF);
    output125[directSoundIndex] += directSoundIntensity;
    output250[directSoundIndex] += directSoundIntensity;
    output500[directSoundIndex] += directSoundIntensity;
    output1000[directSoundIndex] += directSoundIntensity;
    output2000[directSoundIndex] += directSoundIntensity;
    output4000[directSoundIndex] += directSoundIntensity;
    const outputAudio = combineFilteredAudio(
      output125,
      output250,
      output500,
      output1000,
      output2000,
      output4000
    );
    console.timeEnd("Total (excluding setup)");
    console.timeEnd("Total (including setup)");
    console.log(outputAudio.join(","));
    return outputAudio;
  }
  var MAX_STORAGE_BUFFER_SIZE, OUTPUT_AUDIO_LENGTH, SOURCE_POSITION, RECEIVER_POSITION, AIR_ABSORPTION_COEFF, SpecularRayTracer;
  var init_ray_tracing = __esm({
    "src/ray_tracing.ts"() {
      "use strict";
      init_webgpu();
      init_constants();
      init_floatarrays();
      init_orient_surfaces();
      init_dsp();
      MAX_STORAGE_BUFFER_SIZE = 134217728;
      OUTPUT_AUDIO_LENGTH = 4;
      SOURCE_POSITION = [0.1, -0.1, -0.1];
      RECEIVER_POSITION = [8.5, 0, 0];
      AIR_ABSORPTION_COEFF = 13e-4;
      SpecularRayTracer = class {
        device;
        computePipeline;
        bindGroup;
        outputBuffers;
        stagingBuffers;
        constructor(gpuDevice, rays, triangles, outputs, code) {
          this.device = gpuDevice;
          const rayBuffer = this.device.createBuffer({
            size: rays.length * FLOAT32_SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
          });
          const triangleBuffer = this.device.createBuffer({
            size: triangles.length * FLOAT32_SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
          });
          this.outputBuffers = outputs.map(
            (output) => this.device.createBuffer({
              size: output.length * FLOAT32_SIZE,
              usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
            })
          );
          this.stagingBuffers = outputs.map(
            (output) => this.device.createBuffer({
              size: output.length * FLOAT32_SIZE,
              usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
            })
          );
          const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
              {
                binding: 0,
                // ray buffer
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
              },
              {
                binding: 1,
                // triangle buffer
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" }
              },
              {
                binding: 2,
                // band 125
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
              },
              {
                binding: 3,
                // band 250
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
              },
              {
                binding: 4,
                // band 500
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
              },
              {
                binding: 5,
                // band 1000
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
              },
              {
                binding: 6,
                // band 2000
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
              },
              {
                binding: 7,
                // band 4000
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
              }
            ]
          });
          this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: rayBuffer } },
              { binding: 1, resource: { buffer: triangleBuffer } },
              ...this.outputBuffers.map((buffer, i) => ({
                binding: 2 + i,
                resource: { buffer }
              }))
            ]
          });
          const shaderModule = this.device.createShaderModule({ code });
          this.computePipeline = this.device.createComputePipeline({
            layout: this.device.createPipelineLayout({
              bindGroupLayouts: [bindGroupLayout]
            }),
            compute: { module: shaderModule, entryPoint: "main" }
          });
          this.device.queue.writeBuffer(rayBuffer, 0, rays);
          this.device.queue.writeBuffer(triangleBuffer, 0, triangles);
          for (let i = 0; i < outputs.length; i++) {
            this.device.queue.writeBuffer(this.outputBuffers[i], 0, outputs[i]);
          }
        }
        async runPass(instancesCount) {
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
              this.stagingBuffers[i].size
            );
          }
          console.time("run");
          this.device.queue.submit([commandEncoder.finish()]);
          await Promise.all(
            this.stagingBuffers.map(
              (buffer) => buffer.mapAsync(GPUMapMode.READ, 0, buffer.size)
            )
          );
          console.timeEnd("run");
          const arrayDataOutput = this.stagingBuffers.map(
            (buffer) => buffer.getMappedRange().slice()
          );
          this.stagingBuffers.forEach((buffer) => buffer.unmap());
          return arrayDataOutput.map((buffer) => new Float32Array(buffer));
        }
      };
    }
  });

  // src/geometry_data.ts
  var CUBE_FACES;
  var init_geometry_data = __esm({
    "src/geometry_data.ts"() {
      "use strict";
      CUBE_FACES = [
        // Bottom face.
        {
          p1: [-10, -10, -10],
          p2: [10, -10, -10],
          p3: [-10, 10, -10]
        },
        {
          p1: [10, -10, -10],
          p2: [10, 10, -10],
          p3: [-10, 10, -10]
        },
        // Top face.
        {
          p1: [-10, -10, 10],
          p2: [10, -10, 10],
          p3: [-10, 10, 10]
        },
        {
          p1: [10, -10, 10],
          p2: [10, 10, 10],
          p3: [-10, 10, 10]
        },
        // Left face.
        {
          p1: [-10, -10, -10],
          p2: [-10, 10, 10],
          p3: [-10, -10, 10]
        },
        {
          p1: [-10, -10, -10],
          p2: [-10, 10, -10],
          p3: [-10, 10, 10]
        },
        // Right face.
        {
          p1: [10, -10, -10],
          p2: [10, 10, 10],
          p3: [10, -10, 10]
        },
        {
          p1: [10, -10, -10],
          p2: [10, 10, -10],
          p3: [10, 10, 10]
        },
        // Front face.
        {
          p1: [-10, -10, -10],
          p2: [10, -10, 10],
          p3: [-10, -10, 10]
        },
        {
          p1: [-10, -10, -10],
          p2: [10, -10, -10],
          p3: [10, -10, 10]
        },
        // Back face.
        {
          p1: [-10, 10, -10],
          p2: [10, 10, 10],
          p3: [-10, 10, 10]
        },
        {
          p1: [-10, 10, -10],
          p2: [10, 10, -10],
          p3: [10, 10, 10]
        }
      ];
    }
  });

  // node_modules/mithril/render/vnode.js
  var require_vnode = __commonJS({
    "node_modules/mithril/render/vnode.js"(exports, module) {
      "use strict";
      function Vnode(tag, key, attrs, children, text, dom) {
        return { tag, key, attrs, children, text, dom, is: void 0, domSize: void 0, state: void 0, events: void 0, instance: void 0 };
      }
      Vnode.normalize = function(node) {
        if (Array.isArray(node)) return Vnode("[", void 0, void 0, Vnode.normalizeChildren(node), void 0, void 0);
        if (node == null || typeof node === "boolean") return null;
        if (typeof node === "object") return node;
        return Vnode("#", void 0, void 0, String(node), void 0, void 0);
      };
      Vnode.normalizeChildren = function(input) {
        var children = new Array(input.length);
        var numKeyed = 0;
        for (var i = 0; i < input.length; i++) {
          children[i] = Vnode.normalize(input[i]);
          if (children[i] !== null && children[i].key != null) numKeyed++;
        }
        if (numKeyed !== 0 && numKeyed !== input.length) {
          throw new TypeError(
            children.includes(null) ? "In fragments, vnodes must either all have keys or none have keys. You may wish to consider using an explicit keyed empty fragment, m.fragment({key: ...}), instead of a hole." : "In fragments, vnodes must either all have keys or none have keys."
          );
        }
        return children;
      };
      module.exports = Vnode;
    }
  });

  // node_modules/mithril/render/hyperscriptVnode.js
  var require_hyperscriptVnode = __commonJS({
    "node_modules/mithril/render/hyperscriptVnode.js"(exports, module) {
      "use strict";
      var Vnode = require_vnode();
      module.exports = function(attrs, children) {
        if (attrs == null || typeof attrs === "object" && attrs.tag == null && !Array.isArray(attrs)) {
          if (children.length === 1 && Array.isArray(children[0])) children = children[0];
        } else {
          children = children.length === 0 && Array.isArray(attrs) ? attrs : [attrs, ...children];
          attrs = void 0;
        }
        return Vnode("", attrs && attrs.key, attrs, children);
      };
    }
  });

  // node_modules/mithril/util/hasOwn.js
  var require_hasOwn = __commonJS({
    "node_modules/mithril/util/hasOwn.js"(exports, module) {
      "use strict";
      module.exports = {}.hasOwnProperty;
    }
  });

  // node_modules/mithril/render/emptyAttrs.js
  var require_emptyAttrs = __commonJS({
    "node_modules/mithril/render/emptyAttrs.js"(exports, module) {
      "use strict";
      module.exports = {};
    }
  });

  // node_modules/mithril/render/cachedAttrsIsStaticMap.js
  var require_cachedAttrsIsStaticMap = __commonJS({
    "node_modules/mithril/render/cachedAttrsIsStaticMap.js"(exports, module) {
      "use strict";
      var emptyAttrs = require_emptyAttrs();
      module.exports = /* @__PURE__ */ new Map([[emptyAttrs, true]]);
    }
  });

  // node_modules/mithril/render/hyperscript.js
  var require_hyperscript = __commonJS({
    "node_modules/mithril/render/hyperscript.js"(exports, module) {
      "use strict";
      var Vnode = require_vnode();
      var hyperscriptVnode = require_hyperscriptVnode();
      var hasOwn = require_hasOwn();
      var emptyAttrs = require_emptyAttrs();
      var cachedAttrsIsStaticMap = require_cachedAttrsIsStaticMap();
      var selectorParser = /(?:(^|#|\.)([^#\.\[\]]+))|(\[(.+?)(?:\s*=\s*("|'|)((?:\\["'\]]|.)*?)\5)?\])/g;
      var selectorCache = /* @__PURE__ */ Object.create(null);
      function isEmpty(object) {
        for (var key in object) if (hasOwn.call(object, key)) return false;
        return true;
      }
      function isFormAttributeKey(key) {
        return key === "value" || key === "checked" || key === "selectedIndex" || key === "selected";
      }
      function compileSelector(selector) {
        var match, tag = "div", classes = [], attrs = {}, isStatic = true;
        while (match = selectorParser.exec(selector)) {
          var type = match[1], value = match[2];
          if (type === "" && value !== "") tag = value;
          else if (type === "#") attrs.id = value;
          else if (type === ".") classes.push(value);
          else if (match[3][0] === "[") {
            var attrValue = match[6];
            if (attrValue) attrValue = attrValue.replace(/\\(["'])/g, "$1").replace(/\\\\/g, "\\");
            if (match[4] === "class") classes.push(attrValue);
            else {
              attrs[match[4]] = attrValue === "" ? attrValue : attrValue || true;
              if (isFormAttributeKey(match[4])) isStatic = false;
            }
          }
        }
        if (classes.length > 0) attrs.className = classes.join(" ");
        if (isEmpty(attrs)) attrs = emptyAttrs;
        else cachedAttrsIsStaticMap.set(attrs, isStatic);
        return selectorCache[selector] = { tag, attrs, is: attrs.is };
      }
      function execSelector(state, vnode) {
        vnode.tag = state.tag;
        var attrs = vnode.attrs;
        if (attrs == null) {
          vnode.attrs = state.attrs;
          vnode.is = state.is;
          return vnode;
        }
        if (hasOwn.call(attrs, "class")) {
          if (attrs.class != null) attrs.className = attrs.class;
          attrs.class = null;
        }
        if (state.attrs !== emptyAttrs) {
          var className = attrs.className;
          attrs = Object.assign({}, state.attrs, attrs);
          if (state.attrs.className != null) attrs.className = className != null ? String(state.attrs.className) + " " + String(className) : state.attrs.className;
        }
        if (state.tag === "input" && hasOwn.call(attrs, "type")) {
          attrs = Object.assign({ type: attrs.type }, attrs);
        }
        vnode.is = attrs.is;
        vnode.attrs = attrs;
        return vnode;
      }
      function hyperscript(selector, attrs, ...children) {
        if (selector == null || typeof selector !== "string" && typeof selector !== "function" && typeof selector.view !== "function") {
          throw Error("The selector must be either a string or a component.");
        }
        var vnode = hyperscriptVnode(attrs, children);
        if (typeof selector === "string") {
          vnode.children = Vnode.normalizeChildren(vnode.children);
          if (selector !== "[") return execSelector(selectorCache[selector] || compileSelector(selector), vnode);
        }
        if (vnode.attrs == null) vnode.attrs = {};
        vnode.tag = selector;
        return vnode;
      }
      module.exports = hyperscript;
    }
  });

  // node_modules/mithril/render/trust.js
  var require_trust = __commonJS({
    "node_modules/mithril/render/trust.js"(exports, module) {
      "use strict";
      var Vnode = require_vnode();
      module.exports = function(html) {
        if (html == null) html = "";
        return Vnode("<", void 0, void 0, html, void 0, void 0);
      };
    }
  });

  // node_modules/mithril/render/fragment.js
  var require_fragment = __commonJS({
    "node_modules/mithril/render/fragment.js"(exports, module) {
      "use strict";
      var Vnode = require_vnode();
      var hyperscriptVnode = require_hyperscriptVnode();
      module.exports = function(attrs, ...children) {
        var vnode = hyperscriptVnode(attrs, children);
        if (vnode.attrs == null) vnode.attrs = {};
        vnode.tag = "[";
        vnode.children = Vnode.normalizeChildren(vnode.children);
        return vnode;
      };
    }
  });

  // node_modules/mithril/hyperscript.js
  var require_hyperscript2 = __commonJS({
    "node_modules/mithril/hyperscript.js"(exports, module) {
      "use strict";
      var hyperscript = require_hyperscript();
      hyperscript.trust = require_trust();
      hyperscript.fragment = require_fragment();
      module.exports = hyperscript;
    }
  });

  // node_modules/mithril/render/delayedRemoval.js
  var require_delayedRemoval = __commonJS({
    "node_modules/mithril/render/delayedRemoval.js"(exports, module) {
      "use strict";
      module.exports = /* @__PURE__ */ new WeakMap();
    }
  });

  // node_modules/mithril/render/domFor.js
  var require_domFor = __commonJS({
    "node_modules/mithril/render/domFor.js"(exports, module) {
      "use strict";
      var delayedRemoval = require_delayedRemoval();
      function* domFor(vnode) {
        var dom = vnode.dom;
        var domSize = vnode.domSize;
        var generation = delayedRemoval.get(dom);
        if (dom != null) do {
          var nextSibling = dom.nextSibling;
          if (delayedRemoval.get(dom) === generation) {
            yield dom;
            domSize--;
          }
          dom = nextSibling;
        } while (domSize);
      }
      module.exports = domFor;
    }
  });

  // node_modules/mithril/render/render.js
  var require_render = __commonJS({
    "node_modules/mithril/render/render.js"(exports, module) {
      "use strict";
      var Vnode = require_vnode();
      var delayedRemoval = require_delayedRemoval();
      var domFor = require_domFor();
      var cachedAttrsIsStaticMap = require_cachedAttrsIsStaticMap();
      module.exports = function() {
        var nameSpace = {
          svg: "http://www.w3.org/2000/svg",
          math: "http://www.w3.org/1998/Math/MathML"
        };
        var currentRedraw;
        var currentRender;
        function getDocument(dom) {
          return dom.ownerDocument;
        }
        function getNameSpace(vnode) {
          return vnode.attrs && vnode.attrs.xmlns || nameSpace[vnode.tag];
        }
        function checkState(vnode, original) {
          if (vnode.state !== original) throw new Error("'vnode.state' must not be modified.");
        }
        function callHook(vnode) {
          var original = vnode.state;
          try {
            return this.apply(original, arguments);
          } finally {
            checkState(vnode, original);
          }
        }
        function activeElement(dom) {
          try {
            return getDocument(dom).activeElement;
          } catch (e) {
            return null;
          }
        }
        function createNodes(parent, vnodes, start, end, hooks, nextSibling, ns) {
          for (var i = start; i < end; i++) {
            var vnode = vnodes[i];
            if (vnode != null) {
              createNode(parent, vnode, hooks, ns, nextSibling);
            }
          }
        }
        function createNode(parent, vnode, hooks, ns, nextSibling) {
          var tag = vnode.tag;
          if (typeof tag === "string") {
            vnode.state = {};
            if (vnode.attrs != null) initLifecycle(vnode.attrs, vnode, hooks);
            switch (tag) {
              case "#":
                createText(parent, vnode, nextSibling);
                break;
              case "<":
                createHTML(parent, vnode, ns, nextSibling);
                break;
              case "[":
                createFragment(parent, vnode, hooks, ns, nextSibling);
                break;
              default:
                createElement(parent, vnode, hooks, ns, nextSibling);
            }
          } else createComponent(parent, vnode, hooks, ns, nextSibling);
        }
        function createText(parent, vnode, nextSibling) {
          vnode.dom = getDocument(parent).createTextNode(vnode.children);
          insertDOM(parent, vnode.dom, nextSibling);
        }
        var possibleParents = { caption: "table", thead: "table", tbody: "table", tfoot: "table", tr: "tbody", th: "tr", td: "tr", colgroup: "table", col: "colgroup" };
        function createHTML(parent, vnode, ns, nextSibling) {
          var match = vnode.children.match(/^\s*?<(\w+)/im) || [];
          var temp = getDocument(parent).createElement(possibleParents[match[1]] || "div");
          if (ns === "http://www.w3.org/2000/svg") {
            temp.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + vnode.children + "</svg>";
            temp = temp.firstChild;
          } else {
            temp.innerHTML = vnode.children;
          }
          vnode.dom = temp.firstChild;
          vnode.domSize = temp.childNodes.length;
          var fragment = getDocument(parent).createDocumentFragment();
          var child;
          while (child = temp.firstChild) {
            fragment.appendChild(child);
          }
          insertDOM(parent, fragment, nextSibling);
        }
        function createFragment(parent, vnode, hooks, ns, nextSibling) {
          var fragment = getDocument(parent).createDocumentFragment();
          if (vnode.children != null) {
            var children = vnode.children;
            createNodes(fragment, children, 0, children.length, hooks, null, ns);
          }
          vnode.dom = fragment.firstChild;
          vnode.domSize = fragment.childNodes.length;
          insertDOM(parent, fragment, nextSibling);
        }
        function createElement(parent, vnode, hooks, ns, nextSibling) {
          var tag = vnode.tag;
          var attrs = vnode.attrs;
          var is = vnode.is;
          ns = getNameSpace(vnode) || ns;
          var element = ns ? is ? getDocument(parent).createElementNS(ns, tag, { is }) : getDocument(parent).createElementNS(ns, tag) : is ? getDocument(parent).createElement(tag, { is }) : getDocument(parent).createElement(tag);
          vnode.dom = element;
          if (attrs != null) {
            setAttrs(vnode, attrs, ns);
          }
          insertDOM(parent, element, nextSibling);
          if (!maybeSetContentEditable(vnode)) {
            if (vnode.children != null) {
              var children = vnode.children;
              createNodes(element, children, 0, children.length, hooks, null, ns);
              if (vnode.tag === "select" && attrs != null) setLateSelectAttrs(vnode, attrs);
            }
          }
        }
        function initComponent(vnode, hooks) {
          var sentinel;
          if (typeof vnode.tag.view === "function") {
            vnode.state = Object.create(vnode.tag);
            sentinel = vnode.state.view;
            if (sentinel.$$reentrantLock$$ != null) return;
            sentinel.$$reentrantLock$$ = true;
          } else {
            vnode.state = void 0;
            sentinel = vnode.tag;
            if (sentinel.$$reentrantLock$$ != null) return;
            sentinel.$$reentrantLock$$ = true;
            vnode.state = vnode.tag.prototype != null && typeof vnode.tag.prototype.view === "function" ? new vnode.tag(vnode) : vnode.tag(vnode);
          }
          initLifecycle(vnode.state, vnode, hooks);
          if (vnode.attrs != null) initLifecycle(vnode.attrs, vnode, hooks);
          vnode.instance = Vnode.normalize(callHook.call(vnode.state.view, vnode));
          if (vnode.instance === vnode) throw Error("A view cannot return the vnode it received as argument");
          sentinel.$$reentrantLock$$ = null;
        }
        function createComponent(parent, vnode, hooks, ns, nextSibling) {
          initComponent(vnode, hooks);
          if (vnode.instance != null) {
            createNode(parent, vnode.instance, hooks, ns, nextSibling);
            vnode.dom = vnode.instance.dom;
            vnode.domSize = vnode.instance.domSize;
          } else {
            vnode.domSize = 0;
          }
        }
        function updateNodes(parent, old, vnodes, hooks, nextSibling, ns) {
          if (old === vnodes || old == null && vnodes == null) return;
          else if (old == null || old.length === 0) createNodes(parent, vnodes, 0, vnodes.length, hooks, nextSibling, ns);
          else if (vnodes == null || vnodes.length === 0) removeNodes(parent, old, 0, old.length);
          else {
            var isOldKeyed = old[0] != null && old[0].key != null;
            var isKeyed = vnodes[0] != null && vnodes[0].key != null;
            var start = 0, oldStart = 0;
            if (!isOldKeyed) while (oldStart < old.length && old[oldStart] == null) oldStart++;
            if (!isKeyed) while (start < vnodes.length && vnodes[start] == null) start++;
            if (isOldKeyed !== isKeyed) {
              removeNodes(parent, old, oldStart, old.length);
              createNodes(parent, vnodes, start, vnodes.length, hooks, nextSibling, ns);
            } else if (!isKeyed) {
              var commonLength = old.length < vnodes.length ? old.length : vnodes.length;
              start = start < oldStart ? start : oldStart;
              for (; start < commonLength; start++) {
                o = old[start];
                v = vnodes[start];
                if (o === v || o == null && v == null) continue;
                else if (o == null) createNode(parent, v, hooks, ns, getNextSibling(old, start + 1, nextSibling));
                else if (v == null) removeNode(parent, o);
                else updateNode(parent, o, v, hooks, getNextSibling(old, start + 1, nextSibling), ns);
              }
              if (old.length > commonLength) removeNodes(parent, old, start, old.length);
              if (vnodes.length > commonLength) createNodes(parent, vnodes, start, vnodes.length, hooks, nextSibling, ns);
            } else {
              var oldEnd = old.length - 1, end = vnodes.length - 1, map, o, v, oe, ve, topSibling;
              while (oldEnd >= oldStart && end >= start) {
                oe = old[oldEnd];
                ve = vnodes[end];
                if (oe.key !== ve.key) break;
                if (oe !== ve) updateNode(parent, oe, ve, hooks, nextSibling, ns);
                if (ve.dom != null) nextSibling = ve.dom;
                oldEnd--, end--;
              }
              while (oldEnd >= oldStart && end >= start) {
                o = old[oldStart];
                v = vnodes[start];
                if (o.key !== v.key) break;
                oldStart++, start++;
                if (o !== v) updateNode(parent, o, v, hooks, getNextSibling(old, oldStart, nextSibling), ns);
              }
              while (oldEnd >= oldStart && end >= start) {
                if (start === end) break;
                if (o.key !== ve.key || oe.key !== v.key) break;
                topSibling = getNextSibling(old, oldStart, nextSibling);
                moveDOM(parent, oe, topSibling);
                if (oe !== v) updateNode(parent, oe, v, hooks, topSibling, ns);
                if (++start <= --end) moveDOM(parent, o, nextSibling);
                if (o !== ve) updateNode(parent, o, ve, hooks, nextSibling, ns);
                if (ve.dom != null) nextSibling = ve.dom;
                oldStart++;
                oldEnd--;
                oe = old[oldEnd];
                ve = vnodes[end];
                o = old[oldStart];
                v = vnodes[start];
              }
              while (oldEnd >= oldStart && end >= start) {
                if (oe.key !== ve.key) break;
                if (oe !== ve) updateNode(parent, oe, ve, hooks, nextSibling, ns);
                if (ve.dom != null) nextSibling = ve.dom;
                oldEnd--, end--;
                oe = old[oldEnd];
                ve = vnodes[end];
              }
              if (start > end) removeNodes(parent, old, oldStart, oldEnd + 1);
              else if (oldStart > oldEnd) createNodes(parent, vnodes, start, end + 1, hooks, nextSibling, ns);
              else {
                var originalNextSibling = nextSibling, vnodesLength = end - start + 1, oldIndices = new Array(vnodesLength), li = 0, i = 0, pos = 2147483647, matched = 0, map, lisIndices;
                for (i = 0; i < vnodesLength; i++) oldIndices[i] = -1;
                for (i = end; i >= start; i--) {
                  if (map == null) map = getKeyMap(old, oldStart, oldEnd + 1);
                  ve = vnodes[i];
                  var oldIndex = map[ve.key];
                  if (oldIndex != null) {
                    pos = oldIndex < pos ? oldIndex : -1;
                    oldIndices[i - start] = oldIndex;
                    oe = old[oldIndex];
                    old[oldIndex] = null;
                    if (oe !== ve) updateNode(parent, oe, ve, hooks, nextSibling, ns);
                    if (ve.dom != null) nextSibling = ve.dom;
                    matched++;
                  }
                }
                nextSibling = originalNextSibling;
                if (matched !== oldEnd - oldStart + 1) removeNodes(parent, old, oldStart, oldEnd + 1);
                if (matched === 0) createNodes(parent, vnodes, start, end + 1, hooks, nextSibling, ns);
                else {
                  if (pos === -1) {
                    lisIndices = makeLisIndices(oldIndices);
                    li = lisIndices.length - 1;
                    for (i = end; i >= start; i--) {
                      v = vnodes[i];
                      if (oldIndices[i - start] === -1) createNode(parent, v, hooks, ns, nextSibling);
                      else {
                        if (lisIndices[li] === i - start) li--;
                        else moveDOM(parent, v, nextSibling);
                      }
                      if (v.dom != null) nextSibling = vnodes[i].dom;
                    }
                  } else {
                    for (i = end; i >= start; i--) {
                      v = vnodes[i];
                      if (oldIndices[i - start] === -1) createNode(parent, v, hooks, ns, nextSibling);
                      if (v.dom != null) nextSibling = vnodes[i].dom;
                    }
                  }
                }
              }
            }
          }
        }
        function updateNode(parent, old, vnode, hooks, nextSibling, ns) {
          var oldTag = old.tag, tag = vnode.tag;
          if (oldTag === tag && old.is === vnode.is) {
            vnode.state = old.state;
            vnode.events = old.events;
            if (shouldNotUpdate(vnode, old)) return;
            if (typeof oldTag === "string") {
              if (vnode.attrs != null) {
                updateLifecycle(vnode.attrs, vnode, hooks);
              }
              switch (oldTag) {
                case "#":
                  updateText(old, vnode);
                  break;
                case "<":
                  updateHTML(parent, old, vnode, ns, nextSibling);
                  break;
                case "[":
                  updateFragment(parent, old, vnode, hooks, nextSibling, ns);
                  break;
                default:
                  updateElement(old, vnode, hooks, ns);
              }
            } else updateComponent(parent, old, vnode, hooks, nextSibling, ns);
          } else {
            removeNode(parent, old);
            createNode(parent, vnode, hooks, ns, nextSibling);
          }
        }
        function updateText(old, vnode) {
          if (old.children.toString() !== vnode.children.toString()) {
            old.dom.nodeValue = vnode.children;
          }
          vnode.dom = old.dom;
        }
        function updateHTML(parent, old, vnode, ns, nextSibling) {
          if (old.children !== vnode.children) {
            removeDOM(parent, old);
            createHTML(parent, vnode, ns, nextSibling);
          } else {
            vnode.dom = old.dom;
            vnode.domSize = old.domSize;
          }
        }
        function updateFragment(parent, old, vnode, hooks, nextSibling, ns) {
          updateNodes(parent, old.children, vnode.children, hooks, nextSibling, ns);
          var domSize = 0, children = vnode.children;
          vnode.dom = null;
          if (children != null) {
            for (var i = 0; i < children.length; i++) {
              var child = children[i];
              if (child != null && child.dom != null) {
                if (vnode.dom == null) vnode.dom = child.dom;
                domSize += child.domSize || 1;
              }
            }
          }
          vnode.domSize = domSize;
        }
        function updateElement(old, vnode, hooks, ns) {
          var element = vnode.dom = old.dom;
          ns = getNameSpace(vnode) || ns;
          if (old.attrs != vnode.attrs || vnode.attrs != null && !cachedAttrsIsStaticMap.get(vnode.attrs)) {
            updateAttrs(vnode, old.attrs, vnode.attrs, ns);
          }
          if (!maybeSetContentEditable(vnode)) {
            updateNodes(element, old.children, vnode.children, hooks, null, ns);
          }
        }
        function updateComponent(parent, old, vnode, hooks, nextSibling, ns) {
          vnode.instance = Vnode.normalize(callHook.call(vnode.state.view, vnode));
          if (vnode.instance === vnode) throw Error("A view cannot return the vnode it received as argument");
          updateLifecycle(vnode.state, vnode, hooks);
          if (vnode.attrs != null) updateLifecycle(vnode.attrs, vnode, hooks);
          if (vnode.instance != null) {
            if (old.instance == null) createNode(parent, vnode.instance, hooks, ns, nextSibling);
            else updateNode(parent, old.instance, vnode.instance, hooks, nextSibling, ns);
            vnode.dom = vnode.instance.dom;
            vnode.domSize = vnode.instance.domSize;
          } else {
            if (old.instance != null) removeNode(parent, old.instance);
            vnode.domSize = 0;
          }
        }
        function getKeyMap(vnodes, start, end) {
          var map = /* @__PURE__ */ Object.create(null);
          for (; start < end; start++) {
            var vnode = vnodes[start];
            if (vnode != null) {
              var key = vnode.key;
              if (key != null) map[key] = start;
            }
          }
          return map;
        }
        var lisTemp = [];
        function makeLisIndices(a) {
          var result = [0];
          var u = 0, v = 0, i = 0;
          var il = lisTemp.length = a.length;
          for (var i = 0; i < il; i++) lisTemp[i] = a[i];
          for (var i = 0; i < il; ++i) {
            if (a[i] === -1) continue;
            var j = result[result.length - 1];
            if (a[j] < a[i]) {
              lisTemp[i] = j;
              result.push(i);
              continue;
            }
            u = 0;
            v = result.length - 1;
            while (u < v) {
              var c = (u >>> 1) + (v >>> 1) + (u & v & 1);
              if (a[result[c]] < a[i]) {
                u = c + 1;
              } else {
                v = c;
              }
            }
            if (a[i] < a[result[u]]) {
              if (u > 0) lisTemp[i] = result[u - 1];
              result[u] = i;
            }
          }
          u = result.length;
          v = result[u - 1];
          while (u-- > 0) {
            result[u] = v;
            v = lisTemp[v];
          }
          lisTemp.length = 0;
          return result;
        }
        function getNextSibling(vnodes, i, nextSibling) {
          for (; i < vnodes.length; i++) {
            if (vnodes[i] != null && vnodes[i].dom != null) return vnodes[i].dom;
          }
          return nextSibling;
        }
        function moveDOM(parent, vnode, nextSibling) {
          if (vnode.dom != null) {
            var target;
            if (vnode.domSize == null || vnode.domSize === 1) {
              target = vnode.dom;
            } else {
              target = getDocument(parent).createDocumentFragment();
              for (var dom of domFor(vnode)) target.appendChild(dom);
            }
            insertDOM(parent, target, nextSibling);
          }
        }
        function insertDOM(parent, dom, nextSibling) {
          if (nextSibling != null) parent.insertBefore(dom, nextSibling);
          else parent.appendChild(dom);
        }
        function maybeSetContentEditable(vnode) {
          if (vnode.attrs == null || vnode.attrs.contenteditable == null && // attribute
          vnode.attrs.contentEditable == null) return false;
          var children = vnode.children;
          if (children != null && children.length === 1 && children[0].tag === "<") {
            var content = children[0].children;
            if (vnode.dom.innerHTML !== content) vnode.dom.innerHTML = content;
          } else if (children != null && children.length !== 0) throw new Error("Child node of a contenteditable must be trusted.");
          return true;
        }
        function removeNodes(parent, vnodes, start, end) {
          for (var i = start; i < end; i++) {
            var vnode = vnodes[i];
            if (vnode != null) removeNode(parent, vnode);
          }
        }
        function tryBlockRemove(parent, vnode, source, counter) {
          var original = vnode.state;
          var result = callHook.call(source.onbeforeremove, vnode);
          if (result == null) return;
          var generation = currentRender;
          for (var dom of domFor(vnode)) delayedRemoval.set(dom, generation);
          counter.v++;
          Promise.resolve(result).finally(function() {
            checkState(vnode, original);
            tryResumeRemove(parent, vnode, counter);
          });
        }
        function tryResumeRemove(parent, vnode, counter) {
          if (--counter.v === 0) {
            onremove(vnode);
            removeDOM(parent, vnode);
          }
        }
        function removeNode(parent, vnode) {
          var counter = { v: 1 };
          if (typeof vnode.tag !== "string" && typeof vnode.state.onbeforeremove === "function") tryBlockRemove(parent, vnode, vnode.state, counter);
          if (vnode.attrs && typeof vnode.attrs.onbeforeremove === "function") tryBlockRemove(parent, vnode, vnode.attrs, counter);
          tryResumeRemove(parent, vnode, counter);
        }
        function removeDOM(parent, vnode) {
          if (vnode.dom == null) return;
          if (vnode.domSize == null || vnode.domSize === 1) {
            parent.removeChild(vnode.dom);
          } else {
            for (var dom of domFor(vnode)) parent.removeChild(dom);
          }
        }
        function onremove(vnode) {
          if (typeof vnode.tag !== "string" && typeof vnode.state.onremove === "function") callHook.call(vnode.state.onremove, vnode);
          if (vnode.attrs && typeof vnode.attrs.onremove === "function") callHook.call(vnode.attrs.onremove, vnode);
          if (typeof vnode.tag !== "string") {
            if (vnode.instance != null) onremove(vnode.instance);
          } else {
            if (vnode.events != null) vnode.events._ = null;
            var children = vnode.children;
            if (Array.isArray(children)) {
              for (var i = 0; i < children.length; i++) {
                var child = children[i];
                if (child != null) onremove(child);
              }
            }
          }
        }
        function setAttrs(vnode, attrs, ns) {
          for (var key in attrs) {
            setAttr(vnode, key, null, attrs[key], ns);
          }
        }
        function setAttr(vnode, key, old, value, ns) {
          if (key === "key" || value == null || isLifecycleMethod(key) || old === value && !isFormAttribute(vnode, key) && typeof value !== "object") return;
          if (key[0] === "o" && key[1] === "n") return updateEvent(vnode, key, value);
          if (key.slice(0, 6) === "xlink:") vnode.dom.setAttributeNS("http://www.w3.org/1999/xlink", key.slice(6), value);
          else if (key === "style") updateStyle(vnode.dom, old, value);
          else if (hasPropertyKey(vnode, key, ns)) {
            if (key === "value") {
              if ((vnode.tag === "input" || vnode.tag === "textarea") && vnode.dom.value === "" + value) return;
              if (vnode.tag === "select" && old !== null && vnode.dom.value === "" + value) return;
              if (vnode.tag === "option" && old !== null && vnode.dom.value === "" + value) return;
              if (vnode.tag === "input" && vnode.attrs.type === "file" && "" + value !== "") {
                console.error("`value` is read-only on file inputs!");
                return;
              }
            }
            if (vnode.tag === "input" && key === "type") vnode.dom.setAttribute(key, value);
            else vnode.dom[key] = value;
          } else {
            if (typeof value === "boolean") {
              if (value) vnode.dom.setAttribute(key, "");
              else vnode.dom.removeAttribute(key);
            } else vnode.dom.setAttribute(key === "className" ? "class" : key, value);
          }
        }
        function removeAttr(vnode, key, old, ns) {
          if (key === "key" || old == null || isLifecycleMethod(key)) return;
          if (key[0] === "o" && key[1] === "n") updateEvent(vnode, key, void 0);
          else if (key === "style") updateStyle(vnode.dom, old, null);
          else if (hasPropertyKey(vnode, key, ns) && key !== "className" && key !== "title" && !(key === "value" && (vnode.tag === "option" || vnode.tag === "select" && vnode.dom.selectedIndex === -1 && vnode.dom === activeElement(vnode.dom))) && !(vnode.tag === "input" && key === "type")) {
            vnode.dom[key] = null;
          } else {
            var nsLastIndex = key.indexOf(":");
            if (nsLastIndex !== -1) key = key.slice(nsLastIndex + 1);
            if (old !== false) vnode.dom.removeAttribute(key === "className" ? "class" : key);
          }
        }
        function setLateSelectAttrs(vnode, attrs) {
          if ("value" in attrs) {
            if (attrs.value === null) {
              if (vnode.dom.selectedIndex !== -1) vnode.dom.value = null;
            } else {
              var normalized = "" + attrs.value;
              if (vnode.dom.value !== normalized || vnode.dom.selectedIndex === -1) {
                vnode.dom.value = normalized;
              }
            }
          }
          if ("selectedIndex" in attrs) setAttr(vnode, "selectedIndex", null, attrs.selectedIndex, void 0);
        }
        function updateAttrs(vnode, old, attrs, ns) {
          var val;
          if (old != null) {
            if (old === attrs && !cachedAttrsIsStaticMap.has(attrs)) {
              console.warn("Don't reuse attrs object, use new object for every redraw, this will throw in next major");
            }
            for (var key in old) {
              if ((val = old[key]) != null && (attrs == null || attrs[key] == null)) {
                removeAttr(vnode, key, val, ns);
              }
            }
          }
          if (attrs != null) {
            for (var key in attrs) {
              setAttr(vnode, key, old && old[key], attrs[key], ns);
            }
          }
        }
        function isFormAttribute(vnode, attr) {
          return attr === "value" || attr === "checked" || attr === "selectedIndex" || attr === "selected" && (vnode.dom === activeElement(vnode.dom) || vnode.tag === "option" && vnode.dom.parentNode === activeElement(vnode.dom));
        }
        function isLifecycleMethod(attr) {
          return attr === "oninit" || attr === "oncreate" || attr === "onupdate" || attr === "onremove" || attr === "onbeforeremove" || attr === "onbeforeupdate";
        }
        function hasPropertyKey(vnode, key, ns) {
          return ns === void 0 && // If it's a custom element, just keep it.
          (vnode.tag.indexOf("-") > -1 || vnode.is || // If it's a normal element, let's try to avoid a few browser bugs.
          key !== "href" && key !== "list" && key !== "form" && key !== "width" && key !== "height") && key in vnode.dom;
        }
        function updateStyle(element, old, style) {
          if (old === style) {
          } else if (style == null) {
            element.style = "";
          } else if (typeof style !== "object") {
            element.style = style;
          } else if (old == null || typeof old !== "object") {
            element.style = "";
            for (var key in style) {
              var value = style[key];
              if (value != null) {
                if (key.includes("-")) element.style.setProperty(key, String(value));
                else element.style[key] = String(value);
              }
            }
          } else {
            for (var key in old) {
              if (old[key] != null && style[key] == null) {
                if (key.includes("-")) element.style.removeProperty(key);
                else element.style[key] = "";
              }
            }
            for (var key in style) {
              var value = style[key];
              if (value != null && (value = String(value)) !== String(old[key])) {
                if (key.includes("-")) element.style.setProperty(key, value);
                else element.style[key] = value;
              }
            }
          }
        }
        function EventDict() {
          this._ = currentRedraw;
        }
        EventDict.prototype = /* @__PURE__ */ Object.create(null);
        EventDict.prototype.handleEvent = function(ev) {
          var handler = this["on" + ev.type];
          var result;
          if (typeof handler === "function") result = handler.call(ev.currentTarget, ev);
          else if (typeof handler.handleEvent === "function") handler.handleEvent(ev);
          var self = this;
          if (self._ != null) {
            if (ev.redraw !== false) (0, self._)();
            if (result != null && typeof result.then === "function") {
              Promise.resolve(result).then(function() {
                if (self._ != null && ev.redraw !== false) (0, self._)();
              });
            }
          }
          if (result === false) {
            ev.preventDefault();
            ev.stopPropagation();
          }
        };
        function updateEvent(vnode, key, value) {
          if (vnode.events != null) {
            vnode.events._ = currentRedraw;
            if (vnode.events[key] === value) return;
            if (value != null && (typeof value === "function" || typeof value === "object")) {
              if (vnode.events[key] == null) vnode.dom.addEventListener(key.slice(2), vnode.events, false);
              vnode.events[key] = value;
            } else {
              if (vnode.events[key] != null) vnode.dom.removeEventListener(key.slice(2), vnode.events, false);
              vnode.events[key] = void 0;
            }
          } else if (value != null && (typeof value === "function" || typeof value === "object")) {
            vnode.events = new EventDict();
            vnode.dom.addEventListener(key.slice(2), vnode.events, false);
            vnode.events[key] = value;
          }
        }
        function initLifecycle(source, vnode, hooks) {
          if (typeof source.oninit === "function") callHook.call(source.oninit, vnode);
          if (typeof source.oncreate === "function") hooks.push(callHook.bind(source.oncreate, vnode));
        }
        function updateLifecycle(source, vnode, hooks) {
          if (typeof source.onupdate === "function") hooks.push(callHook.bind(source.onupdate, vnode));
        }
        function shouldNotUpdate(vnode, old) {
          do {
            if (vnode.attrs != null && typeof vnode.attrs.onbeforeupdate === "function") {
              var force = callHook.call(vnode.attrs.onbeforeupdate, vnode, old);
              if (force !== void 0 && !force) break;
            }
            if (typeof vnode.tag !== "string" && typeof vnode.state.onbeforeupdate === "function") {
              var force = callHook.call(vnode.state.onbeforeupdate, vnode, old);
              if (force !== void 0 && !force) break;
            }
            return false;
          } while (false);
          vnode.dom = old.dom;
          vnode.domSize = old.domSize;
          vnode.instance = old.instance;
          vnode.attrs = old.attrs;
          vnode.children = old.children;
          vnode.text = old.text;
          return true;
        }
        var currentDOM;
        return function(dom, vnodes, redraw) {
          if (!dom) throw new TypeError("DOM element being rendered to does not exist.");
          if (currentDOM != null && dom.contains(currentDOM)) {
            throw new TypeError("Node is currently being rendered to and thus is locked.");
          }
          var prevRedraw = currentRedraw;
          var prevDOM = currentDOM;
          var hooks = [];
          var active = activeElement(dom);
          var namespace = dom.namespaceURI;
          currentDOM = dom;
          currentRedraw = typeof redraw === "function" ? redraw : void 0;
          currentRender = {};
          try {
            if (dom.vnodes == null) dom.textContent = "";
            vnodes = Vnode.normalizeChildren(Array.isArray(vnodes) ? vnodes : [vnodes]);
            updateNodes(dom, dom.vnodes, vnodes, hooks, null, namespace === "http://www.w3.org/1999/xhtml" ? void 0 : namespace);
            dom.vnodes = vnodes;
            if (active != null && activeElement(dom) !== active && typeof active.focus === "function") active.focus();
            for (var i = 0; i < hooks.length; i++) hooks[i]();
          } finally {
            currentRedraw = prevRedraw;
            currentDOM = prevDOM;
          }
        };
      };
    }
  });

  // node_modules/mithril/render.js
  var require_render2 = __commonJS({
    "node_modules/mithril/render.js"(exports, module) {
      "use strict";
      module.exports = require_render()();
    }
  });

  // node_modules/mithril/api/mount-redraw.js
  var require_mount_redraw = __commonJS({
    "node_modules/mithril/api/mount-redraw.js"(exports, module) {
      "use strict";
      var Vnode = require_vnode();
      module.exports = function(render, schedule, console2) {
        var subscriptions = [];
        var pending = false;
        var offset = -1;
        function sync() {
          for (offset = 0; offset < subscriptions.length; offset += 2) {
            try {
              render(subscriptions[offset], Vnode(subscriptions[offset + 1]), redraw);
            } catch (e) {
              console2.error(e);
            }
          }
          offset = -1;
        }
        function redraw() {
          if (!pending) {
            pending = true;
            schedule(function() {
              pending = false;
              sync();
            });
          }
        }
        redraw.sync = sync;
        function mount(root, component) {
          if (component != null && component.view == null && typeof component !== "function") {
            throw new TypeError("m.mount expects a component, not a vnode.");
          }
          var index = subscriptions.indexOf(root);
          if (index >= 0) {
            subscriptions.splice(index, 2);
            if (index <= offset) offset -= 2;
            render(root, []);
          }
          if (component != null) {
            subscriptions.push(root, component);
            render(root, Vnode(component), redraw);
          }
        }
        return { mount, redraw };
      };
    }
  });

  // node_modules/mithril/mount-redraw.js
  var require_mount_redraw2 = __commonJS({
    "node_modules/mithril/mount-redraw.js"(exports, module) {
      "use strict";
      var render = require_render2();
      module.exports = require_mount_redraw()(render, typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : null, typeof console !== "undefined" ? console : null);
    }
  });

  // node_modules/mithril/querystring/build.js
  var require_build = __commonJS({
    "node_modules/mithril/querystring/build.js"(exports, module) {
      "use strict";
      module.exports = function(object) {
        if (Object.prototype.toString.call(object) !== "[object Object]") return "";
        var args = [];
        for (var key in object) {
          destructure(key, object[key]);
        }
        return args.join("&");
        function destructure(key2, value) {
          if (Array.isArray(value)) {
            for (var i = 0; i < value.length; i++) {
              destructure(key2 + "[" + i + "]", value[i]);
            }
          } else if (Object.prototype.toString.call(value) === "[object Object]") {
            for (var i in value) {
              destructure(key2 + "[" + i + "]", value[i]);
            }
          } else args.push(encodeURIComponent(key2) + (value != null && value !== "" ? "=" + encodeURIComponent(value) : ""));
        }
      };
    }
  });

  // node_modules/mithril/pathname/build.js
  var require_build2 = __commonJS({
    "node_modules/mithril/pathname/build.js"(exports, module) {
      "use strict";
      var buildQueryString = require_build();
      module.exports = function(template, params) {
        if (/:([^\/\.-]+)(\.{3})?:/.test(template)) {
          throw new SyntaxError("Template parameter names must be separated by either a '/', '-', or '.'.");
        }
        if (params == null) return template;
        var queryIndex = template.indexOf("?");
        var hashIndex = template.indexOf("#");
        var queryEnd = hashIndex < 0 ? template.length : hashIndex;
        var pathEnd = queryIndex < 0 ? queryEnd : queryIndex;
        var path = template.slice(0, pathEnd);
        var query = {};
        Object.assign(query, params);
        var resolved = path.replace(/:([^\/\.-]+)(\.{3})?/g, function(m, key, variadic) {
          delete query[key];
          if (params[key] == null) return m;
          return variadic ? params[key] : encodeURIComponent(String(params[key]));
        });
        var newQueryIndex = resolved.indexOf("?");
        var newHashIndex = resolved.indexOf("#");
        var newQueryEnd = newHashIndex < 0 ? resolved.length : newHashIndex;
        var newPathEnd = newQueryIndex < 0 ? newQueryEnd : newQueryIndex;
        var result = resolved.slice(0, newPathEnd);
        if (queryIndex >= 0) result += template.slice(queryIndex, queryEnd);
        if (newQueryIndex >= 0) result += (queryIndex < 0 ? "?" : "&") + resolved.slice(newQueryIndex, newQueryEnd);
        var querystring = buildQueryString(query);
        if (querystring) result += (queryIndex < 0 && newQueryIndex < 0 ? "?" : "&") + querystring;
        if (hashIndex >= 0) result += template.slice(hashIndex);
        if (newHashIndex >= 0) result += (hashIndex < 0 ? "" : "&") + resolved.slice(newHashIndex);
        return result;
      };
    }
  });

  // node_modules/mithril/request/request.js
  var require_request = __commonJS({
    "node_modules/mithril/request/request.js"(exports, module) {
      "use strict";
      var buildPathname = require_build2();
      var hasOwn = require_hasOwn();
      module.exports = function($window, oncompletion) {
        function PromiseProxy(executor) {
          return new Promise(executor);
        }
        function makeRequest(url, args) {
          return new Promise(function(resolve, reject) {
            url = buildPathname(url, args.params);
            var method = args.method != null ? args.method.toUpperCase() : "GET";
            var body = args.body;
            var assumeJSON = (args.serialize == null || args.serialize === JSON.serialize) && !(body instanceof $window.FormData || body instanceof $window.URLSearchParams);
            var responseType = args.responseType || (typeof args.extract === "function" ? "" : "json");
            var xhr = new $window.XMLHttpRequest(), aborted = false, isTimeout = false;
            var original = xhr, replacedAbort;
            var abort = xhr.abort;
            xhr.abort = function() {
              aborted = true;
              abort.call(this);
            };
            xhr.open(method, url, args.async !== false, typeof args.user === "string" ? args.user : void 0, typeof args.password === "string" ? args.password : void 0);
            if (assumeJSON && body != null && !hasHeader(args, "content-type")) {
              xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
            }
            if (typeof args.deserialize !== "function" && !hasHeader(args, "accept")) {
              xhr.setRequestHeader("Accept", "application/json, text/*");
            }
            if (args.withCredentials) xhr.withCredentials = args.withCredentials;
            if (args.timeout) xhr.timeout = args.timeout;
            xhr.responseType = responseType;
            for (var key in args.headers) {
              if (hasOwn.call(args.headers, key)) {
                xhr.setRequestHeader(key, args.headers[key]);
              }
            }
            xhr.onreadystatechange = function(ev) {
              if (aborted) return;
              if (ev.target.readyState === 4) {
                try {
                  var success = ev.target.status >= 200 && ev.target.status < 300 || ev.target.status === 304 || /^file:\/\//i.test(url);
                  var response = ev.target.response, message;
                  if (responseType === "json") {
                    if (!ev.target.responseType && typeof args.extract !== "function") {
                      try {
                        response = JSON.parse(ev.target.responseText);
                      } catch (e) {
                        response = null;
                      }
                    }
                  } else if (!responseType || responseType === "text") {
                    if (response == null) response = ev.target.responseText;
                  }
                  if (typeof args.extract === "function") {
                    response = args.extract(ev.target, args);
                    success = true;
                  } else if (typeof args.deserialize === "function") {
                    response = args.deserialize(response);
                  }
                  if (success) {
                    if (typeof args.type === "function") {
                      if (Array.isArray(response)) {
                        for (var i = 0; i < response.length; i++) {
                          response[i] = new args.type(response[i]);
                        }
                      } else response = new args.type(response);
                    }
                    resolve(response);
                  } else {
                    var completeErrorResponse = function() {
                      try {
                        message = ev.target.responseText;
                      } catch (e) {
                        message = response;
                      }
                      var error = new Error(message);
                      error.code = ev.target.status;
                      error.response = response;
                      reject(error);
                    };
                    if (xhr.status === 0) {
                      setTimeout(function() {
                        if (isTimeout) return;
                        completeErrorResponse();
                      });
                    } else completeErrorResponse();
                  }
                } catch (e) {
                  reject(e);
                }
              }
            };
            xhr.ontimeout = function(ev) {
              isTimeout = true;
              var error = new Error("Request timed out");
              error.code = ev.target.status;
              reject(error);
            };
            if (typeof args.config === "function") {
              xhr = args.config(xhr, args, url) || xhr;
              if (xhr !== original) {
                replacedAbort = xhr.abort;
                xhr.abort = function() {
                  aborted = true;
                  replacedAbort.call(this);
                };
              }
            }
            if (body == null) xhr.send();
            else if (typeof args.serialize === "function") xhr.send(args.serialize(body));
            else if (body instanceof $window.FormData || body instanceof $window.URLSearchParams) xhr.send(body);
            else xhr.send(JSON.stringify(body));
          });
        }
        PromiseProxy.prototype = Promise.prototype;
        PromiseProxy.__proto__ = Promise;
        function hasHeader(args, name) {
          for (var key in args.headers) {
            if (hasOwn.call(args.headers, key) && key.toLowerCase() === name) return true;
          }
          return false;
        }
        return {
          request: function(url, args) {
            if (typeof url !== "string") {
              args = url;
              url = url.url;
            } else if (args == null) args = {};
            var promise = makeRequest(url, args);
            if (args.background === true) return promise;
            var count = 0;
            function complete() {
              if (--count === 0 && typeof oncompletion === "function") oncompletion();
            }
            return wrap(promise);
            function wrap(promise2) {
              var then = promise2.then;
              promise2.constructor = PromiseProxy;
              promise2.then = function() {
                count++;
                var next = then.apply(promise2, arguments);
                next.then(complete, function(e) {
                  complete();
                  if (count === 0) throw e;
                });
                return wrap(next);
              };
              return promise2;
            }
          }
        };
      };
    }
  });

  // node_modules/mithril/request.js
  var require_request2 = __commonJS({
    "node_modules/mithril/request.js"(exports, module) {
      "use strict";
      var mountRedraw = require_mount_redraw2();
      module.exports = require_request()(typeof window !== "undefined" ? window : null, mountRedraw.redraw);
    }
  });

  // node_modules/mithril/util/decodeURIComponentSafe.js
  var require_decodeURIComponentSafe = __commonJS({
    "node_modules/mithril/util/decodeURIComponentSafe.js"(exports, module) {
      "use strict";
      var validUtf8Encodings = /%(?:[0-7]|(?!c[01]|e0%[89]|ed%[ab]|f0%8|f4%[9ab])(?:c|d|(?:e|f[0-4]%[89ab])[\da-f]%[89ab])[\da-f]%[89ab])[\da-f]/gi;
      module.exports = function(str) {
        return String(str).replace(validUtf8Encodings, decodeURIComponent);
      };
    }
  });

  // node_modules/mithril/querystring/parse.js
  var require_parse = __commonJS({
    "node_modules/mithril/querystring/parse.js"(exports, module) {
      "use strict";
      var decodeURIComponentSafe = require_decodeURIComponentSafe();
      module.exports = function(string) {
        if (string === "" || string == null) return {};
        if (string.charAt(0) === "?") string = string.slice(1);
        var entries = string.split("&"), counters = {}, data = {};
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i].split("=");
          var key = decodeURIComponentSafe(entry[0]);
          var value = entry.length === 2 ? decodeURIComponentSafe(entry[1]) : "";
          if (value === "true") value = true;
          else if (value === "false") value = false;
          var levels = key.split(/\]\[?|\[/);
          var cursor = data;
          if (key.indexOf("[") > -1) levels.pop();
          for (var j = 0; j < levels.length; j++) {
            var level = levels[j], nextLevel = levels[j + 1];
            var isNumber = nextLevel == "" || !isNaN(parseInt(nextLevel, 10));
            if (level === "") {
              var key = levels.slice(0, j).join();
              if (counters[key] == null) {
                counters[key] = Array.isArray(cursor) ? cursor.length : 0;
              }
              level = counters[key]++;
            } else if (level === "__proto__") break;
            if (j === levels.length - 1) cursor[level] = value;
            else {
              var desc = Object.getOwnPropertyDescriptor(cursor, level);
              if (desc != null) desc = desc.value;
              if (desc == null) cursor[level] = desc = isNumber ? [] : {};
              cursor = desc;
            }
          }
        }
        return data;
      };
    }
  });

  // node_modules/mithril/pathname/parse.js
  var require_parse2 = __commonJS({
    "node_modules/mithril/pathname/parse.js"(exports, module) {
      "use strict";
      var parseQueryString = require_parse();
      module.exports = function(url) {
        var queryIndex = url.indexOf("?");
        var hashIndex = url.indexOf("#");
        var queryEnd = hashIndex < 0 ? url.length : hashIndex;
        var pathEnd = queryIndex < 0 ? queryEnd : queryIndex;
        var path = url.slice(0, pathEnd).replace(/\/{2,}/g, "/");
        if (!path) path = "/";
        else {
          if (path[0] !== "/") path = "/" + path;
        }
        return {
          path,
          params: queryIndex < 0 ? {} : parseQueryString(url.slice(queryIndex + 1, queryEnd))
        };
      };
    }
  });

  // node_modules/mithril/pathname/compileTemplate.js
  var require_compileTemplate = __commonJS({
    "node_modules/mithril/pathname/compileTemplate.js"(exports, module) {
      "use strict";
      var parsePathname = require_parse2();
      module.exports = function(template) {
        var templateData = parsePathname(template);
        var templateKeys = Object.keys(templateData.params);
        var keys = [];
        var regexp = new RegExp("^" + templateData.path.replace(
          // I escape literal text so people can use things like `:file.:ext` or
          // `:lang-:locale` in routes. This is all merged into one pass so I
          // don't also accidentally escape `-` and make it harder to detect it to
          // ban it from template parameters.
          /:([^\/.-]+)(\.{3}|\.(?!\.)|-)?|[\\^$*+.()|\[\]{}]/g,
          function(m, key, extra) {
            if (key == null) return "\\" + m;
            keys.push({ k: key, r: extra === "..." });
            if (extra === "...") return "(.*)";
            if (extra === ".") return "([^/]+)\\.";
            return "([^/]+)" + (extra || "");
          }
        ) + "\\/?$");
        return function(data) {
          for (var i = 0; i < templateKeys.length; i++) {
            if (templateData.params[templateKeys[i]] !== data.params[templateKeys[i]]) return false;
          }
          if (!keys.length) return regexp.test(data.path);
          var values = regexp.exec(data.path);
          if (values == null) return false;
          for (var i = 0; i < keys.length; i++) {
            data.params[keys[i].k] = keys[i].r ? values[i + 1] : decodeURIComponent(values[i + 1]);
          }
          return true;
        };
      };
    }
  });

  // node_modules/mithril/util/censor.js
  var require_censor = __commonJS({
    "node_modules/mithril/util/censor.js"(exports, module) {
      "use strict";
      var hasOwn = require_hasOwn();
      var magic = /^(?:key|oninit|oncreate|onbeforeupdate|onupdate|onbeforeremove|onremove)$/;
      module.exports = function(attrs, extras) {
        var result = {};
        if (extras != null) {
          for (var key in attrs) {
            if (hasOwn.call(attrs, key) && !magic.test(key) && extras.indexOf(key) < 0) {
              result[key] = attrs[key];
            }
          }
        } else {
          for (var key in attrs) {
            if (hasOwn.call(attrs, key) && !magic.test(key)) {
              result[key] = attrs[key];
            }
          }
        }
        return result;
      };
    }
  });

  // node_modules/mithril/api/router.js
  var require_router = __commonJS({
    "node_modules/mithril/api/router.js"(exports, module) {
      "use strict";
      var Vnode = require_vnode();
      var hyperscript = require_hyperscript();
      var decodeURIComponentSafe = require_decodeURIComponentSafe();
      var buildPathname = require_build2();
      var parsePathname = require_parse2();
      var compileTemplate = require_compileTemplate();
      var censor = require_censor();
      module.exports = function($window, mountRedraw) {
        var p = Promise.resolve();
        var scheduled = false;
        var ready = false;
        var hasBeenResolved = false;
        var dom, compiled, fallbackRoute;
        var currentResolver, component, attrs, currentPath, lastUpdate;
        var RouterRoot = {
          onremove: function() {
            ready = hasBeenResolved = false;
            $window.removeEventListener("popstate", fireAsync, false);
          },
          view: function() {
            var vnode = Vnode(component, attrs.key, attrs);
            if (currentResolver) return currentResolver.render(vnode);
            return [vnode];
          }
        };
        var SKIP = route.SKIP = {};
        function resolveRoute() {
          scheduled = false;
          var prefix = $window.location.hash;
          if (route.prefix[0] !== "#") {
            prefix = $window.location.search + prefix;
            if (route.prefix[0] !== "?") {
              prefix = $window.location.pathname + prefix;
              if (prefix[0] !== "/") prefix = "/" + prefix;
            }
          }
          var path = decodeURIComponentSafe(prefix).slice(route.prefix.length);
          var data = parsePathname(path);
          Object.assign(data.params, $window.history.state);
          function reject(e) {
            console.error(e);
            route.set(fallbackRoute, null, { replace: true });
          }
          loop(0);
          function loop(i) {
            for (; i < compiled.length; i++) {
              if (compiled[i].check(data)) {
                var payload = compiled[i].component;
                var matchedRoute = compiled[i].route;
                var localComp = payload;
                var update = lastUpdate = function(comp) {
                  if (update !== lastUpdate) return;
                  if (comp === SKIP) return loop(i + 1);
                  component = comp != null && (typeof comp.view === "function" || typeof comp === "function") ? comp : "div";
                  attrs = data.params, currentPath = path, lastUpdate = null;
                  currentResolver = payload.render ? payload : null;
                  if (hasBeenResolved) mountRedraw.redraw();
                  else {
                    hasBeenResolved = true;
                    mountRedraw.mount(dom, RouterRoot);
                  }
                };
                if (payload.view || typeof payload === "function") {
                  payload = {};
                  update(localComp);
                } else if (payload.onmatch) {
                  p.then(function() {
                    return payload.onmatch(data.params, path, matchedRoute);
                  }).then(update, path === fallbackRoute ? null : reject);
                } else update(
                  /* "div" */
                );
                return;
              }
            }
            if (path === fallbackRoute) {
              throw new Error("Could not resolve default route " + fallbackRoute + ".");
            }
            route.set(fallbackRoute, null, { replace: true });
          }
        }
        function fireAsync() {
          if (!scheduled) {
            scheduled = true;
            setTimeout(resolveRoute);
          }
        }
        function route(root, defaultRoute, routes) {
          if (!root) throw new TypeError("DOM element being rendered to does not exist.");
          compiled = Object.keys(routes).map(function(route2) {
            if (route2[0] !== "/") throw new SyntaxError("Routes must start with a '/'.");
            if (/:([^\/\.-]+)(\.{3})?:/.test(route2)) {
              throw new SyntaxError("Route parameter names must be separated with either '/', '.', or '-'.");
            }
            return {
              route: route2,
              component: routes[route2],
              check: compileTemplate(route2)
            };
          });
          fallbackRoute = defaultRoute;
          if (defaultRoute != null) {
            var defaultData = parsePathname(defaultRoute);
            if (!compiled.some(function(i) {
              return i.check(defaultData);
            })) {
              throw new ReferenceError("Default route doesn't match any known routes.");
            }
          }
          dom = root;
          $window.addEventListener("popstate", fireAsync, false);
          ready = true;
          resolveRoute();
        }
        route.set = function(path, data, options) {
          if (lastUpdate != null) {
            options = options || {};
            options.replace = true;
          }
          lastUpdate = null;
          path = buildPathname(path, data);
          if (ready) {
            fireAsync();
            var state = options ? options.state : null;
            var title = options ? options.title : null;
            if (options && options.replace) $window.history.replaceState(state, title, route.prefix + path);
            else $window.history.pushState(state, title, route.prefix + path);
          } else {
            $window.location.href = route.prefix + path;
          }
        };
        route.get = function() {
          return currentPath;
        };
        route.prefix = "#!";
        route.Link = {
          view: function(vnode) {
            var child = hyperscript(
              vnode.attrs.selector || "a",
              censor(vnode.attrs, ["options", "params", "selector", "onclick"]),
              vnode.children
            );
            var options, onclick, href;
            if (child.attrs.disabled = Boolean(child.attrs.disabled)) {
              child.attrs.href = null;
              child.attrs["aria-disabled"] = "true";
            } else {
              options = vnode.attrs.options;
              onclick = vnode.attrs.onclick;
              href = buildPathname(child.attrs.href, vnode.attrs.params);
              child.attrs.href = route.prefix + href;
              child.attrs.onclick = function(e) {
                var result;
                if (typeof onclick === "function") {
                  result = onclick.call(e.currentTarget, e);
                } else if (onclick == null || typeof onclick !== "object") {
                } else if (typeof onclick.handleEvent === "function") {
                  onclick.handleEvent(e);
                }
                if (
                  // Skip if `onclick` prevented default
                  result !== false && !e.defaultPrevented && // Ignore everything but left clicks
                  (e.button === 0 || e.which === 0 || e.which === 1) && // Let the browser handle `target=_blank`, etc.
                  (!e.currentTarget.target || e.currentTarget.target === "_self") && // No modifier keys
                  !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey
                ) {
                  e.preventDefault();
                  e.redraw = false;
                  route.set(href, null, options);
                }
              };
            }
            return child;
          }
        };
        route.param = function(key) {
          return attrs && key != null ? attrs[key] : attrs;
        };
        return route;
      };
    }
  });

  // node_modules/mithril/route.js
  var require_route = __commonJS({
    "node_modules/mithril/route.js"(exports, module) {
      "use strict";
      var mountRedraw = require_mount_redraw2();
      module.exports = require_router()(typeof window !== "undefined" ? window : null, mountRedraw);
    }
  });

  // node_modules/mithril/index.js
  var require_mithril = __commonJS({
    "node_modules/mithril/index.js"(exports, module) {
      "use strict";
      var hyperscript = require_hyperscript2();
      var mountRedraw = require_mount_redraw2();
      var request = require_request2();
      var router = require_route();
      var m = function m2() {
        return hyperscript.apply(this, arguments);
      };
      m.m = hyperscript;
      m.trust = hyperscript.trust;
      m.fragment = hyperscript.fragment;
      m.Fragment = "[";
      m.mount = mountRedraw.mount;
      m.route = router;
      m.render = require_render2();
      m.redraw = mountRedraw.redraw;
      m.request = request.request;
      m.parseQueryString = require_parse();
      m.buildQueryString = require_build();
      m.parsePathname = require_parse2();
      m.buildPathname = require_build2();
      m.vnode = require_vnode();
      m.censor = require_censor();
      m.domFor = require_domFor();
      module.exports = m;
    }
  });

  // src/index.ts
  var require_index = __commonJS({
    "src/index.ts"() {
      init_ray_tracing();
      init_constants();
      init_geometry_data();
      var import_mithril = __toESM(require_mithril());
      var state = {
        rayCount: 2e4,
        minBounces: 5e3,
        geometry: CUBE_FACES,
        audioToPlay: null,
        ctx: null,
        running: false,
        runRaytracing: async function() {
          state.running = true;
          state.audioToPlay = await rayTrace(state);
          state.running = false;
        },
        playAudio: function() {
          if (!state.audioToPlay) {
            return;
          }
          if (!state.ctx) {
            state.ctx = new AudioContext();
          }
          const sourceBuffer = state.ctx.createBuffer(
            1,
            state.audioToPlay.length,
            SAMPLE_RATE
          );
          const channel0 = sourceBuffer.getChannelData(0);
          for (let i = 0; i < state.audioToPlay.length; ++i) {
            channel0[i] = state.audioToPlay[i];
          }
          const source = state.ctx.createBufferSource();
          source.buffer = sourceBuffer;
          source.connect(state.ctx.destination);
          source.start(0);
        }
      };
      var AppView = {
        view: function() {
          return (0, import_mithril.default)("div", [
            (0, import_mithril.default)("section", { style: "border:1px solid black;" }, [
              (0, import_mithril.default)("label.block", [
                "Ray count:",
                (0, import_mithril.default)("input", {
                  type: "number",
                  min: "1",
                  value: state.rayCount,
                  oninput: function(e) {
                    state.rayCount = parseInt(e.target.value);
                  }
                })
              ]),
              (0, import_mithril.default)("label.block", [
                "Number of bounces:",
                (0, import_mithril.default)("input", {
                  type: "number",
                  min: "0",
                  value: state.minBounces,
                  oninput: function(e) {
                    state.minBounces = parseInt(e.target.value);
                  }
                })
              ]),
              (0, import_mithril.default)(
                "button",
                { disabled: state.running, onclick: state.runRaytracing },
                "Run raytracing"
              )
            ]),
            (0, import_mithril.default)(
              "button",
              {
                disabled: state.audioToPlay === null,
                onclick: state.playAudio
              },
              "Play audio"
            )
          ]);
        }
      };
      document.addEventListener("DOMContentLoaded", () => {
        const root = document.querySelector("#root");
        if (root) {
          import_mithril.default.mount(root, AppView);
        }
      });
    }
  });
  require_index();
})();
//# sourceMappingURL=index.js.map
