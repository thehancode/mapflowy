import type { OrganizerNode } from "../../lib/organizer";
import type { OrganizerSession } from "../organizer/navigation-extension";

export function demoSession(): OrganizerSession {
  const groups = [
    ["Design", "Research", "Sketches", "Prototype", "Polish"],
    ["Build", "Interface", "Data", "Testing"],
    ["Launch", "Website", "Stories", "Feedback"],
  ];
  const root: OrganizerNode = { id: "demo", name: "Studio", children: groups.map(([name, ...children], i) => ({
    id: `branch-${i}`, name, children: children.map((name, j) => ({
      id: `task-${i}-${j}`, name, children: Array.from({ length: (i + j) % 3 + 1 }, (_, k) => ({
        id: `leaf-${i}-${j}-${k}`, name: ["Ideas", "Draft", "Review"][k], children: [],
      })),
    })),
  })) };
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() { return data.size; },
    clear: () => data.clear(), getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null, removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
  return { storage, workspace: { version: 3, activeMapId: root.id, maps: [root] } };
}
