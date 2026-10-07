import type { Chain, Transport } from '@accident/protocol';
import { SolanaChain } from '@accident/solana';
import { Connection, PublicKey } from '@solana/web3.js';
import { createClient } from '@supabase/supabase-js';
import { SimChain } from './simChain.js';
import { SupabaseTransport, TabTransport } from './transports.js';

/** Which services friend mode talks to. */
export type BackendKind = 'live' | 'sim';

export interface Backend {
  kind: BackendKind;
  /** A new transport for one game. */
  transport(): Transport;
  chain: Chain;
  /** Where to send a player to see a transaction. Undefined in simulation. */
  explorerUrl(signature: string): string | undefined;
  /** Asks for a little devnet SOL for a new key. Simulation needs none. */
  fund(publicKey: string): Promise<FundResult>;
}

export type FundResult = { ok: true; alreadyFunded: boolean } | { ok: false; reason: string };

export interface BackendEnv {
  VITE_BACKEND?: string | undefined;
  VITE_SOLANA_RPC_URL?: string | undefined;
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_ANON_KEY?: string | undefined;
  VITE_DRIP_URL?: string | undefined;
}

export const DEFAULT_RPC = 'https://api.devnet.solana.com';

/** What is missing for the live backend, so the UI can say exactly what to configure. */
export function missingConfig(env: BackendEnv): string[] {
  const missing: string[] = [];
  if (!env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!env.VITE_SUPABASE_ANON_KEY) missing.push('VITE_SUPABASE_ANON_KEY');
  return missing;
}

/** Which backend to use: simulation only when asked for; otherwise live. */
export function backendKind(env: BackendEnv): BackendKind {
  return env.VITE_BACKEND === 'sim' ? 'sim' : 'live';
}

/**
 * Asks the drip service for devnet SOL. It is the only server this app talks to besides the relay
 * and the RPC, and it only ever sends worthless test tokens.
 */
export async function requestDrip(
  dripUrl: string,
  publicKey: string,
  fetcher: typeof fetch = fetch,
): Promise<FundResult> {
  try {
    const response = await fetcher(dripUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubkey: publicKey }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      funded?: boolean;
      error?: string;
    };
    if (response.ok && body.ok) return { ok: true, alreadyFunded: body.funded === false };
    return { ok: false, reason: body.error ?? `The funding service answered ${response.status}` };
  } catch {
    return { ok: false, reason: 'Could not reach the funding service' };
  }
}

export function createBackend(env: BackendEnv): Backend {
  if (backendKind(env) === 'sim') {
    return {
      kind: 'sim',
      transport: () => new TabTransport(),
      chain: new SimChain(),
      explorerUrl: () => undefined,
      fund: async () => ({ ok: true, alreadyFunded: true }),
    };
  }

  const missing = missingConfig(env);
  if (missing.length > 0) {
    throw new Error(`Friend mode is not configured. Missing: ${missing.join(', ')}`);
  }
  const connection = new Connection(env.VITE_SOLANA_RPC_URL || DEFAULT_RPC, 'confirmed');
  const realtime = createClient(
    env.VITE_SUPABASE_URL as string,
    env.VITE_SUPABASE_ANON_KEY as string,
    {
      realtime: { params: { eventsPerSecond: 10 } },
    },
  );
  const dripUrl = env.VITE_DRIP_URL ?? '/api/drip';

  return {
    kind: 'live',
    transport: () => new SupabaseTransport(realtime),
    chain: new SolanaChain({ connection }),
    explorerUrl: (signature) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
    async fund(publicKey) {
      const balance = await connection.getBalance(new PublicKey(publicKey), 'confirmed');
      // Four Memo transactions cost 0.00002 SOL. Anything above a small floor is plenty.
      if (balance >= MIN_BALANCE_LAMPORTS) return { ok: true, alreadyFunded: true };
      return requestDrip(dripUrl, publicKey);
    },
  };
}

/** Enough for about 100 transactions at 5,000 lamports each. */
export const MIN_BALANCE_LAMPORTS = 500_000;
