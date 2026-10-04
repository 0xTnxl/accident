# Accident

Dead-and-Injured (Bulls and Cows) with a public Solana record. Two players each lock in a secret
4-digit number with a hash on Solana devnet, play through a signed realtime relay, then reveal.
Anyone can check afterwards that nobody lied. No custom Solana program, no money, devnet only.

> Status: early development for the Colosseum hackathon. The spec is in
> [`.kiro/specs/accident/`](.kiro/specs/accident/).

## How the game works

Each player picks 4 different digits (leading zero allowed). After each guess the opponent answers:

- **dead**: right digit, right position
- **injured**: right digit, wrong position

Example: secret `1964`, guess `2604` gives 1 dead, 1 injured. First to 4 dead wins.

## Honest limits

- The chain records and proves; the clients enforce. Timeouts are UI-only.
- Nothing can stop someone using a solver tool to answer for them.
- Practice mode (against the computer) is local and not provably fair.

## Repository layout

| Path                | What                                                           |
| ------------------- | -------------------------------------------------------------- |
| `packages/engine`   | Pure TypeScript rules, scoring, candidate filtering, computer. |
| `packages/protocol` | (planned) commitment, Memo records, signed messages, verdict.  |
| `apps/web`          | (planned) React PWA.                                           |
| `apps/relayer`      | (planned) devnet drip and analytics functions.                 |
| `apps/house-bot`    | (planned) always-online opponent that uses the real protocol.  |

## Development

Requires Node 22 and pnpm 11.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

## Licence

MIT. See [LICENSE](LICENSE).
