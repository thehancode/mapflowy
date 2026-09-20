import { describe, expect, it } from "vitest";
import { createOnboardingRepository, ONBOARDING_STORAGE_KEY } from "./onboarding";
import { LEGACY_STORAGE_KEY, PREVIOUS_STORAGE_KEY, STORAGE_KEY } from "./repository";
import { TUTORIAL_STORAGE_KEY } from "./tutorial";
import { LEGACY_USER_CONFIG_STORAGE_KEY, USER_CONFIG_STORAGE_KEY } from "./user-config";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    values,
  };
}

describe("organizer onboarding", () => {
  it("recognizes a fresh profile once and records that onboarding was shown", () => {
    const storage = memoryStorage();
    const repository = createOnboardingRepository({ storage });
    expect(repository.isFirstVisit()).toBe(true);
    expect(repository.markSeen()).toBe(true);
    expect(storage.values.get(ONBOARDING_STORAGE_KEY)).toBe("1");
    expect(repository.isFirstVisit()).toBe(false);
  });

  it.each([STORAGE_KEY, PREVIOUS_STORAGE_KEY, LEGACY_STORAGE_KEY, USER_CONFIG_STORAGE_KEY, LEGACY_USER_CONFIG_STORAGE_KEY, TUTORIAL_STORAGE_KEY])("treats existing %s data as returning-user data", (key) => {
    expect(createOnboardingRepository({ storage: memoryStorage({ [key]: "saved" }) }).isFirstVisit()).toBe(false);
  });

  it("degrades to first-visit behavior when storage is unavailable", () => {
    const repository = createOnboardingRepository({ storage: null });
    expect(repository.isFirstVisit()).toBe(true);
    expect(repository.markSeen()).toBe(false);
  });
});
