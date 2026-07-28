// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export const RING_RTC_VIDEO_TAP_VERSION = 1;
export const MAX_RING_RTC_VIDEO_TAP_DIMENSION = 8192;

export type RingRtcVideoPixelFormat = 'rgba' | 'i420' | 'nv12';

type RingRtcVideoTapEventBase = Readonly<{
  sequence: number;
  timestampUs: number;
}>;

export type RingRtcVideoTapInactive = RingRtcVideoTapEventBase &
  Readonly<{
    active: false;
  }>;

export type RingRtcVideoTapActiveFrame = RingRtcVideoTapEventBase &
  Readonly<{
    active: true;
    width: number;
    height: number;
    format: RingRtcVideoPixelFormat;
    data: Uint8Array<ArrayBuffer>;
  }>;

export type RingRtcVideoTapFrame =
  | RingRtcVideoTapInactive
  | RingRtcVideoTapActiveFrame;

export type RingRtcVideoTapApi = Readonly<{
  isVideoTapSupported(): boolean;
  videoTapVersion(): number;
  startVideoTap(): void;
  readVideoTap(lastSequence: number): RingRtcVideoTapFrame | undefined;
  stopVideoTap(): void;
}>;

function hasFunction(
  value: object,
  property: keyof RingRtcVideoTapApi
): boolean {
  return typeof Reflect.get(value, property) === 'function';
}

export function resolveRingRtcVideoTapApi(
  value: unknown
): RingRtcVideoTapApi | undefined {
  if (typeof value !== 'object' || value == null) {
    return undefined;
  }

  try {
    if (
      !hasFunction(value, 'isVideoTapSupported') ||
      !hasFunction(value, 'videoTapVersion') ||
      !hasFunction(value, 'startVideoTap') ||
      !hasFunction(value, 'readVideoTap') ||
      !hasFunction(value, 'stopVideoTap')
    ) {
      return undefined;
    }

    const api = value as RingRtcVideoTapApi;
    if (
      !api.isVideoTapSupported() ||
      api.videoTapVersion() !== RING_RTC_VIDEO_TAP_VERSION
    ) {
      return undefined;
    }
    return api;
  } catch {
    return undefined;
  }
}

export function validateRingRtcVideoTapFrame(
  value: unknown,
  lastSequence: number
): RingRtcVideoTapFrame | undefined {
  try {
    return validateRingRtcVideoTapFrameUnsafe(value, lastSequence);
  } catch {
    return undefined;
  }
}

function validateRingRtcVideoTapFrameUnsafe(
  value: unknown,
  lastSequence: number
): RingRtcVideoTapFrame | undefined {
  if (
    typeof value !== 'object' ||
    value == null ||
    !Number.isSafeInteger(lastSequence) ||
    lastSequence < 0
  ) {
    return undefined;
  }

  const sequence = Reflect.get(value, 'sequence');
  const timestampUs = Reflect.get(value, 'timestampUs');

  if (
    !Number.isSafeInteger(sequence) ||
    sequence <= lastSequence ||
    !Number.isSafeInteger(timestampUs) ||
    timestampUs < 0
  ) {
    return undefined;
  }

  const active = Reflect.get(value, 'active');
  if (active === false) {
    if (
      ['width', 'height', 'format', 'data'].some(property =>
        Reflect.has(value, property)
      )
    ) {
      return undefined;
    }
    return value as RingRtcVideoTapInactive;
  }
  if (active !== true) {
    return undefined;
  }

  const width = Reflect.get(value, 'width');
  const height = Reflect.get(value, 'height');
  const format = Reflect.get(value, 'format');
  const data = Reflect.get(value, 'data');
  if (
    !isSafeDimension(width) ||
    !isSafeDimension(height) ||
    !isRingRtcVideoPixelFormat(format) ||
    !(data instanceof Uint8Array) ||
    !(data.buffer instanceof ArrayBuffer) ||
    data.byteLength !== getExpectedFrameByteLength(width, height, format)
  ) {
    return undefined;
  }

  return value as RingRtcVideoTapFrame;
}

function isSafeDimension(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= MAX_RING_RTC_VIDEO_TAP_DIMENSION
  );
}

function isRingRtcVideoPixelFormat(
  value: unknown
): value is RingRtcVideoPixelFormat {
  return value === 'rgba' || value === 'i420' || value === 'nv12';
}

function getExpectedFrameByteLength(
  width: number,
  height: number,
  format: RingRtcVideoPixelFormat
): number {
  if (format === 'rgba') {
    return width * height * 4;
  }

  const chromaWidth = Math.ceil(width / 2);
  const chromaHeight = Math.ceil(height / 2);
  return width * height + 2 * chromaWidth * chromaHeight;
}
