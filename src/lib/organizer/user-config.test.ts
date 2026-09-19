import { describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./repository";
import { createUserConfigRepository, USER_CONFIG_STORAGE_KEY } from "./user-config";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    values,
  };
}

describe("organizer user config", () => {
  it("stores the theme separately from the tree document", () => {
    const treeDocument = '{"version":1,"root":{"id":"root","name":"Projects","children":[]}}';
    const storage = memoryStorage({ [STORAGE_KEY]: treeDocument });
    const repository = createUserConfigRepository({ storage });

    expect(repository.save({ version: 1, theme: "dark" })).toBe(true);
    expect(storage.values.get(USER_CONFIG_STORAGE_KEY)).toBe('{"version":1,"theme":"dark"}');
    expect(storage.values.get(STORAGE_KEY)).toBe(treeDocument);
  });

  it("loads a saved theme and falls back safely for invalid config", () => {
    const saved = memoryStorage({ [USER_CONFIG_STORAGE_KEY]: '{"version":1,"theme":"dark"}' });
    expect(createUserConfigRepository({ storage: saved }).load().theme).toBe("dark");

    const invalid = memoryStorage({ [USER_CONFIG_STORAGE_KEY]: "not json" });
    expect(createUserConfigRepository({ storage: invalid }).load().theme).toBe("light");
  });
});
