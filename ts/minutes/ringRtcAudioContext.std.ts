// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createLogger } from '../logging/log.std.ts';

const log = createLogger('minutes/ringRtcAudioContext');

type AudioContextWithSinkSelection = AudioContext &
  Readonly<{
    setSinkId: (sinkId: Readonly<{ type: 'none' }>) => Promise<void>;
  }>;

export async function configureRingRtcRecordingAudioContext(
  context: AudioContext
): Promise<void> {
  const contextWithSinkSelection = context as AudioContextWithSinkSelection;
  if (typeof contextWithSinkSelection.setSinkId !== 'function') {
    log.warn(
      'AudioContext silent sink is unavailable; output device changes may interrupt recording'
    );
    return;
  }

  // Keep every recording graph's clock independent of the current speaker.
  // Otherwise macOS can pause it while switching output devices.
  await contextWithSinkSelection.setSinkId({ type: 'none' });
}
