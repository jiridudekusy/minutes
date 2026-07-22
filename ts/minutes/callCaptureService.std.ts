// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { CallMode } from '../types/CallDisposition.std.ts';

export type CallEndedCaptureOptions = Readonly<{
  conversationId: string;
  callMode: CallMode;
}>;

type CaptureEndListener = Readonly<{
  onCallEnded(options: CallEndedCaptureOptions): Promise<unknown>;
}>;

export function createCallCaptureService(services: {
  audio: CaptureEndListener;
  video: CaptureEndListener;
}): Readonly<{
  onCallEnded(options: CallEndedCaptureOptions): Promise<void>;
}> {
  return {
    async onCallEnded(options) {
      await Promise.all([
        services.audio.onCallEnded(options),
        services.video.onCallEnded(options),
      ]);
    },
  };
}
