import { LEGACY_STORAGE_KEY, PREVIOUS_STORAGE_KEY, STORAGE_KEY } from "./repository";
import { TUTORIAL_STORAGE_KEY } from "./tutorial";
import { LEGACY_USER_CONFIG_STORAGE_KEY, USER_CONFIG_STORAGE_KEY } from "./user-config";

export const ONBOARDING_STORAGE_KEY = "mapflowy-onboarding-v1";

type OnboardingStorage = Pick<Storage, "getItem" | "setItem">;

export interface OnboardingRepositoryOptions { storage?: OnboardingStorage | null; }

export interface OnboardingRepository {
  isFirstVisit(): boolean;
  markSeen(): boolean;
}

const returningUserKeys = [
  STORAGE_KEY,
  PREVIOUS_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  USER_CONFIG_STORAGE_KEY,
  LEGACY_USER_CONFIG_STORAGE_KEY,
  TUTORIAL_STORAGE_KEY,
] as const;

export function createOnboardingRepository(options: OnboardingRepositoryOptions = {}): OnboardingRepository {
  const storage = options.storage === undefined ? (typeof localStorage !== "undefined" ? localStorage : null) : options.storage;
  return {
    isFirstVisit() {
      if (!storage) return true;
      try {
        if (storage.getItem(ONBOARDING_STORAGE_KEY)) return false;
        return !returningUserKeys.some((key) => storage.getItem(key) !== null);
      } catch { return true; }
    },
    markSeen() {
      if (!storage) return false;
      try { storage.setItem(ONBOARDING_STORAGE_KEY, "1"); return true; } catch { return false; }
    },
  };
}
