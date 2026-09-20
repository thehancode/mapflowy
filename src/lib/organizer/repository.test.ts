import { describe, expect, it } from "vitest";
import { createRepository, LEGACY_STORAGE_KEY, normalizeWorkspace, STORAGE_KEY } from "./repository";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    values,
  };
}

describe("organizer workspace repository", () => {
  it("migrates a version-one tree into a workspace", () => {
    const workspace = normalizeWorkspace({ version: 1, root: { id: "root", name: "Projects", children: [] } });
    expect(workspace).toEqual({ version: 2, activeTreeId: "root", trees: [{ id: "root", name: "Projects", children: [] }] });
  });

  it("round-trips multiple trees and the active tree", async () => {
    const storage = memoryStorage();
    const repository = createRepository({ storage: storage as unknown as Storage, fetcher: undefined });
    const workspace = { version: 2 as const, activeTreeId: "second", trees: [
      { id: "first", name: "First", children: [] },
      { id: "second", name: "Second", children: [] },
    ] };
    expect(repository.save(workspace)).toBe(true);
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toEqual(workspace);
    expect(await repository.load()).toEqual(workspace);
  });

  it("repairs a missing active tree selection", () => {
    const workspace = normalizeWorkspace({ version: 2, activeTreeId: "missing", trees: [{ id: "first", name: "First", children: [] }] });
    expect(workspace.activeTreeId).toBe("first");
  });

  it("migrates workspaces saved under the former product key", async () => {
    const legacy = JSON.stringify({ version: 2, activeTreeId: "root", trees: [{ id: "root", name: "Saved", children: [] }] });
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: legacy });
    const repository = createRepository({ storage: storage as unknown as Storage, fetcher: undefined });
    expect((await repository.load()).trees[0].name).toBe("Saved");
    expect(storage.values.get(STORAGE_KEY)).toBe(legacy);
  });

  it("reports when browser storage is unavailable", () => {
    const repository = createRepository({ storage: null, fetcher: undefined });
    expect(repository.save({ version: 2, activeTreeId: "root", trees: [{ id: "root", name: "Projects", children: [] }] })).toBe(false);
  });

  it("reports when browser storage rejects a save", () => {
    const storage = { getItem: () => null, setItem: () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); } };
    const repository = createRepository({ storage: storage as unknown as Storage, fetcher: undefined });
    expect(repository.save({ version: 2, activeTreeId: "root", trees: [{ id: "root", name: "Projects", children: [] }] })).toBe(false);
  });
});
