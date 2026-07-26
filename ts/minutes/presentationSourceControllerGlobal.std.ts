// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { PresentationSourceController } from './presentationSourceController.std.ts';

export {
  directPresentationIdentity,
  groupPresentationIdentity,
  localPresentationIdentity,
} from './presentationSourceController.std.ts';

export type PresentationElement = HTMLCanvasElement | HTMLVideoElement;

export const presentationSourceController =
  new PresentationSourceController<PresentationElement>();
