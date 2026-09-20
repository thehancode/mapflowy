import { describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./repository";
import { browserLanguage, createUserConfigRepository, LEGACY_USER_CONFIG_STORAGE_KEY, USER_CONFIG_STORAGE_KEY } from "./user-config";

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
    const repository = createUserConfigRepository({ storage, browserLanguages: ["en-US"] });

    expect(repository.save({ version: 2, theme: "dark", language: "es" })).toBe(true);
    expect(storage.values.get(USER_CONFIG_STORAGE_KEY)).toBe('{"version":2,"theme":"dark","language":"es"}');
    expect(storage.values.get(STORAGE_KEY)).toBe(treeDocument);
  });

  it("migrates a saved theme and falls back safely for invalid config", () => {
    const saved = memoryStorage({ [USER_CONFIG_STORAGE_KEY]: '{"version":1,"theme":"dark"}' });
    expect(createUserConfigRepository({ storage: saved, browserLanguages: ["es-PE"] }).load()).toEqual({ version: 2, theme: "dark", language: "es" });

    const invalid = memoryStorage({ [USER_CONFIG_STORAGE_KEY]: "not json" });
    expect(createUserConfigRepository({ storage: invalid, browserLanguages: ["en-US"] }).load()).toEqual({ version: 2, theme: "light", language: "en" });
  });

  it("accepts any Spanish browser variant and otherwise uses English", () => {
    expect(browserLanguage(["en-US", "es-419"])).toBe("es");
    expect(browserLanguage(["es-PE"])).toBe("es");
    expect(browserLanguage(["en-US", "en"])).toBe("en");
  });

  it("prefers a saved language over the browser language", () => {
    const saved = memoryStorage({ [USER_CONFIG_STORAGE_KEY]: '{"version":2,"theme":"light","language":"en"}' });
    expect(createUserConfigRepository({ storage: saved, browserLanguages: ["es"] }).load().language).toBe("en");
  });

  it("migrates preferences saved under the former product key", () => {
    const legacy = '{"version":2,"theme":"dark","language":"es"}';
    const storage = memoryStorage({ [LEGACY_USER_CONFIG_STORAGE_KEY]: legacy });
    expect(createUserConfigRepository({ storage, browserLanguages: ["en"] }).load()).toEqual({ version: 2, theme: "dark", language: "es" });
    expect(storage.values.get(USER_CONFIG_STORAGE_KEY)).toBe(legacy);
  });
});
