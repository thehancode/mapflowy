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

  it("orders the main lessons by navigation, editing, node creation, and map creation", () => {
    expect(createTutorialTree("en").children.map(({ name }) => name)).toEqual(["Move around", "Edit nodes", "Create nodes", "Create map"]);
  });

  it("includes the click instructions for creating and editing nodes", () => {
    const tutorial = createTutorialTree("en");
    expect(tutorial.children.find(({ id }) => id === "tutorial-create")?.children.map(({ name }) => name)).toEqual(["Press N", "Click the ring", "Click the +"]);
    expect(tutorial.children.find(({ id }) => id === "tutorial-edit")?.children.map(({ name }) => name)).toEqual(["Press E", "Click the text", "Right-click actions"]);
    expect(tutorial.children.find(({ id }) => id === "tutorial-create-map")?.children.map(({ name }) => name)).toEqual(["Click the menu", "+ New map"]);
  });

  it("translates untouched text while preserving custom text and structure", () => {
    const document = createTutorialDocument("en");
    const edit = flattenTree(document.root).find(({ node }) => node.id === "tutorial-edit")!.node;
    edit.name = "My editing notes";
    document.customTextIds.push(edit.id);
    document.root.children = document.root.children.filter(({ id }) => id !== "tutorial-move");
    document.root.children.push({ id: "custom", name: "Keep me", children: [] });

    const localized = localizeTutorialDocument(document, "es");
    expect(flattenTree(localized.root).find(({ node }) => node.id === "tutorial-edit")!.node.name).toBe("My editing notes");
    expect(flattenTree(localized.root).find(({ node }) => node.id === "tutorial-create")!.node.name).toBe("Crear nodos");
    expect(flattenTree(localized.root).some(({ node }) => node.id === "tutorial-move")).toBe(false);
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
