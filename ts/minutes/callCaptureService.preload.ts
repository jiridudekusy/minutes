// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { callRecordingService } from './callRecordingService.preload.ts';
import { videoRecordingService } from './videoRecordingService.preload.ts';
import { createCallCaptureService } from './callCaptureService.std.ts';

export const callCaptureService = createCallCaptureService({
  audio: callRecordingService,
  video: videoRecordingService,
});
