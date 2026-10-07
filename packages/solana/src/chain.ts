import type { Chain, Identity, MemoTx } from '@accident/protocol';
import { parseMemo } from '@accident/protocol';
import type {
  ConfirmedSignatureInfo,
  Connection,
  Finality,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
} from '@solana/web3.js';
import { Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';

/**
 * The Memo v2 program, the same on every cluster.
 * Confirmed against https://www.solana-program.com/docs/memo and on devnet (executable account).
 */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

/**
 * The one Memo instruction the game ever sends. The signer is listed as a signing account so the
 * Memo program verifies the signature and records who signed. Shared by `sendMemo` and the
 * devnet simulation script so they can never drift apart.
 */
export function memoInstruction(signer: PublicKey, text: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: Buffer.from(text, 'utf8'),
  });
}

/** The parts of `Connection` the adapter uses, so tests can supply a fake. */
export type RpcConnection = Pick<
  Connection,
  | 'getLatestBlockhash'
  | 'sendRawTransaction'
  | 'getParsedTransaction'
  | 'getSignaturesForAddress'
  | 'getParsedTransactions'
>;

export interface SolanaChainOptions {
  connection: RpcConnection;
  /** How final a transaction must be. `confirmed` is enough for a game with no money at stake. */
  commitment?: Finality;
  /** How many recent signatures of an address to scan when auditing. */
  scanLimit?: number;
}

/**
 * Memo-only Solana access for the session.
 *
 * Reads are deliberately strict: a transaction only counts if it succeeded, the Memo instruction
 * belongs to the real Memo program, there is exactly one Memo instruction, and the signer is the
 * transaction's fee payer. A Memo written by a different program that merely logs similar text,
 * or an extra Memo smuggled into the same transaction, is never accepted.
 */
export class SolanaChain implements Chain {
  private readonly connection: RpcConnection;
  private readonly commitment: Finality;
  private readonly scanLimit: number;

  constructor(options: SolanaChainOptions) {
    this.connection = options.connection;
    this.commitment = options.commitment ?? 'confirmed';
    this.scanLimit = options.scanLimit ?? 100;
  }

  /**
   * Signs and submits a Memo transaction, returning its signature as soon as it is accepted by the
   * cluster. Confirmation is checked separately by `getMemoTx`, which is what the play gate uses.
   */
  async sendMemo(signer: Identity, text: string): Promise<string> {
    const keypair = Keypair.fromSecretKey(signer.secretKey);
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(
      this.commitment,
    );
    const transaction = new Transaction({
      feePayer: keypair.publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(memoInstruction(keypair.publicKey, text));
    transaction.sign(keypair);
    return this.connection.sendRawTransaction(transaction.serialize(), {
      preflightCommitment: this.commitment,
    });
  }

  async getMemoTx(sig: string): Promise<MemoTx | null> {
    const tx = await this.connection.getParsedTransaction(sig, {
      commitment: this.commitment,
      maxSupportedTransactionVersion: 0,
    });
    return tx ? (toMemoTx(sig, tx) ?? null) : null;
  }

  async listMemoTxs(address: string, room: string): Promise<MemoTx[]> {
    const infos: ConfirmedSignatureInfo[] = await this.connection.getSignaturesForAddress(
      new PublicKey(address),
      { limit: this.scanLimit },
      this.commitment,
    );
    // Only transactions whose memo field already names this room are worth fetching in full.
    const candidates = infos.filter((info) => info.memo?.includes(`|${room}|`) ?? false);
    if (candidates.length === 0) return [];
    const parsed = await this.connection.getParsedTransactions(
      candidates.map((info) => info.signature),
      {
        commitment: this.commitment,
        maxSupportedTransactionVersion: 0,
      },
    );
    const out: MemoTx[] = [];
    parsed.forEach((tx, i) => {
      const sig = (candidates[i] as ConfirmedSignatureInfo).signature;
      const memoTx = tx ? toMemoTx(sig, tx) : undefined;
      if (memoTx && memoTx.signer === address && parseMemo(memoTx.text)?.room === room) {
        out.push(memoTx);
      }
    });
    return out;
  }
}

type AnyInstruction = ParsedInstruction | PartiallyDecodedInstruction;

function isMemoInstruction(instruction: AnyInstruction): boolean {
  return instruction.programId.equals(MEMO_PROGRAM_ID);
}

/** The memo text of an instruction, whichever way the RPC node decoded it. */
function memoText(instruction: AnyInstruction): string | undefined {
  if ('parsed' in instruction) {
    return typeof instruction.parsed === 'string' ? instruction.parsed : undefined;
  }
  return undefined;
}

/**
 * Converts an RPC transaction into a `MemoTx`, or `undefined` if it is not exactly one genuine
 * Memo instruction from the Memo program.
 */
export function toMemoTx(sig: string, tx: ParsedTransactionWithMeta): MemoTx | undefined {
  const instructions = tx.transaction.message.instructions;
  const memos = instructions.filter(isMemoInstruction);
  if (memos.length !== 1) return undefined;
  const text = memoText(memos[0] as AnyInstruction);
  if (text === undefined) return undefined;
  const payer = tx.transaction.message.accountKeys.find((key) => key.signer);
  if (!payer) return undefined;
  return {
    sig,
    signer: payer.pubkey.toBase58(),
    text,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    ok: tx.meta?.err == null,
  };
}
