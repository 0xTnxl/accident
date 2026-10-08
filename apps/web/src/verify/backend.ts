import type { Chain } from '@accident/protocol';
import { SolanaChain } from '@accident/solana';
import { Connection } from '@solana/web3.js';
import { DEFAULT_RPC } from '../friend/backend.js';
import { readEnv } from '../friend/env.js';

/**
 * Builds the read-only Solana chain the Verifier uses to fetch reveal and commit Memos. It mirrors
 * the live wiring in friend/backend.ts. @solana/web3.js is imported here so this module, loaded
 * only by the lazily imported VerifierPage, keeps the heavy client out of the always-loaded entry.
 */
export function createVerifierChain(): Chain {
  const env = readEnv();
  return new SolanaChain({
    connection: new Connection(env.VITE_SOLANA_RPC_URL || DEFAULT_RPC, 'confirmed'),
  });
}

/** Where to send someone to see a transaction on the devnet explorer. */
export function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
