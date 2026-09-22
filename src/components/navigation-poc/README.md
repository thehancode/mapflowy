# Disposable balloon-tree experiment

Open `/test/1` for balloon subtree-disk packing followed by validated inward
compaction. Connections are straight lines between node centers. The five
level palettes are coral-to-pink, orange-to-golden, blue-to-lavender,
citron-to-teal, and teal-to-blue. Each pair produces eight shortest-path HSL
shades matching the color study, including both endpoints. The root uses coral;
other nodes choose a stable pseudo-random shade using their ID.
Levels after five repeat the pairs.

The page embeds the real organizer with its own in-memory Storage implementation
and fresh deterministic demo. Reload or Reset discards edits. No production
storage is read or written by the session.

Free drag activates at 8px and stays within canvas boundaries.
Node touch holds open the existing context menu at 500ms. Only empty graph
space (including decorative links) starts camera gestures. No momentum.

The floating back icon sits directly above the add-node button. It restores the
selection and exact camera position before selecting another node, including a
manually panned position. Dragging alone does not add history. History holds up
to 50 entries; Back is disabled when empty or editing.

## Layout behavior

Nodes have no position animation. Camera selection/Back still animate; free drag
follows the pointer directly. Node circles, measured displayed labels and 12px
clearance are included in footprints. Canvas bounds include 48px padding and
never shrink below the viewport; coordinates are not stretched to fit the screen.

Balloon disks reserve subtrees with 90px preferred connections; a final pass
pulls whole branches inward while checking geometry.

Node placement validates straight parent-child corridors, collinear edge
overlaps, occupied-box overlaps, and edges through unrelated footprints. If
necessary, a validated tidy fallback is shown with a notice. Rendered straight
connections follow the validated layout corridors.

Scene caching ignores selection and camera changes, but invalidates on structure,
labels, or viewport changes.

Delete `src/pages/test/` and `src/components/navigation-poc/` to remove all
experiments, their worker, and tests. The optional session/navigation embedding hooks in the organizer
can remain: production has no imports from this directory and requires neither.
