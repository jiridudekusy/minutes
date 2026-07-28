# Local LLM Reasoning Setting

## Problem

The Gemma 4 chat wrapper in `node-llama-cpp` enables reasoning by default.
For long meeting transcripts the model can spend the entire output budget on
an internal thought segment. `LlamaChatSession.prompt()` returns only the final
response text, so Minutes receives an empty string, writes a zero-byte summary
file, and incorrectly reports success.

## User Experience

The local LLM settings panel will contain a global “Reasoning” switch. It is
off by default for new and existing installations. The explanatory text will
state that enabling it can improve complex analysis but makes local inference
slower and uses part of the output budget for internal reasoning.

The setting applies to every operation routed through the local LLM: meeting
summaries, transcript correction, AI opinions, and the connection test. Cloud
providers are unaffected.

## Storage and Migration

The boolean `reasoningEnabled` is stored in `local-llm-extension.json`
alongside the selected model and context size. Missing or malformed values
normalize to `false`, providing an implicit migration for existing settings.

Changing the value disposes the loaded local model context so the next request
uses a wrapper with the new policy. It does not download or reinstall the
model.

## Runtime

The shared local inference options and loaded-model cache identity include
`reasoningEnabled`. The wrapper resolver passes this value to the Gemma 4
wrapper as its `reasoning` option. Keeping the policy in the shared local
inference path makes it apply consistently to every local LLM consumer and
provides one place to support equivalent controls for future local models.

Every local inference result is trimmed and validated. An empty result throws
a user-visible error and is never returned as a successful generation.
Call-summary persistence also validates the final text before writing, so no
provider can create a zero-byte `.summary.md` while reporting success.

## Tests

Tests cover:

- migration and normalization defaulting reasoning to disabled;
- persistence of explicit enabled and disabled values;
- loaded-model cache invalidation when reasoning changes;
- wrapper settings resolving Gemma 4 with the selected reasoning policy;
- rejection of an empty local inference result;
- rejection of an empty summary before artifact persistence.
