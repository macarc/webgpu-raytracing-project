import { runRayIntersectionTests } from "./testing/ray_intersections";
import { runRayIntersections } from "./ray_intersections";

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#run")?.addEventListener("click", async (e) => {
    (e.target as HTMLButtonElement).innerHTML = "Running";
    (e.target as HTMLButtonElement).disabled = true;
    await runRayIntersections();
    (e.target as HTMLButtonElement).innerHTML = "Run";
    (e.target as HTMLButtonElement).disabled = false;
  });

  document.querySelector("#run-tests")?.addEventListener("click", async (e) => {
    (e.target as HTMLButtonElement).innerHTML = "Running tests";
    (e.target as HTMLButtonElement).disabled = true;
    await runRayIntersectionTests();
    (e.target as HTMLButtonElement).innerHTML = "Run tests";
    (e.target as HTMLButtonElement).disabled = false;
  });
});
