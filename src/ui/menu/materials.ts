import m from "mithril";
import { state } from "../state";
import { LoadedGeometry } from "../../geometry";

export function materialsMenu() {
  return [
    m("section", [
      m("table.materials", [
        m("tr", [
          m("th", "Material"),
          m("th", "125Hz"),
          m("th", "250Hz"),
          m("th", "500Hz"),
          m("th", "1kHz"),
          m("th", "2kHz"),
          m("th", "4kHz"),
          m("th", "Scatter"),
        ]),

        ...state.settings.materials.map((material) =>
          m("tr", [
            m("td.material-name", material.name),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a125,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a125"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a250,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a250"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a500,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a500"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a1000,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a1000"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a2000,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a2000"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.a4000,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "a4000"),
              }),
            ),
            m(
              "td",
              m("input", {
                type: "number",
                min: 0,
                max: 1,
                step: 0.01,
                value: material.scatter,
                onchange: (e: InputEvent) =>
                  state.setMaterialBand(e, material, "scatter"),
              }),
            ),
          ]),
        ),
      ]),
      m("button", { onclick: state.createMaterial }, "Create material"),
    ]),
    state.geometry.selectedTriangle()
      ? m("section", [
          m("label", [
            "Selected triangle material:",
            ...state.settings.materials.map((material) =>
              m("label", [
                m("input", {
                  type: "radio",
                  name: "select-material",
                  value: material.name,
                  checked:
                    state.geometry.selectedTriangle()?.material ===
                    material.name,
                  onchange: (e: InputEvent) => state.setSelectedMaterial(e),
                }),
                material.name,
              ]),
            ),
          ]),
          state.geometry instanceof LoadedGeometry
            ? m(
                "button.flip-normal",
                { onclick: state.flipNormal },
                "Flip normal",
              )
            : null,
        ])
      : null,
  ];
}
