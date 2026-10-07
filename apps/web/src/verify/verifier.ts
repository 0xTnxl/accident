import type {
  Chain,
  ChainCommit,
  ChainReveal,
  MemoTx,
  RevealMemo,
  Transcript,
  Verdict,
} from '@accident/protocol';
import {
  assembleTranscript,
  decodeBody,
  finalise,
  isValidRoom,
  parseMemo,
  selectCommit,
  toChainCommit,
  transcriptHash,
} from '@accident/protocol';

/** What the Verifier is given: a parsed transcript file and the two reveal tx signatures. */
export interface VerifyInput {
  /** The parsed export file, expected shape `{ room: string, messages: SignedMessage[] }`. */
  transcript: unknown;
  /** The reveal transaction signatures, aligned to seat 0 (host) and seat 1 (guest). */
  revealSigs: readonly [string, string];
}

/** Whether a seat's reveal Memo carried a transcript hash and whether it matched. */
export interface HashCheck {
  /** True when the reveal Memo carried a `T` field (v1.1 reveals carry none). */
  present: boolean;
  /** True when the `T` field equals the recomputed transcript hash. */
  matches: boolean;
}

/** The structured outcome of a verification. Never thrown, always returned. */
export type VerifyResult =
  | {
      ok: true;
      verdict: Verdict;
      transcript: Transcript;
      /** The commit tx signature used per seat, for the public-records display. */
      commitSigs: readonly [string | undefined, string | undefined];
      /** The reveal tx signature kept per seat (undefined when the Memo was missing). */
      revealSigs: readonly [string | undefined, string | undefined];
      /** The transcript-hash anchor check per seat. A mismatch is a dispute, not a fault. */
      hashCheck: readonly [HashCheck, HashCheck];
      /** Why messages were dropped while assembling the transcript, for display. */
      ignored: readonly string[];
    }
  | { ok: false; error: string };

const SEATS = [0, 1] as const;

interface FetchedReveal {
  memo: RevealMemo;
  tx: MemoTx;
}

/**
 * Verifies a finished game from its transcript file and the two reveal transaction signatures,
 * following design.md section 5.4. Pure data in, structured result out: it fetches the Memos and
 * reads the chain through the injected {@link Chain} port, so tests pass a MemoryChain and the
 * page passes a SolanaChain. It never throws on malformed user input.
 */
export async function verifyGame(
  input: VerifyInput,
  deps: { chain: Chain },
): Promise<VerifyResult> {
  const { chain } = deps;

  // (1) Parse and validate the transcript file.
  const file = input.transcript;
  if (typeof file !== 'object' || file === null || Array.isArray(file)) {
    return { ok: false, error: 'The transcript file must be a JSON object.' };
  }
  const { room, messages } = file as { room?: unknown; messages?: unknown };
  if (!isValidRoom(room)) {
    return { ok: false, error: 'The transcript file has no valid room code.' };
  }
  if (!Array.isArray(messages)) {
    return { ok: false, error: 'The transcript file has no messages array.' };
  }

  // (2) Build the transcript. assembleTranscript checks every signature and drops forgeries,
  // strangers and equivocation, recording why in `ignored`.
  const assembled = assembleTranscript(room, messages as readonly unknown[]);
  if (!assembled.ok) {
    return { ok: false, error: assembled.reason };
  }
  const transcript = assembled.transcript;

  // (3) Fetch both reveal Memos. Anything missing, failed, not a reveal or for another room
  // counts as no reveal for that seat.
  const fetched: [FetchedReveal | undefined, FetchedReveal | undefined] = [undefined, undefined];
  for (const seat of SEATS) {
    fetched[seat] = await fetchReveal(chain, input.revealSigs[seat], room);
  }

  // (4) Resolve the canonical commit per seat via the earliest-commit on-chain rule, falling back
  // to the COMMIT tx signature named in the transcript when the address scan finds nothing.
  const commits: [ChainCommit | undefined, ChainCommit | undefined] = [undefined, undefined];
  const commitSigs: [string | undefined, string | undefined] = [undefined, undefined];
  for (const seat of SEATS) {
    const resolved = await resolveCommit(chain, transcript, seat);
    commits[seat] = resolved.commit;
    commitSigs[seat] = resolved.sig;
  }

  // (5) Build each seat's reveal from the fetched Memo. The verifier is given one reveal per seat,
  // so there is no conflict to flag; the signer comes from the fetched transaction so finalise's
  // reveal-signer-mismatch check is meaningful.
  const reveals: [ChainReveal | undefined, ChainReveal | undefined] = [undefined, undefined];
  const revealSigs: [string | undefined, string | undefined] = [undefined, undefined];
  for (const seat of SEATS) {
    const got = fetched[seat];
    if (!got) continue;
    reveals[seat] = {
      secret: got.memo.secret,
      salt: got.memo.salt,
      signer: got.tx.signer,
      conflicting: false,
    };
    revealSigs[seat] = got.tx.sig;
  }

  // (6) Compare the transcript hash to the `T` field each reveal Memo carried. A mismatch is a
  // dispute, not a finalise fault (design 5.3): the verdict depends only on signed messages and
  // chain data, not on the anchor.
  const hash = await transcriptHash(transcript);
  const hashCheck: [HashCheck, HashCheck] = [
    hashCheckFor(fetched[0], hash),
    hashCheckFor(fetched[1], hash),
  ];

  // (7) Run finalise over the completed game.
  const verdict = await finalise({
    transcript,
    commits,
    reveals,
    revealWindowClosed: true,
  });

  return {
    ok: true,
    verdict,
    transcript,
    commitSigs,
    revealSigs,
    hashCheck,
    ignored: transcript.ignored,
  };
}

