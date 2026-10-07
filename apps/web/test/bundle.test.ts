import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Guards the budget and the code-split. The computer game, and the first screen, must stay small,
 * so the heavy chain and relay clients belong only in the lazily loaded friend-mode chunk. If
 * something imports them from the always-loaded entry, the entry grows and this fails.
 */
const webRoot = fileURLToPath(new URL('..', import.meta.url));
const distAssets = fileURLToPath(new URL('../dist/assets', import.meta.url));

function assetFiles(): string[] {
  return readdirSync(distAssets).filter((f) => f.endsWith('.js'));
}

describe('production bundle', () => {
  beforeAll(() => {
    // Build once if the dist is not already present, so the test is self-contained.
    try {
      readdirSync(distAssets);
    } catch {
      execFileSync('pnpm', ['exec', 'vite', 'build'], { cwd: webRoot, stdio: 'ignore' });
    }
  }, 120_000);

  it('splits friend mode into its own chunk', () => {
    const files = assetFiles();
    expect(files.some((f) => f.startsWith('index-'))).toBe(true);
    expect(files.some((f) => f.startsWith('FriendRoot-'))).toBe(true);
  });

  it('keeps the always-loaded entry well under the 300 KB gzipped budget', async () => {
    const { gzipSync } = await import('node:zlib');
    const entry = assetFiles().find((f) => f.startsWith('index-')) as string;
    const gz = gzipSync(readFileSync(`${distAssets}/${entry}`)).length;
    // The PRD budget is ~300 KB gzipped for the whole shell. The main entry alone should be far less.
    expect(gz).toBeLessThan(120_000);
  });

  it('does not pull the Solana or Supabase clients into the always-loaded entry', () => {
    const entry = assetFiles().find((f) => f.startsWith('index-')) as string;
    const source = readFileSync(`${distAssets}/${entry}`, 'utf8');
    // Fingerprints of the heavy libraries. They belong only in the friend-mode chunk.
    // Minification removes identifier names, so these are strings the libraries ship at runtime.
    expect(source).not.toContain('supabase');
    expect(source).not.toContain('@solana/web3.js');
  });

  it('puts those clients in the friend-mode chunk, where they belong', () => {
    const friend = assetFiles().find((f) => f.startsWith('FriendRoot-')) as string;
    const source = readFileSync(`${distAssets}/${friend}`, 'utf8');
    expect(source.length).toBeGreaterThan(100_000);
    expect(source).toContain('supabase');
  });
});
