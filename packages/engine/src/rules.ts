/**
 * Canonical rules of Accident (Bulls and Cows). See requirements.md REQ-3.
 *
 * A code is a string of exactly 4 distinct digits "0"-"9". Leading zero allowed.
 * Feedback is an integer: dead * 10 + injured.
 */

export type Code = string;
export type Feedback = number;
export type Seat = 0 | 1;

export const CODE_LENGTH = 4;
export const GUESSES_PER_PLAYER = 12;
export const MAX_GUESSES = GUESSES_PER_PLAYER * 2;
export const WIN_FEEDBACK: Feedback = 40;

const CODE_PATTERN = /^[0-9]{4}$/;

/** True when `value` is a string of 4 distinct digits. */
export function isValidCode(value: unknown): value is Code {
  if (typeof value !== 'string' || !CODE_PATTERN.test(value)) return false;
  return (
    value[0] !== value[1] &&
    value[0] !== value[2] &&
    value[0] !== value[3] &&
    value[1] !== value[2] &&
    value[1] !== value[3] &&
    value[2] !== value[3]
  );
}

/** Throws if `value` is not a valid code. Returns it typed otherwise. */
export function assertCode(value: unknown, label = 'code'): Code {
  if (!isValidCode(value)) throw new RangeError(`Invalid ${label}: ${String(value)}`);
  return value;
}

/** Bit mask of the digits present in a code. */
function digitMask(code: Code): number {
  let mask = 0;
  for (let i = 0; i < CODE_LENGTH; i++) mask |= 1 << (code.charCodeAt(i) - 48);
  return mask;
}

function popcount(n: number): number {
  let count = 0;
  while (n) {
    n &= n - 1;
    count++;
  }
  return count;
}

export interface DeadInjured {
  dead: number;
  injured: number;
}

/**
 * Dead and injured counts of `guess` against `secret`.
 * Both arguments must be valid codes. This is not re-checked, for speed:
 * callers at trust boundaries use {@link assertCode} or {@link isValidCode}.
 */
export function scoreParts(secret: Code, guess: Code): DeadInjured {
  let dead = 0;
  for (let i = 0; i < CODE_LENGTH; i++) {
    if (secret.charCodeAt(i) === guess.charCodeAt(i)) dead++;
  }
  const common = popcount(digitMask(secret) & digitMask(guess));
  return { dead, injured: common - dead };
}

/** Encodes dead and injured as dead * 10 + injured. */
export function encodeFeedback(dead: number, injured: number): Feedback {
  return dead * 10 + injured;
}

/** Splits a feedback value into dead and injured. Does not validate. */
export function decodeFeedback(feedback: Feedback): DeadInjured {
  return { dead: Math.floor(feedback / 10), injured: feedback % 10 };
}

/** Feedback of `guess` against `secret`, encoded as dead * 10 + injured. */
export function score(secret: Code, guess: Code): Feedback {
  const { dead, injured } = scoreParts(secret, guess);
  return encodeFeedback(dead, injured);
}

/**
 * The 14 feedback values that can occur: dead + injured <= 4, excluding 31
 * (3 dead and 1 injured is impossible with distinct digits).
 */
export const VALID_FEEDBACK: readonly Feedback[] = (() => {
  const values: Feedback[] = [];
  for (let dead = 0; dead <= CODE_LENGTH; dead++) {
    for (let injured = 0; dead + injured <= CODE_LENGTH; injured++) {
      if (dead === 3 && injured === 1) continue;
      values.push(encodeFeedback(dead, injured));
    }
  }
  return values;
})();

const VALID_FEEDBACK_SET: ReadonlySet<number> = new Set(VALID_FEEDBACK);

/** True for exactly the 14 feedback values that can occur. Rejects 31 and dead + injured > 4. */
export function isValidFeedback(value: unknown): value is Feedback {
  return typeof value === 'number' && Number.isInteger(value) && VALID_FEEDBACK_SET.has(value);
}

/** The seat that makes guess number `index` (0-based). Seat 0 guesses first. */
export function guesserOf(index: number): Seat {
  return (index % 2) as Seat;
}

/** The seat that answers guess number `index`. */
export function answererOf(index: number): Seat {
  return (1 - (index % 2)) as Seat;
}

/** The round (0-based) that guess number `index` belongs to. */
export function roundOf(index: number): number {
  return Math.floor(index / 2);
}
