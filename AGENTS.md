# AGENTS.md — homebridge-skybell (standalone repo)

Instructions for coding agents. Humans: read PROJECT.md first.

## Read before you write anything
1. `PROJECT.md` — what we build and why, and who to ask.
2. `ARCHITECTURE.md` — the boxes and their names.
3. `CONSTITUTION.md` — non-negotiable rules.
4. `CONTRACTS/` — what each repo promises the others.
5. `DECISIONS/` — RFCs (proposals, approved or not) and the ADRs they left behind.

## Tooling defaults
- Python repos use `uv` (`uv add`, `uv sync`, `uv run`) — never `pip`. Each repo commits its own `uv.lock`.
- Each repo records its code layout (`groundwork.py layout`, run inside it): the GroundWork standard folders, or "keep" —
  its own structure, where new code follows the existing patterns. Follow what the repo recorded.

## Code quality
Run `groundwork.py verify` after every change (it runs the commands below) and fix what fails. Never weaken a rule,
add an ignore comment or skip a test to make it pass; an ignore needs a reason on the same line.

- format: `npm --prefix media-gateway run format:check`
- lint: `npm --prefix media-gateway run lint`
- types: `npm --prefix media-gateway run typecheck`
- test: `npm --prefix media-gateway test`

1. Reuse before writing: look in CODEMAP.md and search for an existing function first. Never copy-paste a block.
2. Make the smallest change that meets the spec. No speculative abstractions, options or layers.
3. Never swallow errors (no empty catch, no blind `except Exception`). Handle them at the entry point.
4. Validate input where it enters (routes, commands, consumers). Parameterised SQL only; no shell built from input.
5. Add a dependency only with the package manager, after checking it exists and is maintained; prefer what is already used.
6. Comments say why, never what. No commented-out code; no TODO without a tracked item.
7. Names come from the domain (PROJECT.md glossary); no Manager/Helper/Util names.
8. Test behaviour through public functions; mock only connectors to outside systems. A test must fail when the code is wrong.
9. Log through the project's logger, never print in core code, and never log secrets or personal data.
10. Keep files under the size limit and functions short; split by responsibility.

## Working across repos
- This is a standalone repo; there are no sibling repos. Contracts between server and web live in the feature spec.

## Process (enforced by the groundwork plugin)
Interview → RFC → human approval → spec → plan → tasks → evals → implement → handover.
You cannot approve documents; only the user can, with `/groundwork-specflow:approve`.

## Repositories
- homebridge-skybell — `.` — legacy Homebridge plugin (root `*.js`, frozen) and the media gateway (`media-gateway/`).

## Where code lives
Read `CODEMAP.md` first. Legacy plugin = root `*.js` (do not edit). Gateway server = `media-gateway/server/src`
(standard layout: `core/`, `connectors/<system>/`, `entrypoints/http/`, `config/`, wiring in `main.ts`).
Gateway web = `media-gateway/web/src` (React; talks only to the server's REST API and MediaMTX).

## Commands (run in `media-gateway/`)
- Install: `npm ci` (add deps with `npm install -w server|web <pkg>`; dev tools shared at the root with `npm install -D`)
- Test: `npm test` · Lint: `npm run lint` (`lint:fix`) · Types: `npm run typecheck` · Format: `npm run format:check` (`format`)
- End-to-end (real MediaMTX + FFmpeg, fake source): `MEDIAMTX_BIN=/path/to/mediamtx npm run test:e2e -w server`
- Run the stack: `cp .env.example .env`, fill it in, `docker compose up -d --build`

## Conventions agents get wrong
- Node 22 + npm workspaces inside `media-gateway/`; never add deps to the root `package.json` (that is the legacy plugin).
- TypeScript strict, ESM. Tests next to the code as `*.test.ts(x)`, run with Vitest. Write the failing test first.
- FFmpeg is spawned with an argument array only; never a shell string.
- SkyBell credentials only from env (`SKYBELL_USERNAME`, `SKYBELL_PASSWORD`), read in `config/` only.
