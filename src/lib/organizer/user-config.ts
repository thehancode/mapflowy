export type OrganizerTheme = "light" | "dark";

export interface OrganizerUserConfig {
  version: 1;
  theme: OrganizerTheme;
}

type ConfigStorage = Pick<Storage, "getItem" | "setItem">;

export const USER_CONFIG_STORAGE_KEY = "voronoi-organizer-user-config-v1";

export interface UserConfigRepositoryOptions {
  storage?: ConfigStorage | null;
}

export interface UserConfigRepository {
  load(): OrganizerUserConfig;
  save(config: OrganizerUserConfig): boolean;
}

export function normalizeUserConfig(value: unknown): OrganizerUserConfig {
  if (!value || typeof value !== "object") return { version: 1, theme: "light" };
  const candidate = value as Partial<OrganizerUserConfig>;
  return { version: 1, theme: candidate.theme === "dark" ? "dark" : "light" };
}

export function createUserConfigRepository(options: UserConfigRepositoryOptions = {}): UserConfigRepository {
  const storage = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  return {
    load(): OrganizerUserConfig {
      try {
        const stored = storage?.getItem(USER_CONFIG_STORAGE_KEY);
        return stored ? normalizeUserConfig(JSON.parse(stored)) : normalizeUserConfig(null);
      } catch {
        return normalizeUserConfig(null);
      }
    },
    save(config: OrganizerUserConfig): boolean {
      try {
        storage?.setItem(USER_CONFIG_STORAGE_KEY, JSON.stringify(normalizeUserConfig(config)));
        return true;
      } catch {
        return false;
      }
    },
  };
}
