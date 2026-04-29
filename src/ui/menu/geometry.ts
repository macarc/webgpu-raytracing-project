import m from "mithril";
import { state } from "../state";
import { LoadedGeometry } from "../../geometry";

export function geometryMenu() {
  return [
    m("section", [
      m("button", { onclick: state.setBoxGeometry }, "Load box room"),
      m("button", { onclick: state.setRoundGeometry }, "Load sphere"),
      m("button", { onclick: state.setLoadGeometry }, "Load geometry"),
    ]),
    state.geometry.view(),
    m("section", [
      m("label", [
        "Source position:",
        m("input", {
          type: "number",
          value: state.settings.sourcePosition[0],
          onchange: function (e: InputEvent) {
            state.settings.sourcePosition[0] = parseFloat(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
        m("input", {
          type: "number",
          value: state.settings.sourcePosition[1],
          onchange: function (e: InputEvent) {
            state.settings.sourcePosition[1] = parseFloat(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
        m("input", {
          type: "number",
          value: state.settings.sourcePosition[2],
          onchange: function (e: InputEvent) {
            state.settings.sourcePosition[2] = parseFloat(
              (e.target as HTMLInputElement).value,
            );
          },
        }),
      ]),
      m("label", [
        "Directional source?",
        m("input", {
          type: "checkbox",
          checked: state.settings.sourceDirection !== null,
          onchange: function (event: InputEvent) {
            const checked = (event.target as HTMLInputElement).checked;

            if (checked) {
              state.settings.sourceDirection = [1, 0, 0];
            } else {
              state.settings.sourceDirection = null;
            }
          },
        }),
      ]),
      state.settings.sourceDirection !== null
        ? m("label", [
            "Source direction:",
            m("input", {
              type: "number",
              value: state.settings.sourceDirection?.[0],
              onchange: function (e: InputEvent) {
                if (state.settings.sourceDirection !== null) {
                  state.settings.sourceDirection[0] = parseFloat(
                    (e.target as HTMLInputElement).value,
                  );
                }
              },
            }),
            m("input", {
              type: "number",
              value: state.settings.sourceDirection?.[1],
              onchange: function (e: InputEvent) {
                if (state.settings.sourceDirection !== null) {
                  state.settings.sourceDirection[1] = parseFloat(
                    (e.target as HTMLInputElement).value,
                  );
                }
              },
            }),
            m("input", {
              type: "number",
              value: state.settings.sourceDirection?.[2],
              onchange: function (e: InputEvent) {
                if (state.settings.sourceDirection) {
                  state.settings.sourceDirection[2] = parseFloat(
                    (e.target as HTMLInputElement).value,
                  );
                }
              },
            }),
          ])
        : null,
    ]),

    state.settings.receivers.map((receiver, i) =>
      m("section", [
        m("label", [
          `Receiver ${i} position:`,
          m("input", {
            type: "number",
            value: receiver.position[0],
            onchange: function (e: InputEvent) {
              receiver.position[0] = parseFloat(
                (e.target as HTMLInputElement).value,
              );
            },
          }),
          m("input", {
            type: "number",
            value: receiver.position[1],
            onchange: function (e: InputEvent) {
              receiver.position[1] = parseFloat(
                (e.target as HTMLInputElement).value,
              );
            },
          }),
          m("input", {
            type: "number",
            value: receiver.position[2],
            onchange: function (e: InputEvent) {
              receiver.position[2] = parseFloat(
                (e.target as HTMLInputElement).value,
              );
            },
          }),
        ]),
        m("label", [
          `Receiver ${i} radius (m):`,
          m("input", {
            type: "number",
            min: 0,
            step: 0.05,
            value: receiver.radius,
            onchange: function (e: InputEvent) {
              const r = parseFloat((e.target as HTMLInputElement).value);
              receiver.radius = r;
            },
          }),
        ]),
      ]),
    ),
    m("section", [
      m("button", { onclick: () => state.addReceiver() }, "Add receiver"),
      m("button", { onclick: () => state.deleteReceiver() }, "Delete receiver"),
    ]),
    m("section", [
      m("button", { onclick: () => state.saveState() }, "Save settings"),
      m("button", { onclick: () => state.loadState() }, "Load settings"),
      m(
        "button.reset",
        { onclick: () => state.resetSettings() },
        "Reset all settings",
      ),
    ]),
    m("section", [
      m("label", [
        m("input", {
          type: "checkbox",
          checked: state.showNormals,
          onchange: () => {
            state.showNormals = !state.showNormals;
          },
        }),
        "Show normals",
      ]),

      state.geometry instanceof LoadedGeometry &&
      state.geometry.selectedTriangle()
        ? m("button.flip-normal", { onclick: state.flipNormal }, "Flip normal")
        : null,
    ]),
  ];
}
