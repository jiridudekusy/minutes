# Recordings in Documents design

Date: 2026-07-23
Status: Approved

## Goal

Store all completed and in-progress Minutes call recordings in:

`~/Documents/Minutes`

The directory contains recording artifacts only: MP3, raw PCM, WebM, recording
metadata, speaker-activity sidecars, and temporary partial recording files.
Signal data, Minutes settings, logs, models, summaries, and databases remain in
Electron `userData`.

## Architecture

A single main-process path resolver returns
`join(app.getPath('documents'), 'Minutes')`. Audio recording, video recording,
the recordings catalog, the test-call pipeline, and the "open recordings
folder" action all consume this resolver. No recording code constructs a path
under `userData` independently.

## Migration

Before recording IPC channels become available, the application migrates the
legacy `userData/minutes/recordings` directory to the Documents location.

- If the legacy directory does not exist, startup continues normally.
- If the target does not exist, the directory is moved as one unit.
- If the target already exists, non-conflicting recording artifacts are moved
  without changing their names.
- Existing target files are never overwritten. A conflicting legacy artifact
  remains in the legacy directory and the conflict is logged.
- Finder and Windows directory metadata such as `.DS_Store`, `Thumbs.db`, and
  `desktop.ini` are discarded instead of being migrated.
- Cross-device moves fall back to copy-then-delete after a successful copy.
- Migration failure does not delete source data and prevents recording channels
  from silently writing to two different locations.

The migration is idempotent and safe to retry on the next startup.

## Testing

Automated tests cover:

- resolving the path from Electron's Documents directory;
- a missing or empty legacy directory;
- whole-directory migration;
- merging into an existing target;
- collision preservation without overwrite;
- cross-device fallback;
- audio, video, catalog, and folder-opening use of the shared target.

The packaged VM acceptance check verifies that existing recordings appear in
`~/Documents/Minutes`, new MP3 and WebM files are created there, and no
non-recording application data is written to Documents.
