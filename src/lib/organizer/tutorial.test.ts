import { describe, expect, it } from "vitest";
import { flattenTree } from "./tree";
import { createTutorialDocument, createTutorialRepository, createTutorialTree, localizeTutorialDocument, TUTORIAL_LABEL_LIMIT, TUTORIAL_ROOT_ID } from "./tutorial";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

describe("Mapflowy tutorial tree", () => {
  it("keeps stable IDs while localizing its instructional text", () => {
    const english = flattenTree(createTutorialTree("en")).map(({ node }) => node);
    const spanish = flattenTree(createTutorialTree("es")).map(({ node }) => node);
    expect(english.map(({ id }) => id)).toEqual(spanish.map(({ id }) => id));
    expect(english[0]).toMatchObject({ id: TUTORIAL_ROOT_ID, name: "Mapflowy" });
    expect(spanish[0]).toMatchObject({ id: TUTORIAL_ROOT_ID, name: "Mapflowy" });
    expect(english.map(({ name }) => name)).not.toEqual(spanish.map(({ name }) => name));
  });

  it("keeps every label short enough for the default graph view", () => {
    for (const language of ["en", "es"] as const) {
      expect(flattenTree(createTutorialTree(language)).every(({ node }) => node.name.length <= TUTORIAL_LABEL_LIMIT)).toBe(true);
    }
  });

  it("contains exactly the requested flat English and Spanish lessons", () => {
    expect(createTutorialTree("en").children.map(({ name }) => name)).toEqual([
      'Add nodes with "A"',
      "Right-click for copy and delete",
      "Ideas flow better with keyboard",
      "Strikethrough nodes with middle click",
      'Edit nodes with "E"',
    ]);
    expect(createTutorialTree("es").children.map(({ name }) => name)).toEqual([
      'Añade nodos con "A"',
      "Clic derecho para copiar y eliminar",
      "Las ideas fluyen mejor con el teclado",
      "Tacha nodos con clic central",
      'Edita nodos con "E"',
    ]);
  });

  it("keeps all tutorial lessons directly below Mapflowy", () => {
    for (const language of ["en", "es"] as const) {
      expect(createTutorialTree(language).children.every(({ children }) => children.length === 0)).toBe(true);
    }
  });

  it("translates untouched text while preserving custom text and structure", () => {
    const document = createTutorialDocument("en");
    const edit = flattenTree(document.root).find(({ node }) => node.id === "tutorial-edit-nodes")!.node;
    edit.name = "My editing notes";
    document.customTextIds.push(edit.id);
    document.root.children = document.root.children.filter(({ id }) => id !== "tutorial-strikethrough");
    document.root.children.push({ id: "custom", name: "Keep me", children: [] });

    const localized = localizeTutorialDocument(document, "es");
    expect(flattenTree(localized.root).find(({ node }) => node.id === "tutorial-edit-nodes")!.node.name).toBe("My editing notes");
    expect(flattenTree(localized.root).find(({ node }) => node.id === "tutorial-add-nodes")!.node.name).toBe('Añade nodos con "A"');
    expect(flattenTree(localized.root).some(({ node }) => node.id === "tutorial-strikethrough")).toBe(false);
    expect(flattenTree(localized.root).find(({ node }) => node.id === "custom")!.node.name).toBe("Keep me");
  });

  it("persists tutorial customizations in browser storage", () => {
    const storage = memoryStorage();
    const repository = createTutorialRepository({ storage: storage as unknown as Storage });
    const document = createTutorialDocument("en");
    document.root.children.push({ id: "custom", name: "Saved note", children: [] });
    document.customTextIds.push("custom");
    expect(repository.save(document)).toBe(true);
    expect(repository.load("es").root.children.at(-1)).toMatchObject({ id: "custom", name: "Saved note" });
  });
});
