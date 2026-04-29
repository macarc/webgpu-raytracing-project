import m from "mithril";
import { state } from "./state";
import { Viewport } from "./viewport";
import { geometryMenu } from "./menu/geometry";
import { materialsMenu } from "./menu/materials";
import { raytracingMenu } from "./menu/raytracing";

export let AppView = {
  onupdate: function () {
    state.saveToLocalStorage();
  },
  view: function () {
    return m("div.root-container", [
      m(Viewport),
      m("div.sidebar", [
        m("div.topbar", [
          m(
            "div.tab",
            {
              class: state.menu === "geometry" ? "selected" : "",
              onclick: () => state.setMenu("geometry"),
            },
            "Geometry",
          ),
          m("div.tab-gap"),
          m(
            "div.tab",
            {
              class: state.menu === "materials" ? "selected" : "",
              onclick: () => state.setMenu("materials"),
            },
            "Materials",
          ),
          m("div.tab-gap"),
          m(
            "div.tab",
            {
              class: state.menu === "raytracing" ? "selected" : "",
              onclick: () => state.setMenu("raytracing"),
            },
            "Raytracing",
          ),
        ]),
        m("section.menu-container", [
          state.menu === "geometry" ? geometryMenu() : null,
          state.menu === "materials" ? materialsMenu() : null,
          state.menu === "raytracing" ? raytracingMenu() : null,
        ]),
      ]),
    ]);
  },
};
