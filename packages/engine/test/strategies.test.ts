import { describe, expect, it } from 'vitest';
import {
  EASY_RANDOM_RATE,
  OPENING_GUESS,
  allCodes,
  candidatesFromHistory,
  chooseGuess,
  chooseGuessHard,
  mulberry32,
  score,
} from '../src/index.js';
import { simulate, solve } from './helpers.js';

describe('chooseGuess', () => {
  it.each(['easy', 'medium', 'hard'] as const)(
    '%s opens with 0123 when nothing is known',
    (level) => {
      expect(chooseGuess(level, allCodes(), mulberry32(1))).toBe(OPENING_GUESS);
      expect(OPENING_GUESS).toBe('0123');
    },
  );

  it.each(['easy', 'medium', 'hard'] as const)(
    '%s returns undefined when answers were inconsistent',
    (level) => {
      expect(chooseGuess(level, [], mulberry32(1))).toBeUndefined();
    },
  );

  it('medium only ever picks consistent codes', () => {
    const rng = mulberry32(3);
    const history = [{ guess: '0123', feedback: score('1964', '0123') }];
    const candidates = candidatesFromHistory(history);
    for (let i = 0; i < 200; i++) {
      expect(candidates).toContain(chooseGuess('medium', candidates, rng));
    }
  });

  it('easy picks a code outside the candidates about 35% of the time or fewer', () => {
    const rng = mulberry32(4);
    const candidates = candidatesFromHistory([{ guess: '0123', feedback: score('1964', '0123') }]);
    const set = new Set(candidates);
    let outside = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      if (!set.has(chooseGuess('easy', candidates, rng)!)) outside++;
    }
    // Random codes land outside the candidate set most of the time, so the rate is at most EASY_RANDOM_RATE.
    expect(outside / trials).toBeLessThanOrEqual(EASY_RANDOM_RATE + 0.03);
    expect(outside / trials).toBeGreaterThan(0.2);
  });

  it('hard is deterministic', () => {
    const candidates = candidatesFromHistory([{ guess: '0123', feedback: score('1964', '0123') }]);
    expect(chooseGuess('hard', candidates, mulberry32(1))).toBe(
      chooseGuess('hard', candidates, mulberry32(999)),
    );
  });

  it('hard returns the only candidate, or the smallest of two', () => {
    expect(chooseGuessHard(['4321'])).toBe('4321');
    expect(chooseGuessHard(['1234', '4321'])).toBe('1234');
  });

  it('hard never increases the worst-case bucket versus a random consistent guess', () => {
    const candidates = candidatesFromHistory([{ guess: '0123', feedback: score('1964', '0123') }]);
    const worst = (guess: string): number => {
      const counts = new Map<number, number>();
      for (const s of candidates)
        counts.set(score(s, guess), (counts.get(score(s, guess)) ?? 0) + 1);
      return Math.max(...counts.values());
    };
    const hard = chooseGuessHard(candidates);
    const rng = mulberry32(8);
    for (let i = 0; i < 50; i++) {
      const other = candidates[Math.floor(rng() * candidates.length)]!;
      expect(worst(hard)).toBeLessThanOrEqual(worst(other));
    }
  });
});

describe('solving every secret', () => {
  it('hard averages at most 5.4 guesses with a worst case of at most 8 (all 5,040 secrets)', () => {
    const { average, worst } = simulate('hard', mulberry32(1));
    expect(average).toBeLessThanOrEqual(5.4);
    expect(worst).toBeLessThanOrEqual(8);
  }, 120_000);

  it('medium solves every secret, averaging close to the measured 5.47', () => {
    const { average, worst } = simulate('medium', mulberry32(2));
    expect(average).toBeGreaterThan(5.2);
    expect(average).toBeLessThan(5.7);
    expect(worst).toBeLessThanOrEqual(12);
  }, 120_000);

  it('easy solves every secret, averaging close to the measured 6.3', () => {
    const { average } = simulate('easy', mulberry32(3));
    expect(average).toBeGreaterThan(6.0);
    expect(average).toBeLessThan(6.6);
  }, 120_000);

  it('every level finds a specific secret', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      expect(solve(level, '0987', mulberry32(10))).toBeGreaterThan(0);
    }
  });
});
