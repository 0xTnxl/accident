/** A source of uniform numbers in [0, 1), like Math.random. */
export type Rng = () => number;

/** Small deterministic generator for tests and reproducible simulations. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, n). */
export function randomInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Picks a uniformly random element. Throws on an empty array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('Cannot pick from an empty array');
  return items[randomInt(rng, items.length)] as T;
}
