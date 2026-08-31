// Minutes product versioning: {SignalBase}-m{MeetupSemver}[-beta.N]
// e.g. 8.21.0-m1.0.1 (prod) or 8.21.0-m1.0.1-beta.2 (beta)
import semver from 'semver';

export const MINUTES_SIGNAL_BASE_VERSION = '8.25.0';

export const MINUTES_CONFIRMED_FIX_LABEL = 'potvrzeno-k-oprave';

/** Po beta release — issue čeká retest na pre-release buildu. */
export const MINUTES_RETEST_LABEL = 'to-retest';

const MINUTES_PRODUCT_VERSION_PATTERN =
  /^(\d+\.\d+\.\d+)-m(\d+\.\d+\.\d+)(?:-beta\.(\d+))?$/i;

/** @typedef {'major' | 'minor' | 'patch'} MinutesBumpLevel */
/** @typedef {'prod' | 'beta'} MinutesReleaseChannel */

/**
 * @param {string} version
 * @returns {string}
 */
function normalizeVersionTag(version) {
  return version.trim().replace(/^v/i, '');
}

/**
 * @param {string} version
 * @returns {{ signalBase: string; meetup: string; beta: number | null } | null}
 */
export function parseMinutesProductVersion(version) {
  const normalized = normalizeVersionTag(version);
  const match = MINUTES_PRODUCT_VERSION_PATTERN.exec(normalized);
  if (!match) {
    return null;
  }

  return {
    signalBase: match[1],
    meetup: match[2],
    beta: match[3] != null ? Number(match[3]) : null,
  };
}

/**
 * @param {string} signalBase
 * @param {string} meetup
 * @param {number | null | undefined} [beta]
 * @returns {string}
 */
export function formatMinutesProductVersion(signalBase, meetup, beta = null) {
  const base = `${signalBase}-m${meetup}`;
  if (beta != null) {
    return `${base}-beta.${beta}`;
  }
  return base;
}

/**
 * @param {string} version
 * @returns {boolean}
 */
export function isMinutesBetaVersion(version) {
  return parseMinutesProductVersion(version)?.beta != null;
}

/**
 * @param {string} version
 * @returns {boolean}
 */
export function isLegacyMinutesAlphaVersion(version) {
  return /^(\d+\.\d+\.\d+)-alpha\.\d+$/i.test(normalizeVersionTag(version));
}

/**
 * @param {string} version
 * @returns {boolean}
 */
export function isLegacyPlainMeetupVersion(version) {
  const normalized = normalizeVersionTag(version);
  return /^\d+\.\d+\.\d+$/.test(normalized);
}

/**
 * @param {string} version
 * @returns {string}
 */
export function normalizeMinutesVersionForCompare(version) {
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

/**
 * @param {string} version
 * @returns {{ signalBase: string; major: number; minor: number; patch: number; beta: number | null }}
 */
export function parseMinutesVersion(version) {
  const product = parseMinutesProductVersion(version);
  if (product) {
    const meetup = semver.parse(product.meetup);
    if (!meetup) {
      throw new TypeError(`Invalid Meetup semver in version: ${version}`);
    }

    return {
      signalBase: product.signalBase,
      major: meetup.major,
      minor: meetup.minor,
      patch: meetup.patch,
      beta: product.beta,
    };
  }

  const normalized = normalizeVersionTag(version);
  const plain =
    semver.parse(normalized) ?? semver.parse(normalized, { loose: true });
  if (plain && isLegacyPlainMeetupVersion(normalized)) {
    return {
      signalBase: MINUTES_SIGNAL_BASE_VERSION,
      major: plain.major,
      minor: plain.minor,
      patch: plain.patch,
      beta: null,
    };
  }

  throw new TypeError(
    `Invalid Minutes version (expected ${MINUTES_SIGNAL_BASE_VERSION}-mX.Y.Z[-beta.N]): ${version}`
  );
}

/**
 * @param {string} version
 * @param {MinutesBumpLevel} [level='patch']
 * @returns {string}
 */
export function bumpMinutesVersion(version, level = 'patch') {
  const parsed = parseMinutesVersion(version);
  let { major, minor, patch } = parsed;

  if (level === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return formatMinutesProductVersion(
    parsed.signalBase,
    `${major}.${minor}.${patch}`
  );
}

/**
 * Next beta tag for the same Meetup line, or -beta.1 when coming from stable.
 * @param {string} version
 * @returns {string}
 */
export function bumpMinutesBetaVersion(version) {
  const parsed = parseMinutesVersion(version);

  if (parsed.beta != null) {
    return formatMinutesProductVersion(
      parsed.signalBase,
      `${parsed.major}.${parsed.minor}.${parsed.patch}`,
      parsed.beta + 1
    );
  }

  return formatMinutesProductVersion(
    parsed.signalBase,
    `${parsed.major}.${parsed.minor}.${parsed.patch}`,
    1
  );
}

/**
 * Strip -beta.N for prod promotion (same Meetup semver).
 * @param {string} version
 * @returns {string}
 */
export function stripMinutesBetaVersion(version) {
  const parsed = parseMinutesVersion(version);
  return formatMinutesProductVersion(
    parsed.signalBase,
    `${parsed.major}.${parsed.minor}.${parsed.patch}`
  );
}

/**
 * Compare Minutes product versions (legacy alpha / plain Meetup included).
 * On the same Meetup line, stable (no -beta) is newer than any -beta.N.
 * @returns {1 | 0 | -1}
 */
export function compareMinutesVersions(left, right) {
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
      return /** @type {1 | 0 | -1} */ (Math.sign(signalCmp));
    }

    const meetupCmp = semver.compare(leftProduct.meetup, rightProduct.meetup);
    if (meetupCmp !== 0) {
      return /** @type {1 | 0 | -1} */ (Math.sign(meetupCmp));
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
    if (leftBeta > rightBeta) {
      return 1;
    }
    if (leftBeta < rightBeta) {
      return -1;
    }
    return 0;
  }

  return semver.compare(leftNorm, rightNorm);
}

/**
 * @param {string} latest
 * @param {string} current
 * @returns {boolean}
 */
export function isMinutesVersionNewer(latest, current) {
  return compareMinutesVersions(latest, current) === 1;
}
