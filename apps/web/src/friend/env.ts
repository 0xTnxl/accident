import type { BackendEnv } from './backend.js';

/** The build-time configuration, read once from Vite's environment. */
export function readEnv(): BackendEnv {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    VITE_BACKEND: env.VITE_BACKEND,
    VITE_SOLANA_RPC_URL: env.VITE_SOLANA_RPC_URL,
    VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    VITE_DRIP_URL: env.VITE_DRIP_URL,
  };
}
