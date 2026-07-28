# Local LLM Context Size Setting

## Problem

Minutes currently creates every local LLM context with a hard-coded size of
8,192 tokens. The installed Gemma 4 model declares a training context of
262,144 tokens, but long call transcripts can exceed the application's fixed
limit. `node-llama-cpp` then shifts the context and the model may lose the
meeting content, producing empty or unrelated summaries.

## User Experience

The embedded “Lokální model (Gemma)” panel in AI settings will contain a
“Velikost kontextu” select with these choices:

- Automaticky (doporučeno, max. 64k)
- 8k
- 16k
- 32k
- 64k
- 128k

Automatic mode is the default for both new installations and existing settings
files without a context value. The panel explains that larger contexts process
longer transcripts but consume more memory.

## Storage and Validation

The selected value is stored in `local-llm-extension.json` alongside activation
and model information. A shared standard module owns the allowed values,
normalization, labels, and the default. Unknown or malformed stored values
normalize to automatic mode.

Automatic mode resolves to a `node-llama-cpp` adaptive context with a minimum
of 8,192 and a maximum of 65,536 tokens. Explicit selections resolve to their
numeric token count.

## Runtime Flow

The main-process extension API exposes the current context selection and a
dedicated save operation. Saving a changed value disposes the currently loaded
local model so the next request creates a context with the new size. Saving
does not download or reinstall the GGUF model.

Every local summary, transcript correction, opinion, and connection test uses
the stored context selection through the existing local LLM inference path.
The loaded-model cache key includes both the model file and context selection,
preventing reuse of a context created with a stale size.

## Errors and Compatibility

Existing settings remain valid and migrate implicitly to automatic mode.
Invalid IPC or stored values are normalized to automatic mode rather than
reaching `node-llama-cpp`. If an explicitly large context cannot be allocated,
the existing inference error is shown to the user; Minutes does not silently
change an explicit choice.

## Tests

Tests cover:

- normalization and runtime resolution of all allowed values;
- migration of missing or invalid stored values to automatic mode;
- persistence through the main/preload API;
- cache identity and context creation using the selected size;
- the UI-facing option catalog and default.