/** Fetches one reveal Memo and keeps it only when it is a reveal for this room. */
async function fetchReveal(
  chain: Chain,
  sig: string,
  room: string,
): Promise<FetchedReveal | undefined> {
  let tx: MemoTx | null;
  try {
    tx = await chain.getMemoTx(sig);
  } catch {
    return undefined;
  }
  if (!tx || !tx.ok) return undefined;
  const memo = parseMemo(tx.text);
  if (memo?.kind !== 'reveal' || memo.room !== room) return undefined;
  return { memo, tx };
}

/**
 * Resolves the commit that counts for a seat. Prefers the earliest-commit on-chain rule by
 * scanning the player's address; if that finds nothing but the transcript named a COMMIT tx,
 * fetches that single transaction and selects over it.
 */
async function resolveCommit(
  chain: Chain,
  transcript: Transcript,
  seat: 0 | 1,
): Promise<{ commit: ChainCommit | undefined; sig: string | undefined }> {
  const address = transcript.players[seat];
  let scanned: readonly MemoTx[];
  try {
    scanned = await chain.listMemoTxs(address, transcript.room);
  } catch {
    scanned = [];
  }
  let canonical = selectCommit(scanned, transcript.room, address);

  if (!canonical) {
    const named = namedCommitSig(transcript, seat);
    if (named !== undefined) {
      const single = await fetchCommitTx(chain, named);
      if (single) canonical = selectCommit([single], transcript.room, address);
    }
  }

  return { commit: toChainCommit(canonical), sig: canonical?.tx.sig };
}

/** The COMMIT tx signature named by a seat's COMMIT message in the transcript, if any. */
function namedCommitSig(transcript: Transcript, seat: 0 | 1): string | undefined {
  const message = transcript.commits[seat];
  if (!message) return undefined;
  const body = decodeBody('COMMIT', message.payload);
  return body?.type === 'COMMIT' ? body.txSig : undefined;
}

async function fetchCommitTx(chain: Chain, sig: string): Promise<MemoTx | undefined> {
  try {
    const tx = await chain.getMemoTx(sig);
    return tx ?? undefined;
  } catch {
    return undefined;
  }
}

function hashCheckFor(fetched: FetchedReveal | undefined, hash: string): HashCheck {
  const anchor = fetched?.memo.transcriptHash;
  if (anchor === undefined) return { present: false, matches: false };
  return { present: true, matches: anchor === hash };
}
