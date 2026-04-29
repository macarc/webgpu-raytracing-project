import { ShaderBuffer } from "./compute_shader";
import {
  FLOAT32_SIZE,
  WASM_MAX_STORAGE_BUFFER_SIZE,
  WASM_MAX_UNIFORM_BUFFER_SIZE,
  WEBASSEMBLY_PAGE_SIZE,
} from "./constants";
import { error, log } from "./log";
import { Receiver } from "./ray_tracing";

const WASM_PATH = "public/webgpu_raytracing_wasm.wasm";

/**
 * Wasm memory layout:
 * |4 byte gap|1024 byte print section|storage/uniform buffer data section|
 * The print section is used for sending strings from Wasm to JS in order
 * to debug the Wasm code. The storage/uniform buffer data section contains
 * the same data as the buffer bind group in WebGPU.
 */

const PRINT_OFFSET = 4;
const PRINT_BUFFER_SIZE = 1024;

const DATA_BUFFER_OFFSET = PRINT_OFFSET + PRINT_BUFFER_SIZE;
const DATA_BUFFER_SIZE =
  (8 * WASM_MAX_STORAGE_BUFFER_SIZE + WASM_MAX_UNIFORM_BUFFER_SIZE) *
  FLOAT32_SIZE;

const WASM_PAGE_COUNT = Math.ceil(
  (DATA_BUFFER_OFFSET + DATA_BUFFER_SIZE) / WEBASSEMBLY_PAGE_SIZE,
);

type WasmModule = {
  mem: WebAssembly.Memory;
  run_wasm: (
    ray_count: number, // f32
    triangle_count: number, // f32
    bounce_count: number, // i32
    receiver_x: number, // f32
    receiver_y: number, // f32
    receiver_z: number, // f32
    receiver_radius: number, // f32
  ) => void;
};

// This holds the Wasm module, once it is loaded.
let globalWasmModule: WasmModule | null = null;

export class WasmPipeline {
  bounceCount: number;
  triangleCount: number;
  receiver: Receiver;
  buffers: ShaderBuffer[];

  constructor(
    bounceCount: number,
    triangleCount: number,
    receivers: Receiver[],
    buffers: ShaderBuffer[],
  ) {
    if (receivers.length !== 1) {
      error("can only run WASM with a single receiver");
    }
    this.receiver = receivers[0] || { position: [0, 0, 0], radius: 0.1 };
    this.bounceCount = bounceCount;
    this.buffers = buffers;
    this.triangleCount = triangleCount;
  }

  async initialise(): Promise<void> {
    const t = performance.now();
    if (globalWasmModule === null) {
      try {
        const wasmSource = await WebAssembly.instantiateStreaming(
          fetch(WASM_PATH),
          {
            macarc: {
              shader_memory_base: function () {
                return DATA_BUFFER_OFFSET | 0;
              },
              js_print_base: function () {
                return PRINT_OFFSET | 0;
              },
              js_max_print_len: function () {
                return (PRINT_BUFFER_SIZE - 1) | 0;
              },
              js_print: function (len: number) {
                if (globalWasmModule) {
                  let str = "";

                  let dv = new DataView(
                    globalWasmModule.mem.buffer,
                    PRINT_OFFSET,
                  );
                  let ptr = 0;

                  for (let i = 0; i < len; ++i) {
                    str += String.fromCharCode(dv.getUint8(ptr));
                    ptr++;
                  }

                  log("WASM: " + str);
                }
              },
              js_time: function () {
                return (performance.now() - t) | 0;
              },
            },
          },
        );

        globalWasmModule = {
          mem: wasmSource.instance.exports.memory as WebAssembly.Memory,
          run_wasm: wasmSource.instance.exports.run_shader as () => void,
        };

        globalWasmModule.mem.grow(WASM_PAGE_COUNT);
      } catch (e) {
        log(e);
        log("Total binding size (bytes): ", DATA_BUFFER_SIZE);
        log("Total memory size (pages): ", WASM_PAGE_COUNT);
        error("Could not load WASM module");
      }
    }

    if (globalWasmModule) {
      const writeableMemory = new DataView(
        globalWasmModule.mem.buffer,
        DATA_BUFFER_OFFSET,
      );
      let ptr = 0;

      for (let i = 0; i < this.buffers.length; i++) {
        const ptrAtStart = ptr;

        const bufferLength =
          this.buffers[i].type === "uniform"
            ? WASM_MAX_UNIFORM_BUFFER_SIZE / FLOAT32_SIZE
            : WASM_MAX_STORAGE_BUFFER_SIZE / FLOAT32_SIZE;

        // Copy data from ShaderBuffer into WASM memory.
        for (let j = 0; j < this.buffers[i].data.length; ++j) {
          writeableMemory.setFloat32(
            ptr * FLOAT32_SIZE,
            this.buffers[i].data[j],
            true,
          );
          ptr++;
        }

        ptr = ptrAtStart + bufferLength;
      }
    }
  }

  async run(rayCount: number): Promise<Float32Array[]> {
    if (globalWasmModule === null) {
      return [];
    }

    globalWasmModule.run_wasm(
      rayCount | 0,
      this.triangleCount | 0,
      this.bounceCount | 0,
      ...this.receiver.position,
      this.receiver.radius,
    );

    const readableMemory = new DataView(
      globalWasmModule.mem.buffer,
      DATA_BUFFER_OFFSET,
    );

    let ptr = 0;

    let result = [];

    for (let i = 0; i < this.buffers.length; i++) {
      const ptrAtStart = ptr;

      const bufferLength =
        this.buffers[i].type === "uniform"
          ? WASM_MAX_UNIFORM_BUFFER_SIZE / FLOAT32_SIZE
          : WASM_MAX_STORAGE_BUFFER_SIZE / FLOAT32_SIZE;

      if (this.buffers[i].output) {
        const outputLength = this.buffers[i].data.length;
        const buf = new Float32Array(outputLength);

        // Copy data from ShaderBuffer into Wasm memory.
        for (let j = 0; j < outputLength; ++j) {
          buf[j] = readableMemory.getFloat32(ptr * FLOAT32_SIZE, true);
          ptr++;
        }

        result.push(buf);
      }

      ptr = ptrAtStart + bufferLength;
    }

    return result;
  }

  destroy() {}
}
