import { runShader } from "../lib";
import { rayIntersectionShaderCode } from "../ray_intersections";

type Ray = {
  position: [number, number, number];
  direction: [number, number, number];
};

type Triangle = {
  p1: [number, number, number];
  p2: [number, number, number];
  p3: [number, number, number];
};

type TestCase = {
  name: string;
  rays: Ray[];
  triangles: Triangle[];
  expectedResult: number[];
};

async function runTestCases(testcases: TestCase[]) {
  for (const testcase of testcases) {
    const rayData = new Float32Array(
      testcase.rays.flatMap((ray) => [...ray.position, ...ray.direction]),
    );
    const triangleData = new Float32Array(
      testcase.triangles.flatMap((triangle) => [
        ...triangle.p1,
        triangle.p2[0] - triangle.p1[0],
        triangle.p2[1] - triangle.p1[1],
        triangle.p2[2] - triangle.p1[2],
        triangle.p3[0] - triangle.p1[0],
        triangle.p3[1] - triangle.p1[1],
        triangle.p3[2] - triangle.p1[2],
      ]),
    );
    const resultData = new Float32Array(testcase.expectedResult.length).fill(
      Infinity,
    );

    const result = await runShader(
      rayIntersectionShaderCode(1),
      [
        {
          data: rayData,
          readonly: false,
          output: false,
        },
        {
          data: triangleData,
          readonly: true,
          output: false,
        },
        {
          data: resultData,
          readonly: false,
          output: true,
        },
      ],
      testcase.rays.length,
    );

    const outputBuffer = result && result[0];
    const eps = 0.00000000001;

    let testSuccess = true;

    if (!outputBuffer) {
      console.log(`Got no response for testcase ${testcase.name}.`);
      testSuccess = false;
    } else {
      for (let i = 0; i < testcase.expectedResult.length; ++i) {
        if (Math.abs(outputBuffer[i] - testcase.expectedResult[i]) > eps) {
          console.log("Got", outputBuffer, "expected", testcase.expectedResult);
          console.log(
            `(First mismatch at index ${i}: ${outputBuffer[i]} !== ${testcase.expectedResult[i]})`,
          );
          testSuccess = false;
          break;
        }
      }
    }

    if (testSuccess) {
      console.log(`[${testcase.name}]: SUCCESS`);
    } else {
      console.log(`[${testcase.name}]: FAIL`);
    }
  }
}

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
];

export async function runRayIntersectionTests() {
  await runTestCases(TEST_CASES);
}
