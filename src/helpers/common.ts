import { Material, SAMPLE_RATE } from "../constants";

/**
 * Convert material name into an index into the materials array.
 * @param materials the array of materials.
 * @param name the name of the material.
 * @returns the index of the material in materials.
 */
export function materialNameToIndex(
  materials: Material[],
  name: string,
): number {
  const index = materials.findIndex((material) => material.name === name);
  if (index === -1) {
    throw new Error(`Unknown material: '${name}'`);
  }
  return index;
}

/**
 * Create audio buffer from a list of channels.
 * @param ctx AudioContext to create AudioBuffer with.
 * @param data list of channels.
 * @returns the new AudioBuffer.
 */
export function createAudioBufferFrom(
  ctx: AudioContext,
  data: Float32Array[],
): AudioBuffer {
  const channelCount = data.length;
  const length = Math.max(...data.map((channel) => channel.length));
  const buffer = ctx.createBuffer(channelCount, length, SAMPLE_RATE);

  // Copy data to audio buffer.s
  for (let chan = 0; chan < channelCount; ++chan) {
    const channel = buffer.getChannelData(chan);
    for (let i = 0; i < length; ++i) {
      channel[i] = data[chan][i];
    }
  }
  return buffer;
}

// Detect if on mobile by matching against the user-agent.
// Modified from https://stackoverflow.com/a/11381730
export const IS_ON_MOBILE = [
  /Android/i,
  /webOS/i,
  /iPhone/i,
  /iPad/i,
  /iPod/i,
  /BlackBerry/i,
  /Windows Phone/i,
].some((os) => navigator.userAgent.match(os));
