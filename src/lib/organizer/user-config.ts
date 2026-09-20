export type OrganizerTheme = "light" | "dark";
export type OrganizerLanguage = "en" | "es";

export interface OrganizerUserConfig {
  version: 2;
  theme: OrganizerTheme;
  language: OrganizerLanguage;
}

type ConfigStorage = Pick<Storage, "getItem" | "setItem">;

export const USER_CONFIG_STORAGE_KEY = "mapflowy-user-config-v1";
export const LEGACY_USER_CONFIG_STORAGE_KEY = "voronoi-organizer-user-config-v1";

export interface UserConfigRepositoryOptions {
  storage?: ConfigStorage | null;
  browserLanguages?: readonly string[];
}

export interface UserConfigRepository {
  load(): OrganizerUserConfig;
  save(config: OrganizerUserConfig): boolean;
}

export function browserLanguage(languages: readonly string[] = []): OrganizerLanguage {
  return languages.some((language) => language.toLowerCase().split("-")[0] === "es") ? "es" : "en";
}

export function normalizeUserConfig(value: unknown, fallbackLanguage: OrganizerLanguage = "en"): OrganizerUserConfig {
  const candidate = value && typeof value === "object" ? value as { theme?: unknown; language?: unknown } : {};
  return {
    version: 2,
    theme: candidate.theme === "dark" ? "dark" : "light",
    language: candidate.language === "es" || candidate.language === "en" ? candidate.language : fallbackLanguage,
  };
}

export function createUserConfigRepository(options: UserConfigRepositoryOptions = {}): UserConfigRepository {
  const storage = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  const detectedLanguage = browserLanguage(options.browserLanguages ?? (typeof navigator !== "undefined" ? navigator.languages : []));
  return {
    load(): OrganizerUserConfig {
      try {
        const stored = storage?.getItem(USER_CONFIG_STORAGE_KEY);
        if (stored) return normalizeUserConfig(JSON.parse(stored), detectedLanguage);
        const legacy = storage?.getItem(LEGACY_USER_CONFIG_STORAGE_KEY);
        if (legacy) { storage?.setItem(USER_CONFIG_STORAGE_KEY, legacy); return normalizeUserConfig(JSON.parse(legacy), detectedLanguage); }
        return normalizeUserConfig(null, detectedLanguage);
      } catch {
        return normalizeUserConfig(null, detectedLanguage);
      }
    },
    save(config: OrganizerUserConfig): boolean {
      try {
        storage?.setItem(USER_CONFIG_STORAGE_KEY, JSON.stringify(normalizeUserConfig(config, detectedLanguage)));
        return true;
      } catch {
        return false;
      }
    },
  };
}
