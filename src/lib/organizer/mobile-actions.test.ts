import { describe, expect, it } from 'vitest';
import { mobileIndentActions } from './mobile-actions';
import type { OrganizerNode } from './types';

describe('mobile indent controls', () => {
  const root: OrganizerNode = { id: 'root', name: 'Root', children: [
    { id: 'a', name: 'A', children: [{ id: 'child', name: 'Child', children: [] }] },
    { id: 'b', name: 'B', children: [] },
  ] };
  it('disables root and first sibling, enables valid operations', () => {
    expect(mobileIndentActions(root, 'root')).toEqual({ indent: false, outdent: false });
    expect(mobileIndentActions(root, 'a')).toEqual({ indent: false, outdent: false });
    expect(mobileIndentActions(root, 'b')).toEqual({ indent: true, outdent: false });
    expect(mobileIndentActions(root, 'child')).toEqual({ indent: false, outdent: true });
  });
  it('disables controls while editing and for missing selections', () => {
    expect(mobileIndentActions(root, 'b', true)).toEqual({ indent: false, outdent: false });
    expect(mobileIndentActions(root, 'missing')).toEqual({ indent: false, outdent: false });
  });
  it('prevents indenting an entire subtree beyond the depth limit', () => {
    const deep = structuredClone(root);
    let node = deep.children[1];
    for (let level = 3; level <= 12; level++) {
      const child = { id: `depth-${level}`, name: 'Deep', children: [] } as OrganizerNode;
      node.children.push(child); node = child;
    }
    expect(mobileIndentActions(deep, 'b').indent).toBe(false);
  });
});
