// Helper DSP functions for combining multiple octave bands into a single band.

import FFT from "fft.js";
import { ensure } from "./log";

// NOTE: these filter coefficients depend on SAMPLE_RATE.
//       They are calculated from MATLAB:
//       [B0,A0] = octdsgn(125, fs);
//       ... etc.
const A0 = [
  1, -5.97710280273096, 14.8865696804245, -19.7752371006017, 14.7773215278572,
  -5.88969646032918, 0.978145155399091,
];

const A1 = [
  1, -5.95261778163623, 14.7673459816632, -19.5430940912569, 14.5513887157824,
  -5.77979012308764, 0.956767299736394,
];

const A2 = [
  1, -5.89895954268595, 14.5121134493874, -19.0579107531048, 14.090719754987,
  -5.56136155784429, 0.915398724423662,
];

const A3 = [
  1, -5.77342904194451, 13.9388867314386, -18.0128785058685, 13.1407882124164,
  -5.13128137368724, 0.837918571956601,
];

const A4 = [
  1, -5.45398042338919, 12.5790535567913, -15.6974643781023, 11.1774733875855,
  -4.30667765748868, 0.70186274596409,
];

const A5 = [
  1, -4.57926317858504, 9.33236799409301, -10.7411395683285, 7.35796347695069,
  -2.84721146218067, 0.491195076831595,
];

const B0 = [
  1.6674007995305e-7, 0, -5.00220239859151e-7, 0, 5.00220239859151e-7, 0,
  -1.6674007995305e-7,
];

const B1 = [
  1.31938414947782e-6, 0, -3.95815244843347e-6, 0, 3.95815244843347e-6, 0,
  -1.31938414947782e-6,
];

const B2 = [
  1.03281444898781e-5, 0, -3.09844334696344e-5, 0, 3.09844334696344e-5, 0,
  -1.03281444898781e-5,
];

const B3 = [
  7.91670726788158e-5, 0, -0.000237501218036447, 0, 0.000237501218036447, 0,
  -7.91670726788158e-5,
];

const B4 = [
  0.000583056136559946, 0, -0.00174916840967984, 0, 0.00174916840967984, 0,
  -0.000583056136559946,
];

const B5 = [
  0.00399558738785181, 0, -0.0119867621635554, 0, 0.0119867621635554, 0,
  -0.00399558738785181,
];

/**
 * Apply a filter to the Float32Array.
 * @param B feedforward filter coefficients
 * @param A feedback filter coefficients
 * @param input input audio.
 * @returns output filtered audio.
 */
function filter(B: number[], A: number[], input: Float32Array): Float64Array {
  ensure(
    A.length === B.length,
    "filter applied to invalid array lengths ",
    B.length,
    " and ",
    A.length,
  );
  ensure(A[0] === 1, "filter is not normalised");

  // Using a 32-bit array causes instability, so convert to 64-bit.
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

/**
 * Combine audio from multiple octave bands into a single audio Float32Array.
 * @param band_125
 * @param band_250
 * @param band_500
 * @param band_1000
 * @param band_2000
 * @param band_4000
 * @returns the output audio.
 */
export function combineFilteredAudio(
  band_125: Float32Array,
  band_250: Float32Array,
  band_500: Float32Array,
  band_1000: Float32Array,
  band_2000: Float32Array,
  band_4000: Float32Array,
): Float32Array<ArrayBuffer> {
  ensure(
    new Set([...arguments].map((i) => i.length)).size === 1,
    "not all frequency bands have the same duration",
  );

  const audio_125 = filter(B0, A0, band_125);
  const audio_250 = filter(B1, A1, band_250);
  const audio_500 = filter(B2, A2, band_500);
  const audio_1000 = filter(B3, A3, band_1000);
  const audio_2000 = filter(B4, A4, band_2000);
  const audio_4000 = filter(B5, A5, band_4000);

  const output = new Float32Array(band_125.length);

  let maxVal = 0;
  for (let i = 0; i < audio_125.length; ++i) {
    // NOTE: downconversion from 64-bit to 32-bit.
    output[i] =
      audio_125[i] +
      audio_250[i] +
      audio_500[i] +
      audio_1000[i] +
      audio_2000[i] +
      audio_4000[i];

    maxVal = Math.max(maxVal, Math.abs(output[i]));
  }

  for (let i = 0; i < output.length; ++i) {
    output[i] /= maxVal;
  }

  return output;
}

/**
 * Zero-pad the end of a Float32Array.
 * @param data array to zero-pad.
 * @param length output data length.
 * @returns padded Float32Array.
 */
export function pad(data: Float32Array, length: number): Float32Array {
  const output = new Float32Array(length);

  for (let i = 0; i < data.length; ++i) {
    output[i] = data[i];
  }

  return output;
}

/**
 * Get the length of the output when convolving input1 by input2.
 * @param input1
 * @param input2
 * @returns
 */
export function fftConvolvedSize(input1: AudioBuffer, input2: AudioBuffer) {
  const length = Math.max(input1.length, input2.length);
  return Math.pow(2, Math.ceil(Math.log(length) / Math.log(2)));
}

/**
 * Convolve input1 by input2.
 * @param input1
 * @param input2
 * @param output array to write output to, must have length >= fftConvolvedSize(input1, input2).
 * @returns the maximum value of the output.
 */
export function fftConvolve(
  input1: AudioBuffer,
  input2: AudioBuffer,
  output: AudioBuffer,
): number {
  if (input1.numberOfChannels === 0 || input2.numberOfChannels === 0) {
    return 0;
  }

  let maxOutputValue = 0;

  const fftSize = fftConvolvedSize(input1, input2);
  ensure(
    output.length >= fftSize,
    "convolution called with invalid output argument (too short)",
  );

  const f = new FFT(fftSize);

  // Create Fourier-domain arrays.
  const Y1 = f.createComplexArray();
  const Y2 = f.createComplexArray();

  for (let i = 0; i < input1.numberOfChannels; ++i) {
    // Zero-pad data up to fftSize.
    const padded1 = Array.from(pad(input1.getChannelData(i), fftSize));
    const padded2 = Array.from(pad(input2.getChannelData(i), fftSize));

    // DFT.
    // Y/irFFT contain interleaved (real, imaginary) samples.
    f.realTransform(Y1, padded1);
    f.realTransform(Y2, padded2);

    // Multiply (complex interleaved) Y1 by Y2.
    // Only need to multiply up to size/2 since the other half is
    // empty and populated by completeSpectrum() below.
    for (let i = 0; i <= fftSize / 2; i += 2) {
      const r1 = Y1[i];
      const i1 = Y1[i + 1];
      const r2 = Y2[i];
      const i2 = Y2[i + 1];

      Y1[i] = r1 * r2 - i1 * i2;
      Y1[i + 1] = r1 * i2 + r2 * i1;
    }

    // Complete Y using Hermitian symmetry (for real audio).
    f.completeSpectrum(Y1);

    // Inverse transform audio.
    const outputBuf = f.createComplexArray();
    f.inverseTransform(outputBuf, Y1);

    // Get output channel.
    const outputChannel = output.getChannelData(i);

    // Store every second sample (skipping imaginary samples).
    for (let j = 0; j < fftSize; ++j) {
      outputChannel[j] = outputBuf[j * 2];

      maxOutputValue = Math.max(Math.abs(outputChannel[j]), maxOutputValue);
    }
  }

  return maxOutputValue;
}
