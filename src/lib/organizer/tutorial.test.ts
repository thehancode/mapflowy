import { describe, expect, it } from "vitest";
import { flattenTree } from "./tree";
import { createTutorialTree, TUTORIAL_LABEL_LIMIT, TUTORIAL_ROOT_ID } from "./tutorial";

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

  it("orders the main lessons by navigation, editing, creation, and views", () => {
    expect(createTutorialTree("en").children.map(({ name }) => name)).toEqual(["Move around", "Edit nodes", "Create nodes", "Change views"]);
  });

  it("includes the click instructions for creating and editing nodes", () => {
    const tutorial = createTutorialTree("en");
    expect(tutorial.children.find(({ id }) => id === "tutorial-create")?.children.map(({ name }) => name)).toEqual(["Press N", "Click the ring", "Click the +"]);
    expect(tutorial.children.find(({ id }) => id === "tutorial-edit")?.children.map(({ name }) => name)).toEqual(["Press E", "Click the text", "Right-click actions"]);
  });
});
