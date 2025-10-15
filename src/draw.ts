import { Ray, Triangle } from "./constants";
import Plotly, { Data } from "plotly.js-dist";

function randomColour() {
  return Math.floor(256 * Math.random());
}

const RAY_COLOUR = "rgb(255, 0, 0)";

/**
 *
 * @param triangles geometry.
 * @param rays rays and ray distances travelled.
 */
export function plotOutput(triangles: Triangle[], rays: [Ray, number][]) {
  const triangleData = triangles.map((triangle) => ({
    type: "mesh3d",
    x: [triangle.p1[0], triangle.p2[0], triangle.p3[0]],
    y: [triangle.p1[1], triangle.p2[1], triangle.p3[1]],
    z: [triangle.p1[2], triangle.p2[2], triangle.p3[2]],
    facecolor: triangles.map(
      (_) => `rgb(${randomColour()}, ${randomColour()}, ${randomColour()})`,
    ),
    flatshading: true,
  })) as Data[];

  const finiteRays = rays.filter(
    ([ray, distance]) => Math.abs(distance) !== Infinity,
  );

  const rayData = finiteRays.map(([ray, distance]) => ({
    type: "scatter3d",
    mode: "lines",
    x: [ray.position[0], ray.position[0] + ray.direction[0] * distance],
    y: [ray.position[1], ray.position[1] + ray.direction[1] * distance],
    z: [ray.position[2], ray.position[2] + ray.direction[2] * distance],
    line: {
      color: RAY_COLOUR,
    },
  })) as Data[];

  const circleData = {
    type: "scatter3d",
    mode: "markers",
    marker: {
      size: 2,
      color: RAY_COLOUR,
    },
    x: finiteRays.map(([ray, _]) => ray.position[0]),
    y: finiteRays.map(([ray, _]) => ray.position[1]),
    z: finiteRays.map(([ray, _]) => ray.position[2]),
  } as Data;

  Plotly.newPlot("container", [...triangleData, ...rayData, circleData]);
}
