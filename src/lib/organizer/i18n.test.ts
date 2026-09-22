import { describe, expect, it } from "vitest";
import { translate, translations } from "./i18n";

describe("organizer translations", () => {
  it("keeps English and Spanish translation keys in sync", () => {
    expect(Object.keys(translations.es).sort()).toEqual(Object.keys(translations.en).sort());
  });

  it("uses the requested view labels", () => {
    expect([translate("en", "voronoiView"), translate("en", "graphView"), translate("en", "treeView")]).toEqual(["Leaf view", "Map view", "Text view"]);
    expect([translate("es", "voronoiView"), translate("es", "graphView"), translate("es", "treeView")]).toEqual(["Vista Hoja", "Vista Mapa", "Vista Texto"]);
    expect([translate("en", "mobileVoronoiView"), translate("en", "mobileGraphView"), translate("en", "mobileTreeView")]).toEqual(["Leaf", "Map", "Text"]);
    expect([translate("es", "mobileVoronoiView"), translate("es", "mobileGraphView"), translate("es", "mobileTreeView")]).toEqual(["Hoja", "Mapa", "Texto"]);
  });

  it("uses localized creation labels", () => {
    expect(translate("en", "newMap")).toBe("New map");
    expect(translate("es", "newMap")).toBe("Nuevo mapa");
    expect(translate("en", "mapList")).toBe("Maps");
    expect(translate("es", "mapList")).toBe("Mapas");
    expect(translate("en", "addChildNode")).toBe("Add child-node");
    expect(translate("es", "addChildNode")).toBe("Añadir nodo-hijo");
    expect(translate("en", "addChild")).toBe("Add a child-node");
    expect(translate("es", "addChild")).toBe("Añadir un nodo-hijo");
    expect(translate("en", "addNode")).toBe("Add node");
    expect(translate("es", "addNode")).toBe("Añadir nodo");
  });

  it("uses natural child counters and localized depth-limit messages", () => {
    expect([translate("en", "childCountOne"), translate("en", "childCountMany", { count: 6 })]).toEqual(["1 child", "6 children"]);
    expect([translate("es", "childCountOne"), translate("es", "childCountMany", { count: 6 })]).toEqual(["1 hijo", "6 hijos"]);
    expect(translate("en", "depthLimitMessage", { count: 12 })).toContain("maximum depth of 12 levels");
    expect(translate("es", "depthLimitMessage", { count: 12 })).toContain("profundidad máxima de 12 niveles");
  });

  it("localizes map deletion", () => {
    expect(translate("en", "deleteMap")).toBe("Delete map");
    expect(translate("es", "deleteMap")).toBe("Eliminar mapa");
    expect(translate("es", "deletedMap", { name: "Ideas" })).toBe("Se eliminó Ideas.");
  });

  it("uses the requested localized keyboard shortcut descriptions", () => {
    expect([translate("en", "openNode"), translate("en", "goBack")]).toEqual(["Open node", "Go up one level"]);
    expect([translate("es", "openNode"), translate("es", "goBack")]).toEqual(["Abrir nodo", "Subir un nivel"]);
    expect([translate("en", "viewNode"), translate("es", "viewNode")]).toEqual(["View node", "Ver nodo"]);
    expect([translate("en", "shortcutAddSibling"), translate("en", "shortcutIndent"), translate("en", "shortcutOutdent")]).toEqual(["Add sibling", "Indent node", "Move node up"]);
    expect([translate("es", "shortcutAddSibling"), translate("es", "shortcutIndent"), translate("es", "shortcutOutdent")]).toEqual(["Añadir hermano", "Anidar nodo", "Subir nodo"]);
    expect(translate("es", "editElement")).toBe("Editar nodo");
    expect(translate("en", "editElement")).toBe("Edit node");
  });

  it("interpolates dynamic values", () => {
    expect(translate("es", "nowChildOf", { name: "Tarea", parent: "Proyecto" })).toBe("Tarea es ahora un nodo-hijo de Proyecto.");
  });
});
