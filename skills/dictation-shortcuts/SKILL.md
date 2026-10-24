---
name: dictation-shortcuts
description: Explain or troubleshoot Dictation Shortcuts, a BB plugin for native voice recording keyboard controls.
---

Hold Space for 300 ms in the chat editor to start native dictation; release to stop and insert. Short taps type a normal space. Ctrl+Shift+Space also toggles native dictation. Enter stops into the draft; Escape cancels. The toggle is rebindable in Settings → Keyboard, `plugin:dictation-shortcuts/toggle`. Hints are merged into BB’s existing tooltip (no browser title); compact modifier badges use BB’s native ShortcutPill classes. Hover the native controls for hints; holding Command (macOS) or Control for 700 ms displays badges, respecting BB’s Show keyboard hints setting. No streaming is implemented. BB's selected AI voice service remains unchanged.

Inspect `bb settings ai-services` for availability and `bb plugin logs dictation-shortcuts` for plugin errors. This version uses a narrow DOM adapter to BB 0.46.1 native recorder buttons because the public composer handle has no recorder controls. On a UI change, verify exact accessible labels and scope before modifying selectors. Never target Send as the stop control. See README.md and TRANSCRIPTION.md in the plugin source for verification and provider details.
