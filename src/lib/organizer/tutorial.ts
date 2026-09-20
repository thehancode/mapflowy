import { flattenTree, normalizeNode } from "./tree";
import type { OrganizerNode } from "./types";
import type { OrganizerLanguage } from "./user-config";

export const TUTORIAL_ROOT_ID = "tutorial-mapflowy";
export const TUTORIAL_LABEL_LIMIT = 64;
export const TUTORIAL_STORAGE_KEY = "mapflowy-tutorial-v1";

export interface TutorialDocument {
  version: 3;
  language: OrganizerLanguage;
  root: OrganizerNode;
  customTextIds: string[];
}

const tutorialText = {
  en: {
    addNodes: 'Add nodes with "A"',
    copyDelete: "Right-click for copy and delete",
    keyboard: "Ideas flow better with keyboard",
    strikethrough: "Strikethrough with middle click or space space",
    editNodes: 'Edit nodes with "E"',
  },
  es: {
    addNodes: 'Añade nodos con "A"',
    copyDelete: "Clic derecho para copiar y eliminar",
    keyboard: "Las ideas fluyen mejor con el teclado",
    strikethrough: "Tacha con clic central o doble espacio",
    editNodes: 'Edita nodos con "E"',
  },
} as const;

export function createTutorialTree(language: OrganizerLanguage): OrganizerNode {
  const text = tutorialText[language];
  return {
    id: TUTORIAL_ROOT_ID,
    name: "Mapflowy",
    children: [
      { id: "tutorial-add-nodes", name: text.addNodes, children: [] },
      { id: "tutorial-copy-delete", name: text.copyDelete, children: [] },
      { id: "tutorial-keyboard", name: text.keyboard, children: [] },
      { id: "tutorial-strikethrough", name: text.strikethrough, children: [] },
      { id: "tutorial-edit-nodes", name: text.editNodes, children: [] },
    ],
  };
}

export function createTutorialDocument(language: OrganizerLanguage): TutorialDocument {
  return { version: 3, language, root: createTutorialTree(language), customTextIds: [] };
}

export function localizeTutorialDocument(document: TutorialDocument, language: OrganizerLanguage): TutorialDocument {
  const translatedNames = new Map(flattenTree(createTutorialTree(language)).map(({ node }) => [node.id, node.name]));
  const customTextIds = new Set(document.customTextIds);
  for (const { node } of flattenTree(document.root)) {
    const translated = translatedNames.get(node.id);
    if (translated !== undefined && !customTextIds.has(node.id)) node.name = translated;
  }
  return { ...document, language };
}

export interface TutorialRepositoryOptions { storage?: Storage | null; }
export interface TutorialRepository {
  load(language: OrganizerLanguage): TutorialDocument;
  save(document: TutorialDocument): boolean;
}

function normalizeTutorialDocument(value: unknown, language: OrganizerLanguage): TutorialDocument {
  if (!value || typeof value !== "object" || !("root" in value)) return createTutorialDocument(language);
  const candidate = value as { version?: unknown; language?: unknown; root: unknown; customTextIds?: unknown };
  if (candidate.version !== 3) return createTutorialDocument(language);
  const storedLanguage: OrganizerLanguage = candidate.language === "es" ? "es" : "en";
  const root = normalizeNode(candidate.root);
  const nodeIds = new Set(flattenTree(root).map(({ node }) => node.id));
  const customTextIds = Array.isArray(candidate.customTextIds)
    ? candidate.customTextIds.filter((id): id is string => typeof id === "string" && nodeIds.has(id))
    : [];
  return localizeTutorialDocument({ version: 3, language: storedLanguage, root, customTextIds }, language);
}

export function createTutorialRepository(options: TutorialRepositoryOptions = {}): TutorialRepository {
  const storage = options.storage === undefined ? (typeof localStorage !== "undefined" ? localStorage : null) : options.storage;
  return {
    load(language) {
      try {
        const stored = storage?.getItem(TUTORIAL_STORAGE_KEY);
        return stored ? normalizeTutorialDocument(JSON.parse(stored), language) : createTutorialDocument(language);
      } catch { return createTutorialDocument(language); }
    },
    save(document) {
      if (!storage) return false;
      try { storage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(document)); return true; } catch { return false; }
    },
  };
}
