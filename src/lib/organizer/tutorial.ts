import { flattenTree, normalizeNode } from "./tree";
import type { OrganizerNode } from "./types";
import type { OrganizerLanguage } from "./user-config";

export const TUTORIAL_ROOT_ID = "tutorial-mapflowy";
export const TUTORIAL_LABEL_LIMIT = 22;
export const TUTORIAL_STORAGE_KEY = "mapflowy-tutorial-v1";

export interface TutorialDocument {
  version: 1;
  language: OrganizerLanguage;
  root: OrganizerNode;
  customTextIds: string[];
}

const tutorialText = {
  en: {
    create: "Create nodes", pressN: "Press N", ring: "Click the ring", plus: "Click the +",
    edit: "Edit nodes", pressE: "Press E", text: "Click the text", actions: "Right-click actions",
    move: "Move around", arrows: "Use arrow keys", enter: "Enter opens nodes",
    createMap: "Create map", menu: "Click the menu", newMap: "+ New map",
  },
  es: {
    create: "Crear nodos", pressN: "Presiona N", ring: "Haz clic en el aro", plus: "Haz clic en +",
    edit: "Editar nodos", pressE: "Presiona E", text: "Haz clic en el texto", actions: "Acciones: clic der.",
    move: "Moverse", arrows: "Usa las flechas", enter: "Enter abre nodos",
    createMap: "Crear mapa", menu: "Click en el menú", newMap: "+ Nuevo mapa",
  },
} as const;

export function createTutorialTree(language: OrganizerLanguage): OrganizerNode {
  const text = tutorialText[language];
  return {
    id: TUTORIAL_ROOT_ID,
    name: "Mapflowy",
    children: [
      { id: "tutorial-move", name: text.move, children: [
        { id: "tutorial-move-arrows", name: text.arrows, children: [] },
        { id: "tutorial-move-enter", name: text.enter, children: [] },
      ] },
      { id: "tutorial-edit", name: text.edit, children: [
        { id: "tutorial-edit-e", name: text.pressE, children: [] },
        { id: "tutorial-edit-text", name: text.text, children: [] },
        { id: "tutorial-edit-actions", name: text.actions, children: [] },
      ] },
      { id: "tutorial-create", name: text.create, children: [
        { id: "tutorial-create-n", name: text.pressN, children: [] },
        { id: "tutorial-create-ring", name: text.ring, children: [] },
        { id: "tutorial-create-plus", name: text.plus, children: [] },
      ] },
      { id: "tutorial-create-map", name: text.createMap, children: [
        { id: "tutorial-map-menu", name: text.menu, children: [] },
        { id: "tutorial-map-new", name: text.newMap, children: [] },
      ] },
    ],
  };
}

export function createTutorialDocument(language: OrganizerLanguage): TutorialDocument {
  return { version: 1, language, root: createTutorialTree(language), customTextIds: [] };
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
  const candidate = value as { language?: unknown; root: unknown; customTextIds?: unknown };
  const storedLanguage: OrganizerLanguage = candidate.language === "es" ? "es" : "en";
  const root = normalizeNode(candidate.root);
  const nodeIds = new Set(flattenTree(root).map(({ node }) => node.id));
  const customTextIds = Array.isArray(candidate.customTextIds)
    ? candidate.customTextIds.filter((id): id is string => typeof id === "string" && nodeIds.has(id))
    : [];
  return localizeTutorialDocument({ version: 1, language: storedLanguage, root, customTextIds }, language);
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
