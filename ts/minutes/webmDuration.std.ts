// Copyright 2026 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

const EBML_HEADER_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const DURATION_ID = 0x4489;

const DURATION_ELEMENT_HEADER = Uint8Array.from([0x44, 0x89, 0x88]);
const DURATION_VALUE_BYTE_LENGTH = 8;

type EbmlElement = Readonly<{
  id: number;
  size: number | undefined;
  sizeOffset: number;
  sizeWidth: number;
  dataOffset: number;
  endOffset: number | undefined;
}>;

export type WebmDurationPlaceholder = Readonly<{
  data: Uint8Array<ArrayBuffer>;
  durationValueOffset: number;
}>;

/**
 * Chrome's MediaRecorder omits the WebM Duration element. Add a fixed-width
 * placeholder to the first chunk so the writer can patch it in place once the
 * recording duration is known, without buffering or rewriting the full file.
 */
export function addWebmDurationPlaceholder(
  input: Uint8Array<ArrayBuffer>
): WebmDurationPlaceholder | undefined {
  const ebmlHeader = readElement(input, 0);
  if (ebmlHeader?.id !== EBML_HEADER_ID || ebmlHeader.endOffset === undefined) {
    return undefined;
  }

  const segment = readElement(input, ebmlHeader.endOffset);
  if (segment?.id !== SEGMENT_ID) {
    return undefined;
  }

  const info = readElement(input, segment.dataOffset);
  if (
    info?.id !== INFO_ID ||
    info.size === undefined ||
    info.endOffset === undefined ||
    containsElement(input, info, DURATION_ID)
  ) {
    return undefined;
  }

  const insertedByteLength =
    DURATION_ELEMENT_HEADER.byteLength + DURATION_VALUE_BYTE_LENGTH;
  const newInfoSize = info.size + insertedByteLength;
  const encodedInfoSize = encodeElementSize(newInfoSize, info.sizeWidth);
  if (!encodedInfoSize) {
    return undefined;
  }

  const output = new Uint8Array(input.byteLength + insertedByteLength);
  output.set(input.subarray(0, info.sizeOffset), 0);
  output.set(encodedInfoSize, info.sizeOffset);
  output.set(input.subarray(info.dataOffset, info.endOffset), info.dataOffset);
  output.set(DURATION_ELEMENT_HEADER, info.endOffset);
  const durationValueOffset =
    info.endOffset + DURATION_ELEMENT_HEADER.byteLength;
  output.set(
    input.subarray(info.endOffset),
    info.endOffset + insertedByteLength
  );

  return { data: output, durationValueOffset };
}

export function encodeWebmDuration(
  durationMs: number
): Uint8Array<ArrayBuffer> {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('WebM duration must be a finite non-negative number');
  }
  const data = new Uint8Array(DURATION_VALUE_BYTE_LENGTH);
  new DataView(data.buffer).setFloat64(0, durationMs, false);
  return data;
}

function containsElement(
  input: Uint8Array<ArrayBuffer>,
  parent: EbmlElement,
  targetId: number
): boolean {
  if (parent.endOffset === undefined) {
    return false;
  }
  let offset = parent.dataOffset;
  while (offset < parent.endOffset) {
    const child = readElement(input, offset);
    if (
      !child ||
      child.endOffset === undefined ||
      child.endOffset > parent.endOffset
    ) {
      return false;
    }
    if (child.id === targetId) {
      return true;
    }
    offset = child.endOffset;
  }
  return false;
}

function readElement(
  input: Uint8Array<ArrayBuffer>,
  offset: number
): EbmlElement | undefined {
  const idWidth = readVintWidth(input[offset], 4);
  if (!idWidth || offset + idWidth >= input.byteLength) {
    return undefined;
  }
  let id = 0;
  for (let index = 0; index < idWidth; index += 1) {
    const byte = input[offset + index];
    if (byte === undefined) {
      return undefined;
    }
    id = id * 256 + byte;
  }

  const sizeOffset = offset + idWidth;
  const sizeWidth = readVintWidth(input[sizeOffset], 8);
  if (!sizeWidth || sizeOffset + sizeWidth > input.byteLength) {
    return undefined;
  }
  const firstValueBase = 2 ** (8 - sizeWidth);
  const firstValueMask = firstValueBase - 1;
  const firstSizeByte = input[sizeOffset];
  if (firstSizeByte === undefined) {
    return undefined;
  }
  const isUnknownSize =
    firstSizeByte % firstValueBase === firstValueMask &&
    input
      .subarray(sizeOffset + 1, sizeOffset + sizeWidth)
      .every(value => value === 0xff);

  let size: number | undefined;
  if (!isUnknownSize) {
    let value = firstSizeByte % firstValueBase;
    for (let index = 1; index < sizeWidth; index += 1) {
      const byte = input[sizeOffset + index];
      if (byte === undefined) {
        return undefined;
      }
      value = value * 256 + byte;
      if (!Number.isSafeInteger(value)) {
        return undefined;
      }
    }
    size = value;
  }

  const dataOffset = sizeOffset + sizeWidth;
  const endOffset = size === undefined ? undefined : dataOffset + size;
  if (endOffset !== undefined && endOffset > input.byteLength) {
    return undefined;
  }
  return { id, size, sizeOffset, sizeWidth, dataOffset, endOffset };
}

function readVintWidth(
  firstByte: number | undefined,
  maximumWidth: number
): number | undefined {
  if (firstByte === undefined || firstByte === 0) {
    return undefined;
  }
  let marker = 0x80;
  for (let width = 1; width <= maximumWidth; width += 1) {
    if (firstByte >= marker) {
      return width;
    }
    marker /= 2;
  }
  return undefined;
}

function encodeElementSize(
  value: number,
  width: number
): Uint8Array<ArrayBuffer> | undefined {
  const maximumValue = 2 ** (7 * width) - 2;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximumValue) {
    return undefined;
  }

  const output = new Uint8Array(width);
  let remaining = value;
  for (let index = width - 1; index >= 0; index -= 1) {
    output[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  const firstByte = output[0];
  if (firstByte === undefined) {
    return undefined;
  }
  output[0] = firstByte + 2 ** (8 - width);
  return output;
}
