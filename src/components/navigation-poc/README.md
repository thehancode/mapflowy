# Disposable graph navigation experiment

Open `/test/1` for free dragging plus selection history. The page embeds the real organizer with its own in-memory
Storage implementation and fresh deterministic demo. Reload, Reset, and route
changes discard edits. No production storage is read or written by the session.

Free drag activates at 8px and stays within canvas boundaries.
Node touch holds open the existing context menu at 500ms. Only empty graph
space (including decorative links) starts camera gestures. No momentum.

The floating back icon sits directly above the add-node button. It restores the
selection and exact camera position before selecting another node, including a
manually panned position. Dragging alone does not add history. History holds up
to 50 entries; Back is disabled when empty or editing.

Delete `src/pages/test/` and `src/components/navigation-poc/` to remove all
experiments. The optional session/navigation embedding hooks in the organizer
can remain: production has no imports from this directory and requires neither.
