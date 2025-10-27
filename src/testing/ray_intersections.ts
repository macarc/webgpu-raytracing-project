import { runShader } from "../lib";
import { rayIntersectionShaderCode } from "../ray_intersections";
import { Ray, Triangle } from "../constants";
import {
  raysToFloatArray,
  trianglesToFloatArray,
  initialIntersectionsFloatArray,
} from "../floatarrays";

type TestCase = {
  name: string;
  rays: Ray[];
  triangles: Triangle[];
  expectedResult: number[];
};

const TEST_EPSILON = 32 * 2 ** -23;

async function runTestCases(testcases: TestCase[]) {
  let successCount = 0;

  for (const testcase of testcases) {
    // Run intersection code.
    const result = await runShader(
      rayIntersectionShaderCode(1),
      [
        {
          data: raysToFloatArray(testcase.rays),
          readonly: false,
          output: false,
        },
        {
          data: trianglesToFloatArray(testcase.triangles),
          readonly: true,
          output: false,
        },
        {
          data: initialIntersectionsFloatArray(testcase.rays.length),
          readonly: false,
          output: true,
        },
      ],
      testcase.rays.length,
    );

    // Get output buffer.
    const outputBuffer = result && result[0];

    let testSuccess = true;

    if (!outputBuffer) {
      console.log(`Got no response for testcase ${testcase.name}.`);
      testSuccess = false;
    } else {
      // Check each returned value is correct.
      for (let i = 0; i < testcase.expectedResult.length; ++i) {
        if (
          Math.abs(outputBuffer[i] - testcase.expectedResult[i]) > TEST_EPSILON
        ) {
          console.log("Got", outputBuffer, "expected", testcase.expectedResult);
          console.log(
            `(First mismatch at index ${i}: ${outputBuffer[i]} !== ${testcase.expectedResult[i]})`,
          );

          // TODO: verify the maths here.
          const iterationsToAffect =
            340 /
            (20000 * Math.abs(outputBuffer[i] - testcase.expectedResult[i]));
          console.log(
            `This causes noise in the audible frequency range after ${iterationsToAffect} iterations`,
          );
          testSuccess = false;
          break;
        }
      }
    }

    // Summarise test.
    if (testSuccess) {
      console.log(`[${testcase.name}]: SUCCESS`);
      ++successCount;
    } else {
      console.log(`[${testcase.name}]: FAIL`);
    }
  }

  // Summarise all tests.
  const summaryString = `[${successCount}/${testcases.length}] tests passed`;
  console.log("-".repeat(summaryString.length));
  console.log(summaryString);
  console.log("-".repeat(summaryString.length));
}

// Ray/triangle combinations to test.
const TEST_CASES: TestCase[] = [
  {
    name: "ray-fired-downwards",
    rays: [{ position: [0, 0, 1], direction: [0, 0, -1] }],
    triangles: [{ p1: [-1, -1, 0], p2: [-1, 1, 0], p3: [1, 0, 0] }],
    expectedResult: [1],
  },
  {
    name: "ray-fired-upwards",
    rays: [{ position: [0, 0, 1], direction: [0, 0, 1] }],
    triangles: [{ p1: [-1, -1, 0], p2: [-1, 1, 0], p3: [1, 0, 0] }],
    expectedResult: [Infinity],
  },
  {
    name: "two-rays-fired-downwards",
    rays: [
      { position: [0, 0, 1], direction: [0, 0, -1] },
      { position: [2, 0, 1], direction: [0, 0, -1] },
    ],
    triangles: [{ p1: [-1, -1, 0], p2: [-1, 1, 0], p3: [1, 0, 0] }],
    expectedResult: [1, Infinity],
  },
  {
    name: "ray-fired-downwards-edge",
    rays: [{ position: [-0.5, 0, 1], direction: [0, 0, -1] }],
    triangles: [{ p1: [-1, -1, 0], p2: [-1, 1, 0], p3: [1, 0, 0] }],
    expectedResult: [1],
  },
  {
    name: "ray-fired-downwards-reversed-triangle",
    rays: [{ position: [0, 0, 1], direction: [0, 0, -1] }],
    triangles: [{ p1: [-1, 1, 0], p2: [-1, -1, 0], p3: [1, 0, 0] }],
    expectedResult: [1],
  },
  {
    name: "overlapping-triangles",
    rays: [{ position: [0, 0, 8], direction: [0, 0, -1] }],
    triangles: [
      { p1: [-1, -1, 0], p2: [-1, 1, 0], p3: [1, 0, 3] },
      { p1: [-0.5, -0.5, 4], p2: [2, 2, 4], p3: [0, 3, 4] },
    ],
    expectedResult: [4],
  },
  {
    name: "non-power-of-two-1",
    rays: [{ position: [0, 0, 10], direction: [0, 0, -1] }],
    triangles: [{ p1: [-2, -1, 4], p2: [0, 0, 4], p3: [1, 3, 4] }],
    expectedResult: [6],
  },
  {
    name: "non-power-of-two-2",
    rays: [{ position: [0, 0, 10], direction: [0, 0, -1] }],
    triangles: [{ p1: [-0.5, -0.5, 4], p2: [2, 2, 4], p3: [0, 3, 4] }],
    expectedResult: [6],
  },
  {
    name: "non-power-of-two-3",
    rays: [{ position: [0, 0, 100], direction: [0, 0, -1] }],
    triangles: [{ p1: [-0.5, -0.5, 40], p2: [2, 2, 40], p3: [0, 3, 40] }],
    expectedResult: [60],
  },
  {
    name: "angled-ray",
    rays: [{ position: [1, 2, 2], direction: [-1 / 3, -2 / 3, -2 / 3] }],
    triangles: [{ p1: [-100, -1, 0], p2: [100, -0.5, 0], p3: [0.2, 0.1, 0] }],
    expectedResult: [3],
  },
];

/**
 * Run the ray intersection test suite.
 */
export async function runRayIntersectionTests() {
  await runTestCases(TEST_CASES);
}
