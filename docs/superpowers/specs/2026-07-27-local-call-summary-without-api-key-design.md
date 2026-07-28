# Local call summary without API key

## Problem

Minutes correctly recognizes that the active local Gemma model is ready, but
the call-recording summary pipeline still calls `getAiApiKey('local')` and
rejects the request when it returns `null`. This breaks manual summary
generation and silently skips AI work in related post-transcription paths even
though a local provider does not use an API key.

## Intended behavior

- An enabled and active `local` provider can correct transcripts and generate
  call summaries without any API key.
- Cloud providers continue to require their configured API key or existing
  fallback credential.
- Missing or inactive local models continue to be rejected by the existing
  readiness checks.
- No settings migration or UI change is required.

## Design

Add one small provider-aware credential resolver in the call-summary module:

- Return an empty credential for `local`, matching the established convention
  already used by other Minutes AI call sites.
- Delegate cloud providers to `getAiApiKey(provider)`.

Use this resolver consistently in:

1. transcript correction during transcription;
2. automatic summary generation after transcription;
3. explicit `generateCallRecordingSummary`.

For cloud providers, preserve the existing missing-key error. For the local
provider, proceed to `generateAiSummaryForProvider`, whose local branch invokes
the activated local LLM runtime and does not consume the credential.

## Testing

Add regression coverage that proves:

- the local provider proceeds without a stored API key;
- a cloud provider without an API key remains rejected;
- all existing call-summary and AI provider tests remain green.

The implementation must follow red-green TDD: the local-provider regression
must fail with the current unconditional API-key check before production code
is changed.

## Scope

This fix is limited to the call-recording summary pipeline. It does not change
the public AI settings contract, credential storage, local-model activation, or
cloud-provider behavior.
