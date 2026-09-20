import { canPlaceSubtreeAtDepth, findEntry } from './tree';
import type { OrganizerNode } from './types';

export function mobileIndentActions(root: OrganizerNode, id: string, editing = false) {
  const entry = findEntry(root, id);
  return {
    indent: !editing && !!entry?.parent && entry.index > 0 && canPlaceSubtreeAtDepth(entry.node, entry.depth + 1),
    outdent: !editing && !!entry?.parent && !!findEntry(root, entry.parent.id)?.parent,
  };
}
