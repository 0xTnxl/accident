import type { Code, Level, Rng, Turn } from '@accident/engine';
import { candidatesFromHistory, chooseGuess, OPENING_GUESS, secureRng } from '@accident/engine';
import type {
  Chain,
  Clock,
  Identity,
  Role,
  SessionOptions,
  SessionView,
  Storage,
  Transport,
} from '@accident/protocol';
import { Session } from '@accident/protocol';
import type { Choice } from './secret.js';
import { makeChoice } from './secret.js';

/**
 * Picks an honest guess from a view, exactly as the proven harness `autoplay` does: keep only the
 * bot's own answered turns, narrow the still-consistent codes, and ask the engine to choose.
 *
 * Returns {@link OPENING_GUESS} when nothing is consistent, which happens only if the opponent lied
 * (the answers contradict each other). The honest bot keeps playing a valid code so the game can
 * still reach finalisation, where the lie is caught; it never gets stuck.
 */
export function chooseHonestGuess(view: SessionView, level: Level, rng: Rng): Code {
  const history: Turn[] = view.guesses
    .map((guess, index) => ({ guess, index }))
    .filter(({ index }) => index % 2 === view.seat && view.answers[index] !== undefined)
    .map(({ guess, index }) => ({ guess, feedback: view.answers[index] as number }));
  return chooseGuess(level, candidatesFromHistory(history), rng) ?? OPENING_GUESS;
}

/**
 * How to build a {@link HouseBot}. Everything the protocol {@link Session} needs, plus the two
 * knobs that shape the bot's play: its difficulty `level` and its guess `rng`.
 *
 * The bot drives the real protocol. It does not re-implement any of it: funding happens before the
 * bot is built (a no-op in tests), while commit, the play gate, honest auto-answering and reveal
 * all come from the Session. The bot only chooses guesses, with the same engine the web Client uses.
 */
export interface HouseBotConfig {
  room: string;
  role: Role;
  identity: Identity;
  /** The secret and salt to commit to. Defaults to a fresh {@link makeChoice}. */
  choice?: Choice;
  /** Guests may pin the host's key from the share link. */
  hostKey?: string;
  /** Guessing difficulty. Default 'medium'. */
  level?: Level;
  /** Source of randomness for guess selection. Default {@link secureRng}; tests inject a seed. */
  rng?: Rng;
  transport: Transport;
  chain: Chain;
  storage: Storage;
  clock: Clock;
  options?: Partial<SessionOptions>;
}

/**
 * An honest Node House Bot. It owns one protocol {@link Session} and, whenever the view says it
 * may guess, picks a code that is still consistent with every answer it has received and submits
 * it. All other protocol behaviour (commit, gate, auto-answer, reveal, finalisation) is the
 * Session's, so the bot plays by exactly the same rules as a human Client.
 */
export class HouseBot {
  private readonly session: Session;
  private readonly level: Level;
  private readonly rng: Rng;
  /** The length of `guesses` at the last submission, so each turn is answered once. */
  private submitted = -1;
  private unsubscribe: (() => void) | undefined;
  /** Errors from a background guess that could not be submitted, surfaced for inspection. */
  readonly errors: unknown[] = [];

  constructor(config: HouseBotConfig) {
    const choice = config.choice ?? makeChoice(config.rng);
    this.level = config.level ?? 'medium';
    this.rng = config.rng ?? secureRng();
    this.session = Session.create({
      room: config.room,
      role: config.role,
      identity: config.identity,
      secret: choice.secret,
      saltHex: choice.saltHex,
      ...(config.hostKey === undefined ? {} : { hostKey: config.hostKey }),
      transport: config.transport,
      chain: config.chain,
      storage: config.storage,
      clock: config.clock,
      options: config.options ?? {},
    });
  }

  /** Joins the room and begins playing. Guesses are made automatically as turns come up. */
  async start(): Promise<void> {
    this.unsubscribe = this.session.subscribe((view) => this.onView(view));
    await this.session.start();
    this.onView(this.session.view());
  }

  /** The latest view of the game. */
  view(): SessionView {
    return this.session.view();
  }

  /** The signed messages of the game so far, as wire strings. */
  transcript(): string[] {
    return this.session.transcript();
  }

  /** Watches the game. Returns a function that stops watching. */
  subscribe(listener: (view: SessionView) => void): () => void {
    return this.session.subscribe(listener);
  }

  /** Leaves the room and stops the bot. The saved game stays so it could be resumed. */
  async close(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.session.close();
  }

  /**
   * Guesses when it is the bot's turn. Mirrors the proven harness `autoplay`: build the bot's own
   * answered turns from the view, narrow the candidates, and ask the engine for a move.
   */
  private onView(view: SessionView): void {
    if (!view.canGuess || view.guesses.length === this.submitted) return;
    this.submitted = view.guesses.length;
    const guess = chooseHonestGuess(view, this.level, this.rng);
    void this.session.submitGuess(guess).catch((error: unknown) => this.errors.push(error));
  }
}
