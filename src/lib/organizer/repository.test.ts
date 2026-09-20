import { describe, expect, it } from "vitest";
import { createRepository, emptyWorkspace, LEGACY_STORAGE_KEY, loadMap, normalizeWorkspace, PREVIOUS_STORAGE_KEY, parseMap, removeWorkspaceMap, STORAGE_KEY } from "./repository";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    values,
  };
}

describe("organizer workspace repository", () => {
  it("saves marks and assigned colors across reload and JSON export/import", async () => {
    const storage = memoryStorage();
    const repository = createRepository({ storage: storage as unknown as Storage });
    const workspace = normalizeWorkspace({ name: "Parent", marked: true, colorIndex: 2, children: [{ name: "Child", marked: true, colorIndex: 6 }] });
    expect(repository.save(workspace)).toBe(true);
    const reloaded = await createRepository({ storage: storage as unknown as Storage }).load();
    expect(reloaded).toEqual(workspace);
    expect(parseMap(JSON.parse(repository.exportMapJson(reloaded.maps[0])))).toEqual(workspace.maps[0]);
    delete reloaded.maps[0].marked;
    expect(repository.save(reloaded)).toBe(true);
    expect((await repository.load()).maps[0].marked).toBeFalsy();
    expect((await repository.load()).maps[0].children[0].marked).toBe(true);
    expect((await repository.load()).maps[0].colorIndex).toBe(2);
    expect((await repository.load()).maps[0].children[0].colorIndex).toBe(6);
  });

  it("migrates a version-one map into a workspace", () => {
    const workspace = normalizeWorkspace({ version: 1, root: { id: "root", name: "Projects", children: [] } });
    expect(workspace).toEqual({ version: 3, activeMapId: "root", maps: [{ id: "root", name: "Projects", children: [] }] });
  });

  it("round-trips multiple maps and the active map", async () => {
    const storage = memoryStorage();
    const repository = createRepository({ storage: storage as unknown as Storage });
    const workspace = { version: 3 as const, activeMapId: "second", maps: [
      { id: "first", name: "First", children: [] },
      { id: "second", name: "Second", children: [] },
    ] };
    expect(repository.save(workspace)).toBe(true);
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual(workspace);
    expect(await repository.load()).toEqual(workspace);
  });

  it("repairs a missing active map selection", () => {
    const workspace = normalizeWorkspace({ version: 3, activeMapId: "missing", maps: [{ id: "first", name: "First", children: [] }] });
    expect(workspace.activeMapId).toBe("first");
  });

  it("migrates workspaces saved under the previous mapflowy key", async () => {
    const legacy = JSON.stringify({ version: 2, activeTreeId: "root", trees: [{ id: "root", name: "Saved", children: [] }] });
    const storage = memoryStorage({ [PREVIOUS_STORAGE_KEY]: legacy });
    const repository = createRepository({ storage: storage as unknown as Storage });
    expect((await repository.load()).maps[0].name).toBe("Saved");
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toMatchObject({ version: 3, activeMapId: "root" });
    expect(storage.values.get(PREVIOUS_STORAGE_KEY)).toBe(legacy);
  });

  it("migrates workspaces saved under the former product key", async () => {
    const legacy = JSON.stringify({ version: 2, activeTreeId: "root", trees: [{ id: "root", name: "Legacy", children: [] }] });
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: legacy });
    const repository = createRepository({ storage: storage as unknown as Storage });
    expect((await repository.load()).maps[0].name).toBe("Legacy");
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toMatchObject({ version: 3, activeMapId: "root" });
    expect(storage.values.get(LEGACY_STORAGE_KEY)).toBe(legacy);
  });

  it("reports when browser storage is unavailable", () => {
    const repository = createRepository({ storage: null });
    expect(repository.save({ version: 3, activeMapId: "root", maps: [{ id: "root", name: "Projects", children: [] }] })).toBe(false);
  });

  it("reports when browser storage rejects a save", () => {
    const storage = { getItem: () => null, setItem: () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); } };
    const repository = createRepository({ storage: storage as unknown as Storage });
    expect(repository.save({ version: 3, activeMapId: "root", maps: [{ id: "root", name: "Projects", children: [] }] })).toBe(false);
  });

  it("starts without a default map and supports an empty saved workspace", async () => {
    const storage = memoryStorage();
    const repository = createRepository({ storage: storage as unknown as Storage });
    expect(await repository.load()).toEqual(emptyWorkspace());
    expect(normalizeWorkspace({ version: 3, activeMapId: null, maps: [] })).toEqual(emptyWorkspace());
    expect(repository.save(emptyWorkspace())).toBe(true);
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual(emptyWorkspace());
  });

  it("returns null when loading a map from an empty workspace", async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(emptyWorkspace()) });
    expect(await loadMap({ storage: storage as unknown as Storage })).toBeNull();
  });

  it("deletes maps while keeping a valid active-map selection", () => {
    const workspace = { version: 3 as const, activeMapId: "second", maps: [
      { id: "first", name: "First", children: [] },
      { id: "second", name: "Second", children: [] },
      { id: "third", name: "Third", children: [] },
    ] };
    expect(removeWorkspaceMap(workspace, "first")).toMatchObject({ activeMapId: "second", maps: [{ id: "second" }, { id: "third" }] });
    expect(removeWorkspaceMap(workspace, "second")).toMatchObject({ activeMapId: "third", maps: [{ id: "first" }, { id: "third" }] });
    expect(removeWorkspaceMap(removeWorkspaceMap(removeWorkspaceMap(workspace, "third"), "second"), "first")).toEqual(emptyWorkspace());
    expect(removeWorkspaceMap(workspace, "missing")).toBe(workspace);
  });
});
