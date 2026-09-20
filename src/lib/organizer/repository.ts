import { normalizeNode } from './tree';
import type { OrganizerDocument, OrganizerNode, OrganizerWorkspaceDocument } from './types';

export const STORAGE_KEY = 'mapflowy-tree-v1';
export const LEGACY_STORAGE_KEY = 'voronoi-organizer-tree-v1';
export const storageKey = STORAGE_KEY;
export function serializeTree(root: OrganizerNode): OrganizerDocument { return { version: 1, root }; }
export const serializedTree = serializeTree;
export function normalizeDocument(value: unknown): OrganizerDocument { return { version: 1, root: parseTree(value) }; }
export const serializeDocument = serializeTree;
export function parseTree(value: unknown): OrganizerNode { const root = value && typeof value === 'object' && 'root' in value ? (value as { root: unknown }).root : value; return normalizeNode(root); }

export function serializeWorkspace(workspace: OrganizerWorkspaceDocument): OrganizerWorkspaceDocument {
  return { version: 2, activeTreeId: workspace.activeTreeId, trees: workspace.trees };
}

export function normalizeWorkspace(value: unknown): OrganizerWorkspaceDocument {
  if (value && typeof value === 'object' && 'trees' in value && Array.isArray((value as { trees?: unknown }).trees)) {
    const candidate = value as { activeTreeId?: unknown; trees: unknown[] };
    const ids = new Set<string>();
    const trees = candidate.trees.flatMap((tree) => {
      try { return [normalizeNode(tree, ids)]; } catch { return []; }
    });
    if (trees.length) {
      const requested = typeof candidate.activeTreeId === 'string' ? candidate.activeTreeId : '';
      return { version: 2, activeTreeId: trees.some(({ id }) => id === requested) ? requested : trees[0].id, trees };
    }
  }
  const root = parseTree(value);
  return { version: 2, activeTreeId: root.id, trees: [root] };
}

export interface OrganizerRepositoryOptions { storage?: Storage | null; fetcher?: typeof fetch; sampleUrl?: string; fallback?: OrganizerNode; }
export interface OrganizerRepository {
  load(): Promise<OrganizerWorkspaceDocument>;
  save(workspace: OrganizerWorkspaceDocument): boolean;
  exportJson(root: OrganizerNode): string;
}

export function createRepository(options: OrganizerRepositoryOptions = {}): OrganizerRepository {
  const storage = options.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : options.storage;
  const fetcher = options.fetcher ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  const fallback = options.fallback ?? { id: 'node-1', name: 'Projects', children: [] };
  return {
    async load(): Promise<OrganizerWorkspaceDocument> {
      try {
        const stored = storage?.getItem(STORAGE_KEY);
        if (stored) return normalizeWorkspace(JSON.parse(stored));
        const legacy = storage?.getItem(LEGACY_STORAGE_KEY);
        if (legacy) { storage?.setItem(STORAGE_KEY, legacy); return normalizeWorkspace(JSON.parse(legacy)); }
      } catch { /* fall through to sample */ }
      try { if (!fetcher) throw new Error('fetch unavailable'); const response = await fetcher(options.sampleUrl ?? 'organizer.json', { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return normalizeWorkspace(await response.json()); } catch { return normalizeWorkspace(fallback); }
    },
    save(workspace: OrganizerWorkspaceDocument): boolean {
      if (!storage) return false;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(serializeWorkspace(workspace))); return true; } catch { return false; }
    },
    exportJson(root: OrganizerNode): string { return `${JSON.stringify(serializeTree(root), null, 2)}\n`; },
  };
}
export const loadWorkspace = (options?: OrganizerRepositoryOptions) => createRepository(options).load();
export const loadTree = async (options?: OrganizerRepositoryOptions) => { const workspace = await loadWorkspace(options); return workspace.trees.find(({ id }) => id === workspace.activeTreeId) ?? workspace.trees[0]; };
export const persistTree = (root: OrganizerNode, options?: OrganizerRepositoryOptions) => createRepository(options).save({ version: 2, activeTreeId: root.id, trees: [root] });
export const exportTree = (root: OrganizerNode) => createRepository().exportJson(root);
