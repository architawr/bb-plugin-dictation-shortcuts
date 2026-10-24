# Dictation Shortcuts

A small BB plugin controlling BB's existing voice input. Installed and checked on BB 0.46.1 / Plugin SDK 0.6.49. No new transcription service, API key, microphone recorder, audio storage, or streaming.

- **Hold Space (300 ms)** in the chat editor to record; release to stop and transcribe into the draft. A short tap inserts one normal space.
- **Ctrl+Shift+Space**: start recording; press again to stop and transcribe into the draft.
- **Enter** during recording: stop and transcribe into the draft. During transcription it does not send. Release Enter before pressing it again to send normally.
- **Escape** during recording or transcription: cancel using BB's own cancel control.
- Enter/Escape also work when recording was started with the native microphone button.
- Hover the native microphone/stop controls for keyboard hints in BB’s existing tooltip; there is no extra browser tooltip. Hold Command on macOS (or Control) for 700 ms to show shortcut badges next to them. BB’s Show keyboard hints setting is respected.
- Focus loss ends a held recording. Escape cancels it even if microphone initialization is still pending.

The toggle is rebindable under Settings → Keyboard, command `plugin:dictation-shortcuts/toggle`.

## Install

```sh
bb plugin install git:https://github.com/architawr/bb-plugin-dictation-shortcuts.git@^0.2.1
```

Requires an available voice service in **Settings → AI services → Voice input**. The plugin uses that service; its existing account requirements and charges still apply.

## Implementation and limitations

The public composer SDK does not expose native recorder controls in this BB release. A hidden composer banner associates the SDK composer handle with its DOM root. The registered command clicks the exact accessible native start/stop button within that root. A cleanup-safe content script handles hold/release Space in the editor and Enter/Escape for active dictation. Short Space taps are inserted through the composer SDK; text and mentions are preserved. A second script augments known text in the existing aria-describedby-linked BB tooltip and adds compact modifier-held badges using the exact native ShortcutPill classes, reads the existing BB hint setting and the toggle shortcut override, and restores the original tooltip text and attributes when unloaded. BB 0.46.1 does not expose its shared shortcut-hint component to plugins, so the badge adapter follows its 700 ms modifier behavior. It never clicks Send. Dialogs, menus, IME input and other input fields retain their normal key handling.

This adapter depends on BB's `data-app-composer` attribute and English accessible button labels. Missing, disabled or ambiguous buttons cause no action. A BB UI update or custom composer can require updating the adapter. Uninstalling/disabling removes all listeners; it does not cancel a native recording already in progress.

No provider or AI-service setting is modified. BB owns device selection, permissions, capture, transcription, error recovery and insertion.

## Validation

- `npm test`: 21 passing behavioral DOM tests.
- `npm run typecheck`: passed.
- `bb plugin build`: passed.
- Installed and loaded in BB 0.46.1. Browser check: toggle starts native capture; Enter inserts a mocked transcript into an unsent draft; repeated Enter is swallowed; Escape cancels a recording started with the native microphone, without requesting transcription; media tracks stop.
- Additional browser checks verified short Space taps preserve existing text, holding Space starts capture, releasing Space inserts the transcript into that same draft, and holding/releasing Command shows/hides the dictation badge alongside BB’s native badges.
- Browser test used a synthetic Web Audio stream and a mocked transcription response, not a human microphone sample or a real external transcription request. Its test draft was cleared and the browser session closed.

## Development

Run `npm install --include=dev`, `npm test`, `npm run typecheck`, `bb plugin build`, then `bb plugin reload dictation-shortcuts` for the installed path plugin.

See [TRANSCRIPTION.md](TRANSCRIPTION.md) for the source analysis of BB's existing transcription service.

Version 0.2.1 visual check: one native microphone tooltip, no title attribute, compact Space badge. Browser-computed color, background, 12px font, 0.6 opacity, no border and no shadow match BB’s native badges. No capture/keyboard behavior changed.
