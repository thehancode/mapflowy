import { describe, expect, it } from "vitest";
import { createRepository, LEGACY_STORAGE_KEY, normalizeWorkspace, PREVIOUS_STORAGE_KEY, STORAGE_KEY } from "./repository";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    values,
  };
}

describe("organizer workspace repository", () => {
  it("migrates a version-one map into a workspace", () => {
    const workspace = normalizeWorkspace({ version: 1, root: { id: "root", name: "Projects", children: [] } });
    expect(workspace).toEqual({ version: 3, activeMapId: "root", maps: [{ id: "root", name: "Projects", children: [] }] });
  });

  it("round-trips multiple maps and the active map", async () => {
    const storage = memoryStorage();
    const repository = createRepository({ storage: storage as unknown as Storage, fetcher: undefined });
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
    const repository = createRepository({ storage: storage as unknown as Storage, fetcher: undefined });
    expect((await repository.load()).maps[0].name).toBe("Saved");
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toMatchObject({ version: 3, activeMapId: "root" });
    expect(storage.values.get(PREVIOUS_STORAGE_KEY)).toBe(legacy);
  });

  it("migrates workspaces saved under the former product key", async () => {
    const legacy = JSON.stringify({ version: 2, activeTreeId: "root", trees: [{ id: "root", name: "Legacy", children: [] }] });
    const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: legacy });
    const repository = createRepository({ storage: storage as unknown as Storage, fetcher: undefined });
    expect((await repository.load()).maps[0].name).toBe("Legacy");
    expect(JSON.parse(storage.values.get(STORAGE_KEY)!)).toMatchObject({ version: 3, activeMapId: "root" });
    expect(storage.values.get(LEGACY_STORAGE_KEY)).toBe(legacy);
  });

  it("reports when browser storage is unavailable", () => {
    const repository = createRepository({ storage: null, fetcher: undefined });
    expect(repository.save({ version: 3, activeMapId: "root", maps: [{ id: "root", name: "Projects", children: [] }] })).toBe(false);
  });

  it("reports when browser storage rejects a save", () => {
    const storage = { getItem: () => null, setItem: () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); } };
    const repository = createRepository({ storage: storage as unknown as Storage, fetcher: undefined });
    expect(repository.save({ version: 3, activeMapId: "root", maps: [{ id: "root", name: "Projects", children: [] }] })).toBe(false);
  });
});
