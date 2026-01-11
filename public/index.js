"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

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
    const bouncesPerPass = Math.floor(
      MAX_STORAGE_BUFFER_SIZE / (2 * FLOAT32_SIZE * settings.rayCount)
    );
    const numberOfPasses = Math.ceil(settings.maxBounces / bouncesPerPass);
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

  // src/index.ts
  var require_index = __commonJS({
    "src/index.ts"() {
      init_ray_tracing();
      init_constants();
      init_geometry_data();
      var audioToPlay = new Float32Array();
      var ctx = null;
      async function withDisabled(element, fn) {
        const text = element.innerText;
        element.innerText = "Running";
        element.disabled = true;
        await fn();
        element.innerText = text;
        element.disabled = false;
      }
      var RAY_TRACING_SETTINGS = {
        rayCount: 2e4,
        maxBounces: 2e4,
        geometry: CUBE_FACES
      };
      document.addEventListener("DOMContentLoaded", () => {
        document.querySelector("#run-raytracing")?.addEventListener(
          "click",
          (e) => withDisabled(e.target, async () => {
            audioToPlay = await rayTrace(RAY_TRACING_SETTINGS) || new Float32Array();
            const playBtn = document.querySelector("#play-audio");
            if (playBtn instanceof HTMLButtonElement) {
              playBtn.disabled = false;
            }
          })
        );
        document.querySelector("#play-audio")?.addEventListener("click", (e) => {
          ctx = ctx || new AudioContext();
          const sourceBuffer = ctx.createBuffer(1, audioToPlay.length, SAMPLE_RATE);
          const channel0 = sourceBuffer.getChannelData(0);
          for (let i = 0; i < audioToPlay.length; ++i) {
            channel0[i] = audioToPlay[i];
          }
          const source = ctx.createBufferSource();
          source.buffer = sourceBuffer;
          const gainNode = ctx.createGain();
          gainNode.gain.value = 1;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);
          source.start(0);
        });
      });
    }
  });
  require_index();
})();
//# sourceMappingURL=index.js.map
