// NOTE: these filter coefficients depend on SAMPLE_RATE.
//       They are calculated from MATLAB:
//       [B0,A0] = octdsgn(125, fs);
//       ... etc.
//
// TODO: generate these in JS?
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

function ensure(t: boolean) {
  if (t !== true) {
    throw new Error("Ensure failed!");
  }
}

function filter(B: number[], A: number[], input: Float32Array): Float64Array {
  ensure(A.length === B.length);
  ensure(A[0] === 1); // Ensure that the filter is normalised.

  // Using a 32-bit array causes instability.
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

export function combineFilteredAudio(
  band_125: Float32Array,
  band_250: Float32Array,
  band_500: Float32Array,
  band_1000: Float32Array,
  band_2000: Float32Array,
  band_4000: Float32Array,
): Float32Array<ArrayBuffer> {
  // Ensure each array has the same length
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
