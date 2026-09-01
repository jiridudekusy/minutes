// Copyright 2026 minutes contributors
// SPDX-License-Identifier: AGPL-3.0-only

import semver from 'semver';

/** Upstream Signal Desktop release (sync when merging upstream). */
export const MINUTES_SIGNAL_BASE_VERSION = '8.25.0';

export const MINUTES_CONFIRMED_FIX_LABEL = 'potvrzeno-k-oprave';

/** Po beta release — issue čeká retest na pre-release buildu. */
export const MINUTES_RETEST_LABEL = 'to-retest';

/** `{signalBase}-m{meetupSemver}` or `{signalBase}-m{meetupSemver}-beta.{n}` */
export const MINUTES_PRODUCT_VERSION_PATTERN =
  /^(\d+\.\d+\.\d+)-m(\d+\.\d+\.\d+)(?:-beta\.(\d+))?$/i;

export type MinutesProductVersion = Readonly<{
  signalBase: string;
  meetup: string;
  beta: number | null;
}>;

export function normalizeVersionTag(tag: string): string {
  return tag.trim().replace(/^v/i, '');
}

export function parseMinutesProductVersion(
  version: string
): MinutesProductVersion | null {
  const normalized = normalizeVersionTag(version);
  const match = MINUTES_PRODUCT_VERSION_PATTERN.exec(normalized);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    signalBase: match[1],
    meetup: match[2],
    beta: match[3] != null ? Number(match[3]) : null,
  };
}

export function formatMinutesProductVersion(
  signalBase: string,
  meetup: string,
  beta: number | null = null
): string {
  const base = `${signalBase}-m${meetup}`;
  if (beta != null) {
    return `${base}-beta.${beta}`;
  }
  return base;
}

export function isMinutesBetaVersion(version: string): boolean {
  return parseMinutesProductVersion(version)?.beta != null;
}

/** Legacy alpha builds tied to Signal base (8.21.0-alpha.N). */
export function isLegacyMinutesAlphaVersion(version: string): boolean {
  return /^(\d+\.\d+\.\d+)-alpha\.\d+$/i.test(normalizeVersionTag(version));
}

/** Legacy Meetup-only semver before `-m` format (e.g. 1.0.1). */
export function isLegacyPlainMeetupVersion(version: string): boolean {
  const normalized = normalizeVersionTag(version);
  return /^\d+\.\d+\.\d+$/.test(normalized);
}

export function normalizeMinutesVersionForCompare(version: string): string {
  const normalized = normalizeVersionTag(version);
  const product = parseMinutesProductVersion(normalized);

  if (product) {
    return formatMinutesProductVersion(
      product.signalBase,
      product.meetup,
      product.beta
    );
  }

  if (isLegacyMinutesAlphaVersion(normalized)) {
    return normalized;
  }

  if (isLegacyPlainMeetupVersion(normalized)) {
    return formatMinutesProductVersion(MINUTES_SIGNAL_BASE_VERSION, normalized);
  }

  return normalized;
}

export function parseMinutesSemverVersion(
  version: string
): semver.SemVer | null {
  const normalized = normalizeMinutesVersionForCompare(version);
  return semver.parse(normalized) ?? semver.parse(normalized, { loose: true });
}

export function compareMinutesVersions(left: string, right: string): number {
  const leftNorm = normalizeMinutesVersionForCompare(left);
  const rightNorm = normalizeMinutesVersionForCompare(right);

  const leftProduct = parseMinutesProductVersion(leftNorm);
  const rightProduct = parseMinutesProductVersion(rightNorm);

  if (leftProduct && rightProduct) {
    const signalCmp = semver.compare(
      leftProduct.signalBase,
      rightProduct.signalBase
    );
    if (signalCmp !== 0) {
      return Math.sign(signalCmp);
    }

    const meetupCmp = semver.compare(leftProduct.meetup, rightProduct.meetup);
    if (meetupCmp !== 0) {
      return Math.sign(meetupCmp);
    }

    const { beta: leftBeta } = leftProduct;
    const { beta: rightBeta } = rightProduct;
    if (leftBeta == null && rightBeta == null) {
      return 0;
    }
    if (leftBeta == null && rightBeta != null) {
      return 1;
    }
    if (leftBeta != null && rightBeta == null) {
      return -1;
    }
    if (leftBeta != null && rightBeta != null) {
      if (leftBeta > rightBeta) {
        return 1;
      }
      if (leftBeta < rightBeta) {
        return -1;
      }
      return 0;
    }
    return 0;
  }

  return semver.compare(leftNorm, rightNorm);
}

export function isMinutesVersionNewer(
  latest: string,
  current: string
): boolean {
  return compareMinutesVersions(latest, current) === 1;
}

export function formatMinutesVersionLabel(appVersion: string): string {
  const normalized = normalizeVersionTag(appVersion);

  if (parseMinutesProductVersion(normalized)) {
    return normalized;
  }

  if (isLegacyPlainMeetupVersion(normalized)) {
    return formatMinutesProductVersion(MINUTES_SIGNAL_BASE_VERSION, normalized);
  }

  return normalized;
}
