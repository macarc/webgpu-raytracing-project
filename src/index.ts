import { runRayIntersectionTests } from "./testing/ray_intersections";
import {
  plotRayIntersections,
  stressTestRayIntersections,
} from "./ray_intersections";

async function withDisabled(
  element: HTMLButtonElement,
  fn: () => Promise<void>,
) {
  const text = element.innerText;
  element.innerText = "Running";
  element.disabled = true;
  await fn();
  element.innerText = text;
  element.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelector("#run-plot")
    ?.addEventListener("click", (e) =>
      withDisabled(e.target as HTMLButtonElement, plotRayIntersections),
    );

  document
    .querySelector("#run-stress")
    ?.addEventListener("click", (e) =>
      withDisabled(e.target as HTMLButtonElement, stressTestRayIntersections),
    );

  document
    .querySelector("#run-tests")
    ?.addEventListener("click", (e) =>
      withDisabled(e.target as HTMLButtonElement, runRayIntersectionTests),
    );
});
