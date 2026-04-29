import { AppView } from "./ui";
import { state } from "./ui/state";
import m from "mithril";

document.addEventListener("DOMContentLoaded", async () => {
  await state.loadFromLocalStorage();

  const root = document.querySelector("#root");
  if (root) {
    m.mount(root, AppView);
  }
});
