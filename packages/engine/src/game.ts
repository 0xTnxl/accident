import type { Code, Feedback, Seat } from './rules.js';
import {
  MAX_GUESSES,
  WIN_FEEDBACK,
  answererOf,
  guesserOf,
  isValidFeedback,
  roundOf,
  score,
} from './rules.js';

export type Result = 'seat0' | 'seat1' | 'draw';

export type GameStatus =
  | {
      over: false;
      /** Seat that must guess next. */
      next: Seat;
      /** Index of the next guess (0-based). */
      index: number;
      /** True when seat 1 is making its final guess after seat 0 already hit. */
      finalGuess: boolean;
    }
  | {
      over: true;
      result: Result;
      reason: 'first-hit' | 'equal-round' | 'final-guess-missed' | 'cap';
    };

/**
 * Status of a game from the feedback values claimed so far.
 *
 * `feedbacks[i]` is the answer to guess `i`. Guess `i` is made by seat `i % 2`,
 * so seat 0 guesses first. Rules (PRD section 4):
 * - Seat 1 hits first: game ends at once, seat 1 wins.
 * - Seat 0 hits first: seat 1 gets one final guess. If it also hits, draw; otherwise seat 0 wins.
 * - 24 answered guesses with no decision: draw.
 *
 * This works on claimed feedback and so is used for live play. After the reveal, lies are
 * found by {@link verdictFromSecrets} and the protocol finalisation.
 *
 * Throws on invalid feedback or on guesses recorded after the game ended.
 */
export function gameStatus(feedbacks: readonly Feedback[]): GameStatus {
  let seat0HitIndex: number | undefined;

  for (let i = 0; i < feedbacks.length; i++) {
    const feedback = feedbacks[i];
    if (!isValidFeedback(feedback)) {
      throw new RangeError(`Invalid feedback at index ${i}: ${String(feedback)}`);
    }
    const hit = feedback === WIN_FEEDBACK;
    const seat = guesserOf(i);

    let terminal: GameStatus | undefined;
    if (hit && seat === 1) {
      terminal =
        seat0HitIndex !== undefined && roundOf(seat0HitIndex) === roundOf(i)
          ? { over: true, result: 'draw', reason: 'equal-round' }
          : { over: true, result: 'seat1', reason: 'first-hit' };
    } else if (hit && seat === 0) {
      seat0HitIndex = i;
    } else if (!hit && seat === 1 && seat0HitIndex !== undefined) {
      terminal = { over: true, result: 'seat0', reason: 'final-guess-missed' };
    }

    if (!terminal && i === MAX_GUESSES - 1) {
      terminal = { over: true, result: 'draw', reason: 'cap' };
    }

    if (terminal) {
      if (i !== feedbacks.length - 1) {
        throw new RangeError(`Guess recorded after the game ended (index ${i + 1})`);
      }
      return terminal;
    }
  }

  return {
    over: false,
    next: guesserOf(feedbacks.length),
    index: feedbacks.length,
    finalGuess: seat0HitIndex !== undefined,
  };
}

/**
 * Finds each seat's first guess equal to the opponent's revealed secret.
 * `guesses[i]` is made by seat `i % 2`. `secrets[s]` is the secret of seat `s`.
 * Returns `[seat0HitIndex, seat1HitIndex]`, with `undefined` where a seat never hit.
 */
export function findHits(
  guesses: readonly Code[],
  secrets: readonly [Code, Code],
): [number | undefined, number | undefined] {
  const hits: [number | undefined, number | undefined] = [undefined, undefined];
  for (let i = 0; i < guesses.length; i++) {
    const seat = guesserOf(i);
    if (hits[seat] === undefined && guesses[i] === secrets[answererOf(i)]) {
      hits[seat] = i;
    }
  }
  return hits;
}

/**
 * Winner by true hits, from the revealed secrets and the guesses made (PRD 6.6 step 5).
 * Both hit: lower round wins, equal rounds draw. One hit: that seat wins. No hit: draw.
 * This ignores lies. The protocol checks answers separately and applies faults first.
 */
export function verdictFromSecrets(
  guesses: readonly Code[],
  secrets: readonly [Code, Code],
): Result {
  const [hit0, hit1] = findHits(guesses, secrets);
  if (hit0 !== undefined && hit1 !== undefined) {
    const r0 = roundOf(hit0);
    const r1 = roundOf(hit1);
    if (r0 === r1) return 'draw';
    return r0 < r1 ? 'seat0' : 'seat1';
  }
  if (hit0 !== undefined) return 'seat0';
  if (hit1 !== undefined) return 'seat1';
  return 'draw';
}

/**
 * Indices of answers that contradict the answerer's revealed secret.
 * `answers[i]` is the claimed feedback for `guesses[i]`. Only indices answered by `seat` are checked.
 * Returns the indices whose claimed feedback differs from the true score.
 */
export function findLies(
  guesses: readonly Code[],
  answers: readonly Feedback[],
  seat: Seat,
  secret: Code,
): number[] {
  const lies: number[] = [];
  const n = Math.min(guesses.length, answers.length);
  for (let i = 0; i < n; i++) {
    if (answererOf(i) !== seat) continue;
    const guess = guesses[i];
    if (guess === undefined || score(secret, guess) !== answers[i]) lies.push(i);
  }
  return lies;
}
