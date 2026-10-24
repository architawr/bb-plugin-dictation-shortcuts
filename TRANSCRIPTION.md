# How BB voice transcription selects a service

Verified against upstream get-bb/bb commit 91569fb and the shipped BB 0.46.1 Codex server/host bundles. No credentials are read by this plugin. Inspect `bb settings ai-services` to see which service your installation currently uses.

The agent selected for the conversation is independent of the voice service. A Claude thread can use Codex transcription. A running Codex CLI agent is not required: the plugin sends HTTP requests itself using credentials available on BB's primary host.

## Request path

1. Native voice recording finishes and produces an audio file.
2. `sdk.system.transcribeVoice({ file, prompt?, signal? })` POSTs multipart form data to `/api/v1/system/voice-transcription`.
3. `transcribeVoiceInput` runs the AI task `voice`. This path has no thread provider/model selector.
4. Automatic considers loaded transcription services: bb cloud first, then other services sorted by plugin/service id. Unready services are skipped; failures can fall through to later candidates. Explicit selection considers only that service, and Off disables the task.
5. The Codex AI-service plugin calls `codex.ai.transcribe` on the primary host. Readiness checks the host and usable saved Codex credentials, not an active coding-agent process. Readiness is not a successful live network/quota probe.
6. With ChatGPT account auth the installed adapter calls `https://chatgpt.com/backend-api/transcribe`; with API-key auth it calls `https://api.openai.com/v1/audio/transcriptions`. Both submit a file and parse a final JSON text response. The shortcut plugin never sees or manages this authentication.

## Meaning of "Codex is not enabled"

- Another agent is selected in the chat, or no Codex task is running: this does not prevent Codex transcription.
- Codex credentials are missing/unusable on the primary host, or the host is offline: the Codex voice service is not ready. Expired credentials, quota and network errors can also make an actual transcription fail.
- The `provider-codex` plugin is disabled/unloaded: its voice service is no longer registered.
- No ready alternative is configured: voice input is unavailable; the server returns a `not_configured` error (501).
- BB cloud is ready or another transcription plugin is configured: voice can work without Codex. Automatic can use it; an explicitly pinned Codex selection will not switch providers.

Codex is not intrinsically required for BB voice input; any ready transcription service selected in BB can provide it.

## Source pointers

- [SDK file upload](https://github.com/get-bb/bb/blob/91569fb/packages/sdk/src/areas/system.ts)
- [Server transcription task](https://github.com/get-bb/bb/blob/91569fb/apps/server/src/services/ai/voice-transcription.ts)
- [Automatic selection and fallback](https://github.com/get-bb/bb/blob/91569fb/apps/server/src/services/ai/ai-tasks.ts)
- [Codex service registration](https://github.com/get-bb/bb/blob/91569fb/plugins/provider-codex/src/ai-service.ts)
- [Host readiness and transcription handler](https://github.com/get-bb/bb/blob/91569fb/plugins/provider-codex/src/host.ts)
- [Codex HTTP adapter](https://github.com/get-bb/bb/blob/91569fb/plugins/provider-codex/src/ai/chatgpt-client.ts)

The upstream checkout is newer than the installed UI. The relevant Codex routing/readiness logic was additionally checked in the Codex provider bundles shipped with BB 0.46.1.
