import { FLOAT32_SIZE, WORKGROUP_SIZE } from "./constants";

type ShaderBufferType =
  | "read-only-storage" // Read-only storage buffer.
  | "storage" // Read-write storage buffer.
  | "uniform"; // (Read-only) uniform.

type ShaderBuffer = {
  data: Float32Array<ArrayBuffer>;
  type: ShaderBufferType;
  output: boolean;
};

// Adapted from MDN WebGPU API documentation.
export async function getGPUDevice(): Promise<GPUDevice | null> {
  // Ensure that the browser supports the GPU API.
  if (!navigator.gpu) {
    alert(
      "GPU/browser not supported.\nIf you're on Firefox, try setting dom.webgpu.enabled to true in about:config.",
    );
    return null;
  }

  // BUG: it seems that the limits are downgraded here
  // (e.g. on my Mac, the adapter limit for maxStorageBufferBindingSize is much bigger than the device limit)

  // Get the GPU adapter, from which a GPU device may be requested.
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    console.error("No adapter");
    return null;
  }

  // Get the GPU device.
  const device = await adapter.requestDevice();

  // Handle disconnect from the GPU device.
  device.lost.then((info) => {
    // Reason will be 'destroyed' if we intentionally destroy the device.
    if (info.reason !== "destroyed") {
      console.error(`WebGPU device was lost: ${info.message}`);
      // TODO: try again.
      console.log("Can restart if we want");
    }
  });

  return device;
}

/**
 * Get the GPUBufferUsage flags for a shader buffer.
 * @param buf
 * @returns GPUBufferUsage flags OR'd together
 */
function bufferUsage(buf: ShaderBuffer): number {
  if (buf.type === "uniform") {
    return GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
  } else if (buf.type === "read-only-storage") {
    return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  } else if (buf.type === "storage") {
    if (buf.output) {
      return (
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST
      );
    } else {
      return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    }
  }

  // Never
  return buf.type;
}

/**
 * ComputeShaderPipeline manages WebGPU resources for a compute shader.
 */
export class ComputeShaderPipeline {
  private device: GPUDevice;
  private computePipeline: GPUComputePipeline;
  private bindGroup: GPUBindGroup;
  private gpuBuffers: GPUBuffer[];
  private stagingBuffers: (GPUBuffer | null)[];

  /**
   * Create a compute shader pipeline.
   * @param code shader code.
   * @param buffers list of GPU buffers that will be passed to the shader.
   * @returns the shader pipeline.
   */
  static async tryCreate(
    code: string,
    buffers: ShaderBuffer[],
  ): Promise<ComputeShaderPipeline | null> {
    const device = await getGPUDevice();

    if (!device) {
      console.log("Aborted due to null GPUDevice.");
      return null;
    }

    return new ComputeShaderPipeline(device, code, buffers);
  }

  /**
   * Create a shader pipeline from an existing GPU device.
   * @param gpuDevice the GPU device.
   * @param code shader code.
   * @param buffers list of GPU buffers that will be passed to the shader.
   */
  constructor(gpuDevice: GPUDevice, code: string, buffers: ShaderBuffer[]) {
    this.device = gpuDevice;

    // Buffers on GPU to hold data, passed to shader.
    this.gpuBuffers = buffers.map((buf) =>
      this.device.createBuffer({
        size: buf.data.length * FLOAT32_SIZE,
        usage: bufferUsage(buf),
      }),
    );

    // Bind group layout and bind group define how the buffers are passed to the shader.
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: buffers.map((buf, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: buf.type },
      })),
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: this.gpuBuffers.map((buffer, i) => ({
        binding: i,
        resource: { buffer },
      })),
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
    buffers.forEach((buffer, i) => {
      this.device.queue.writeBuffer(this.gpuBuffers[i], 0, buffer.data);
    });

    this.stagingBuffers = buffers.map((buf) =>
      buf.output
        ? this.device.createBuffer({
            size: buf.data.length * FLOAT32_SIZE,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          })
        : null,
    );
  }

  /**
   * Run the shader pipeline and get the output.
   * @param workgroupCount number of workgroups to run.
   * @returns list of buffers that were marked as 'output' when creating the shader.
   */
  async run(workgroupCount: number) {
    // Schedule the GPU shader pass.
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(this.computePipeline);
    passEncoder.setBindGroup(0, this.bindGroup);

    passEncoder.dispatchWorkgroups(Math.ceil(workgroupCount / WORKGROUP_SIZE));
    passEncoder.end();

    // Schedule copying output buffers to staging buffers (which can be read in JS).
    this.stagingBuffers.forEach((stagingBuffer, i) => {
      if (stagingBuffer) {
        commandEncoder.copyBufferToBuffer(
          this.gpuBuffers[i],
          0,
          stagingBuffer,
          0,
          stagingBuffer.size,
        );
      }
    });

    console.time("run");

    // Execute the scheduled commands.
    this.device.queue.submit([commandEncoder.finish()]);

    // Map output buffers back to staging buffers (which can be read in JS).
    await Promise.all(
      this.stagingBuffers.map(
        (stagingBuffer) =>
          stagingBuffer &&
          stagingBuffer.mapAsync(GPUMapMode.READ, 0, stagingBuffer.size),
      ),
    );

    console.timeEnd("run");

    // Get the data from the staging buffers, and unmap the staging buffers.
    const dataOutput = this.stagingBuffers
      .filter((b) => b !== null)
      .map((stagingBuffer) => {
        const arrayDataOutput = stagingBuffer.getMappedRange().slice();
        stagingBuffer.unmap();
        return new Float32Array(arrayDataOutput);
      });

    // Convert to the correct type, and display the output.
    return dataOutput;
  }

  /**
   * Destroy the shader GPU device, clearing all resources.
   */
  destroy() {
    // Free all resources on the GPU.
    this.device.destroy();
  }
}
