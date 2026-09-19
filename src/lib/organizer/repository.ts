import { normalizeNode } from './tree';
import type { OrganizerDocument, OrganizerNode } from './types';

export const STORAGE_KEY = 'voronoi-organizer-tree-v1';
export const storageKey = STORAGE_KEY;
export function serializeTree(root: OrganizerNode): OrganizerDocument { return { version: 1, root }; }
export const serializedTree = serializeTree;
export function normalizeDocument(value: unknown): OrganizerDocument { return { version: 1, root: parseTree(value) }; }
export const serializeDocument = serializeTree;
export function parseTree(value: unknown): OrganizerNode { const root = value && typeof value === 'object' && 'root' in value ? (value as { root: unknown }).root : value; return normalizeNode(root); }

export interface OrganizerRepositoryOptions { storage?: Storage | null; fetcher?: typeof fetch; sampleUrl?: string; fallback?: OrganizerNode; }
export interface OrganizerRepository {
  load(): Promise<OrganizerNode>;
  save(root: OrganizerNode): boolean;
  exportJson(root: OrganizerNode): string;
}

export function createRepository(options: OrganizerRepositoryOptions = {}): OrganizerRepository {
  const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const fetcher = options.fetcher ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  const fallback = options.fallback ?? { id: 'node-1', name: 'Projects', children: [] };
  return {
    async load(): Promise<OrganizerNode> {
      try { const stored = storage?.getItem(STORAGE_KEY); if (stored) return parseTree(JSON.parse(stored)); } catch { /* fall through to sample */ }
      try { if (!fetcher) throw new Error('fetch unavailable'); const response = await fetcher(options.sampleUrl ?? 'organizer.json', { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return parseTree(await response.json()); } catch { return normalizeNode(fallback); }
    },
    save(root: OrganizerNode): boolean { try { storage?.setItem(STORAGE_KEY, JSON.stringify(serializeTree(root))); return true; } catch { return false; } },
    exportJson(root: OrganizerNode): string { return `${JSON.stringify(serializeTree(root), null, 2)}\n`; },
  };
}
export const loadTree = (options?: OrganizerRepositoryOptions) => createRepository(options).load();
export const persistTree = (root: OrganizerNode, options?: OrganizerRepositoryOptions) => createRepository(options).save(root);
export const exportTree = (root: OrganizerNode) => createRepository().exportJson(root);
