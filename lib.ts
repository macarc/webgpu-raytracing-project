type ShaderBuffer = {
  data: Float32Array<ArrayBuffer>;
  readonly: boolean;
  output: boolean;
};

const FLOAT32_SIZE = 4; // bytes.

// Adapted from MDN WebGPU API documentation.
async function getGPUDevice(): Promise<GPUDevice | null> {
  // Ensure that the browser supports the GPU API.
  if (!navigator.gpu) {
    alert("GPU/browser not supported");
    return null;
  }

  // Get the GPU adapter, from which a GPU device may be requested.
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.error("No adapter");
    return null;
  }

  // Get the GPU device.
  const device = await adapter.requestDevice();

  // Handle disconnect from the GPU device.
  device.lost.then((info) => {
    console.error(`WebGPU device was lost: ${info.message}`);

    // Reason will be 'destroyed' if we intentionally destroy the device.
    if (info.reason !== "destroyed") {
      // TODO: try again.
      console.log("Can restart if we want");
    }
  });

  return device;
}

/**
 * Run a compute shader.
 *
 * The buffers will be bound as storage buffers, in the order given
 * (group 0, binding i for the i'th buffer).
 *
 * @param code shader source code.
 * @param buffers data buffers to map.
 * @param instancesCount number of times to run the shader.
 * @param workgroupSize number of threads per workgroup.
 * @returns
 */
export async function runShader(
  code: string,
  buffers: ShaderBuffer[],
  instancesCount: number,
  workgroupSize: number,
): Promise<Float32Array[] | null> {
  const device = await getGPUDevice();

  if (!device) {
    console.log("Aborted due to null GPUDevice.");
    return null;
  }

  // Buffers on GPU to hold data, passed to shader.
  const gpuBuffers = buffers.map((buf) =>
    device.createBuffer({
      size: buf.data.length * FLOAT32_SIZE,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    }),
  );

  // Bind group layout and bind group define how the buffers are passed to the shader.
  const bindGroupLayout = device.createBindGroupLayout({
    entries: buffers.map((buf, i) => ({
      binding: i,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: buf.readonly ? "read-only-storage" : "storage" },
    })),
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: gpuBuffers.map((buffer, i) => ({
      binding: i,
      resource: { buffer },
    })),
  });

  // Create the GPU shader and compute pipeline.
  const shaderModule = device.createShaderModule({ code });
  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    }),
    compute: { module: shaderModule, entryPoint: "main" },
  });

  // Schedule copying data into buffers.
  buffers.forEach((buffer, i) => {
    device.queue.writeBuffer(gpuBuffers[i], 0, buffer.data);
  });

  // Schedule the GPU shader pass.
  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();

  passEncoder.setPipeline(computePipeline);
  passEncoder.setBindGroup(0, bindGroup);

  passEncoder.dispatchWorkgroups(Math.ceil(instancesCount / workgroupSize));
  passEncoder.end();

  // Schedule copying output buffers to staging buffers (which can be read in JS).
  const stagingBuffers = buffers.map((buf) =>
    buf.output
      ? device.createBuffer({
          size: buf.data.length * FLOAT32_SIZE,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })
      : null,
  );
  stagingBuffers.forEach((stagingBuffer, i) => {
    if (stagingBuffer) {
      commandEncoder.copyBufferToBuffer(
        gpuBuffers[i],
        0,
        stagingBuffer,
        0,
        stagingBuffer.size,
      );
    }
  });

  console.time("run");

  // Execute the scheduled commands.
  device.queue.submit([commandEncoder.finish()]);

  // Map output buffers back to staging buffers (which can be read in JS).
  await Promise.all(
    stagingBuffers.map(
      (stagingBuffer) =>
        stagingBuffer &&
        stagingBuffer.mapAsync(GPUMapMode.READ, 0, stagingBuffer.size),
    ),
  );

  console.timeEnd("run");

  // Get the data from the staging buffers, and unmap the staging buffers.
  const dataOutput = stagingBuffers
    .filter((b) => b !== null)
    .map((stagingBuffer) => {
      const arrayDataOutput = stagingBuffer.getMappedRange().slice();
      stagingBuffer.unmap();
      return new Float32Array(arrayDataOutput);
    });

  // Convert to the correct type, and display the output.
  return dataOutput;
}
