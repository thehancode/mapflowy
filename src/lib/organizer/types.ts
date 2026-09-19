export interface OrganizerNode {
  id: string;
  name: string;
  children: OrganizerNode[];
}

export interface OrganizerDocument {
  version: 1;
  root: OrganizerNode;
}

export interface TreeEntry {
  node: OrganizerNode;
  parent: OrganizerNode | null;
  depth: number;
  path: OrganizerNode[];
  index: number;
}

export interface Point { x: number; y: number }
export type Polygon = Point[];

export interface LayoutEntry extends TreeEntry, Point {
  angle: number;
  radius: number;
}

export interface RadialTreeLayout {
  nodes: LayoutEntry[];
  links: Array<{ source: LayoutEntry; target: LayoutEntry }>;
  centerX: number;
  centerY: number;
  outerRadiusX: number;
  outerRadiusY: number;
}
