// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { CallMode } from '../types/CallDisposition.std.ts';
import {
  directPresentationIdentity,
  groupPresentationIdentity,
  localPresentationIdentity,
} from './presentationSourceController.std.ts';

export type PresentationAuthorityOptions = Readonly<{
  callMode: CallMode;
  conversationId: string;
  isLocalPresenting: boolean;
  isRemotePresenting: boolean;
  remotePresenterDemuxId?: number;
}>;

export function getAuthoritativePresentationIdentity({
  callMode,
  conversationId,
  isLocalPresenting,
  isRemotePresenting,
  remotePresenterDemuxId,
}: PresentationAuthorityOptions): string | undefined {
  if (callMode === CallMode.Adhoc) {
    return undefined;
  }
  if (isLocalPresenting) {
    return localPresentationIdentity(conversationId);
  }
  if (!isRemotePresenting) {
    return undefined;
  }
  if (callMode === CallMode.Direct) {
    return directPresentationIdentity(conversationId);
  }
  if (remotePresenterDemuxId === undefined) {
    return undefined;
  }
  return groupPresentationIdentity(conversationId, remotePresenterDemuxId);
}
