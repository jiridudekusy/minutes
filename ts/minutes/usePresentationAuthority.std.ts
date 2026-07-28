// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect } from 'react';

import {
  getAuthoritativePresentationIdentity,
  type PresentationAuthorityOptions,
} from './presentationAuthority.std.ts';
import { presentationSourceController } from './presentationSourceControllerGlobal.std.ts';

export function usePresentationAuthority(
  options: PresentationAuthorityOptions
): void {
  const identity = getAuthoritativePresentationIdentity(options);
  useLayoutEffect(() => {
    if (!identity) {
      return;
    }
    return presentationSourceController.setAuthoritative(identity);
  }, [identity]);
}
