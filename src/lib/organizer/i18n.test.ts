import { describe, expect, it } from "vitest";
import { translate, translations } from "./i18n";

describe("organizer translations", () => {
  it("keeps English and Spanish translation keys in sync", () => {
    expect(Object.keys(translations.es).sort()).toEqual(Object.keys(translations.en).sort());
  });

  it("uses the requested view labels", () => {
    expect([translate("en", "voronoiView"), translate("en", "graphView"), translate("en", "treeView")]).toEqual(["Voronoi view", "Graph view", "Tree view"]);
    expect([translate("es", "voronoiView"), translate("es", "graphView"), translate("es", "treeView")]).toEqual(["Vista Voronoi", "Vista Grafo", "Vista Árbol"]);
  });

  it("uses localized creation labels", () => {
    expect(translate("en", "newMap")).toBe("New map");
    expect(translate("es", "newMap")).toBe("Nuevo mapa");
    expect(translate("en", "addChildNode")).toBe("Add child-node");
    expect(translate("es", "addChildNode")).toBe("Añadir nodo-hijo");
  });

  it("interpolates dynamic values", () => {
    expect(translate("es", "nowChildOf", { name: "Tarea", parent: "Proyecto" })).toBe("Tarea es ahora un nodo-hijo de Proyecto.");
  });
});
