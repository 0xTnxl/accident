// Replaces the two Vercel functions in the repo-root api/ folder with self-contained, pre-bundled
// JS, as a Vercel build step (see vercel.json). Only Vercel's own ephemeral build checkout should
// run this: it deletes api/drip.ts and api/event.ts from the working copy it runs in. Running it
// against a local clone works the same way and is recoverable with `git checkout -- api/`, but is
// not something a normal local `pnpm install && pnpm test` workflow ever needs to do.
//
// Why: the relayer's own code (apps/relayer/src) and the workspace packages it imports
// (@accident/protocol, @accident/engine) are consumed as raw TypeScript via each package's
// `exports` field. That works for every bundler-based tool in this repo (Vite, vitest, tsx), but
// Vercel's Node.js function runtime does not bundle `node_modules` imports, including pnpm's
// symlinked workspace packages: it leaves them to Node's native ESM resolver at runtime, which
// cannot load a `.ts` file. That produced ERR_MODULE_NOT_FOUND on every request once deployed.
//
// Bundling the whole dependency closure into the function itself sidesteps that: there is nothing
// left for Node to resolve at runtime at all. @solana/web3.js and @supabase/supabase-js are
// bundled too, not kept external: the output replaces api/*.ts at the repo root (see below), which
// has no node_modules of its own for an external import to resolve against (pnpm does not hoist
// either package to the workspace root; only apps/relayer and apps/web depend on them directly).
// Both ship pure JS with no native or wasm bindings, confirmed before bundling, which is the one
// thing that would make inlining them risky.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const entries = ['drip', 'event'];

await Promise.all(
  entries.map((name) =>
    build({
      absWorkingDir: root,
      entryPoints: [`apps/relayer/api/${name}.ts`],
      outfile: `api/${name}.js`,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'info',
    }),
  ),
);

// The .js output above now sits next to the .ts source for the same route. Vercel rejects two
// function files that share a name once their extension is dropped, so the .ts source is removed
// here, after a successful bundle, leaving only the compiled .js to deploy.
for (const name of entries) {
  rmSync(fileURLToPath(new URL(`../../../api/${name}.ts`, import.meta.url)));
}
