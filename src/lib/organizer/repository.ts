import { normalizeNode } from './tree';
import type { OrganizerMapDocument, OrganizerNode, OrganizerWorkspaceDocument } from './types';

export const STORAGE_KEY = 'mapflowy-maps-v1';
export const PREVIOUS_STORAGE_KEY = 'mapflowy-tree-v1';
export const LEGACY_STORAGE_KEY = 'voronoi-organizer-tree-v1';
export const storageKey = STORAGE_KEY;
export function emptyWorkspace(): OrganizerWorkspaceDocument { return { version: 3, activeMapId: null, maps: [] }; }
export function serializeMap(root: OrganizerNode): OrganizerMapDocument { return { version: 1, root }; }
export const serializedMap = serializeMap;
export function normalizeMapDocument(value: unknown): OrganizerMapDocument { return { version: 1, root: parseMap(value) }; }
export const serializeDocument = serializeMap;
export function parseMap(value: unknown): OrganizerNode { const root = value && typeof value === 'object' && 'root' in value ? (value as { root: unknown }).root : value; return normalizeNode(root); }

export function serializeWorkspace(workspace: OrganizerWorkspaceDocument): OrganizerWorkspaceDocument {
  return { version: 3, activeMapId: workspace.activeMapId, maps: workspace.maps };
}

export function removeWorkspaceMap(workspace: OrganizerWorkspaceDocument, id: string): OrganizerWorkspaceDocument {
  const index = workspace.maps.findIndex((map) => map.id === id);
  if (index < 0) return workspace;
  const maps = workspace.maps.filter((map) => map.id !== id);
  const activeMapId = workspace.activeMapId === id ? maps[index]?.id ?? maps[index - 1]?.id ?? null : workspace.activeMapId;
  return { version: 3, activeMapId, maps };
}

export function normalizeWorkspace(value: unknown): OrganizerWorkspaceDocument {
  if (value && typeof value === 'object' && 'maps' in value && Array.isArray((value as { maps?: unknown }).maps)) {
    const candidate = value as { activeMapId?: unknown; maps: unknown[] };
    const ids = new Set<string>();
    const maps = candidate.maps.flatMap((map) => {
      try { return [normalizeNode(map, ids)]; } catch { return []; }
    });
    if (!maps.length) return emptyWorkspace();
    const requested = typeof candidate.activeMapId === 'string' ? candidate.activeMapId : '';
    return { version: 3, activeMapId: maps.some(({ id }) => id === requested) ? requested : maps[0].id, maps };
  }
  if (value && typeof value === 'object' && 'trees' in value && Array.isArray((value as { trees?: unknown }).trees)) {
    const candidate = value as { activeTreeId?: unknown; trees: unknown[] };
    const ids = new Set<string>();
    const maps = candidate.trees.flatMap((tree) => {
      try { return [normalizeNode(tree, ids)]; } catch { return []; }
    });
    if (!maps.length) return emptyWorkspace();
    const requested = typeof candidate.activeTreeId === 'string' ? candidate.activeTreeId : '';
    return { version: 3, activeMapId: maps.some(({ id }) => id === requested) ? requested : maps[0].id, maps };
  }
  const root = parseMap(value);
  return { version: 3, activeMapId: root.id, maps: [root] };
}

export interface OrganizerRepositoryOptions { storage?: Storage | null; }
export interface OrganizerRepository {
  load(): Promise<OrganizerWorkspaceDocument>;
  save(workspace: OrganizerWorkspaceDocument): boolean;
  exportMapJson(root: OrganizerNode): string;
}

export function createRepository(options: OrganizerRepositoryOptions = {}): OrganizerRepository {
  const storage = options.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : options.storage;
  return {
    async load(): Promise<OrganizerWorkspaceDocument> {
      try {
        const stored = storage?.getItem(STORAGE_KEY);
        if (stored) return normalizeWorkspace(JSON.parse(stored));
        const previous = storage?.getItem(PREVIOUS_STORAGE_KEY);
        if (previous) {
          const workspace = normalizeWorkspace(JSON.parse(previous));
          storage?.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace(workspace)));
          return workspace;
        }
        const legacy = storage?.getItem(LEGACY_STORAGE_KEY);
        if (legacy) {
          const workspace = normalizeWorkspace(JSON.parse(legacy));
          storage?.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace(workspace)));
          return workspace;
        }
      } catch { /* fall through to an empty workspace */ }
      return emptyWorkspace();
    },
    save(workspace: OrganizerWorkspaceDocument): boolean {
      if (!storage) return false;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace(workspace))); return true; } catch { return false; }
    },
    exportMapJson(root: OrganizerNode): string { return `${JSON.stringify(serializeMap(root), null, 2)}\n`; },
  };
}
export const loadWorkspace = (options?: OrganizerRepositoryOptions) => createRepository(options).load();
export const loadMap = async (options?: OrganizerRepositoryOptions): Promise<OrganizerNode | null> => { const workspace = await loadWorkspace(options); return workspace.maps.find(({ id }) => id === workspace.activeMapId) ?? workspace.maps[0] ?? null; };
export const persistMap = (root: OrganizerNode, options?: OrganizerRepositoryOptions) => createRepository(options).save({ version: 3, activeMapId: root.id, maps: [root] });
export const exportMap = (root: OrganizerNode) => createRepository().exportMapJson(root);
