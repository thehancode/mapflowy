import type { OrganizerApp } from "./organizer-app";
import type { OrganizerWorkspaceDocument, Point } from "../../lib/organizer";
import type { MobileGraphScene } from "../../lib/organizer/graph-camera";

/** Optional embedding hooks; the normal organizer requires neither. */
export interface OrganizerSession { storage: Storage; workspace: OrganizerWorkspaceDocument }
export interface GraphFrame {
  scene: MobileGraphScene;
  width: number;
  height: number;
  selectedId: string;
  focusId: string;
  automatic: Point;
  editing: boolean;
}
export interface GraphNavigationAdapter {
  readonly instant: boolean;
  resolve(frame: GraphFrame): Point;
  select(id: string): void;
  attach(app: OrganizerApp): void;
  disconnect(): void;
  overlay(): unknown;
  actions?(): unknown;
}
