import type { OrganizerNode } from "./types";
import type { OrganizerLanguage } from "./user-config";

export const TUTORIAL_ROOT_ID = "tutorial-mapflowy";
export const TUTORIAL_LABEL_LIMIT = 22;

const tutorialText = {
  en: {
    create: "Create nodes", pressN: "Press N", plus: "Use the + ring",
    edit: "Edit nodes", pressE: "Press E", actions: "Right-click actions",
    move: "Move around", arrows: "Use arrow keys", enter: "Enter opens nodes",
    views: "Change views", voronoi: "Voronoi", graph: "Graph", tree: "Tree",
  },
  es: {
    create: "Crear nodos", pressN: "Presiona N", plus: "Usa el aro +",
    edit: "Editar nodos", pressE: "Presiona E", actions: "Acciones: clic der.",
    move: "Moverse", arrows: "Usa las flechas", enter: "Enter abre nodos",
    views: "Cambiar vistas", voronoi: "Voronoi", graph: "Grafo", tree: "Árbol",
  },
} as const;

export function createTutorialTree(language: OrganizerLanguage): OrganizerNode {
  const text = tutorialText[language];
  return {
    id: TUTORIAL_ROOT_ID,
    name: "Mapflowy",
    children: [
      { id: "tutorial-create", name: text.create, children: [
        { id: "tutorial-create-n", name: text.pressN, children: [] },
        { id: "tutorial-create-plus", name: text.plus, children: [] },
      ] },
      { id: "tutorial-edit", name: text.edit, children: [
        { id: "tutorial-edit-e", name: text.pressE, children: [] },
        { id: "tutorial-edit-actions", name: text.actions, children: [] },
      ] },
      { id: "tutorial-move", name: text.move, children: [
        { id: "tutorial-move-arrows", name: text.arrows, children: [] },
        { id: "tutorial-move-enter", name: text.enter, children: [] },
      ] },
      { id: "tutorial-views", name: text.views, children: [
        { id: "tutorial-view-voronoi", name: text.voronoi, children: [] },
        { id: "tutorial-view-graph", name: text.graph, children: [] },
        { id: "tutorial-view-tree", name: text.tree, children: [] },
      ] },
    ],
  };
}
