# @inneranimalmedia/copro-editor

Headless deterministic editing commands for CoPro.

The UI, keyboard shortcuts, AgentSam, mobile gestures, and future native clients should all invoke the same command layer.

Initial commands:

- clip.insert
- clip.move
- clip.trim
- clip.split
- clip.duplicate
- clip.delete

History is explicit through CoProEditorSession; React components do not own canonical mutation semantics.
