# Thornwrithe v1

Thornwrithe v1 is a server-authoritative browser game for disposable shard-worlds. Each Ratio1 node runs one Thornwrithe container, and each container hosts one live shard-world. Players keep durable character progression in `R1FS` and attach to whatever shard answers their gameplay WebSocket.

## Current Runtime Model

The shipped v1 runtime has these boundaries:

- one public HTTP origin per Thornwrithe node
- one custom Node server in `server.ts`
- one Next.js App Router shell for auth and play surfaces
- one Phaser-backed world canvas embedded inside the `/play` shell
- one dedicated `/admin` diagnostics surface
- one fast `/e` endpoint for version verification
- one gameplay WebSocket path on the same origin
- one live shard runtime per container
- one repo-owned starter content bundle under `content/`
- one tile field surface with fog-window snapshots and visible hostile markers
- one automated encounter loop with MUD-style dice logs and override actions
- one `CStore` durable roster row per player-character
- one `CStore` live lease row per active player-character
- one `R1FS` checkpoint chain per character

The current browser flow is:

1. the player opens `/`
2. the player registers with email and password through `/api/auth/register`
3. the player verifies the emailed link from `/api/auth/verify`
4. the player logs in through `/api/auth/login`
5. first-time accounts create one character through `/api/characters`
6. the play page requests a short-lived attach token from `/api/auth/attach`
7. the client opens the gameplay socket on `THORNWRITHE_WEBSOCKET_PATH`
8. the socket sends `attach`
9. the server loads the character from `R1FS` and inserts it into the local shard

After attach, gameplay is WebSocket-only. The socket now carries:

- world snapshots with visible tiles, visible PCs, visible hostile markers, and the live character card
- movement updates on the same shard
- automated encounter progression during heartbeat ticks
- queued override commands for `encounter power`, `potion`, and `retreat`
- MUD-style field commands such as `look`, `examine`, `search`, `scout`, `pray`, and cardinal movement aliases
- durable checkpoint advancement when a resolved encounter changes the PC's long-lived state

Registration note:

- when `R1EN_CSTORE_AUTH_*` is configured, `/api/auth/register` creates the shared auth user in `CStore`
- the register call does not create the hero checkpoint anymore; it only creates a verified-email account
- `/api/characters` writes the first durable character checkpoint into `R1FS` and seeds the Thornwrithe roster hset
- this keeps login, character creation, and later attach working even when requests land on different thorn nodes

## Storage Split

`R1FS` is the durable character store. Thornwrithe checkpoints progression such as XP, inventory, equipment, skills, quest progress, and currency there.

`CStore` now has two Thornwrithe-owned hsets:

- `thornwrithe-<game_id>:pcs`
  The durable roster keyed by `accountId` or email. Each row stores:
  - character name
  - email
  - latest durable checkpoint CID
  - persist revision
  - registration and last-persisted timestamps
- `thornwrithe-<game_id>:presence`
  The live session registry keyed by `accountId` or email. Each row stores:
  - current checkpoint CID
  - shard-world instance id
  - session-host node id
  - connection id
  - lease expiry
  - last persisted revision and timestamp

Shard-local position and active encounters are disposable in v1. Reconnect loads the latest durable checkpoint from the roster hset, not the last live location.

## Content And Combat

Starter content ships from repo-owned packs:

- `content/classes.json`
- `content/items.json`
- `content/monsters.json`
- `content/quests.json`
- `content/regions/briar-march.json`
- `content/rules/*.json`

The persistent D20/MUD rules reference lives in `RULEBOOK.md`. It defines the
target weapon encyclopedia, XP table, class attack tables, enhancement cap,
alignment system, Holy modifier, critical hit rules, boss protection gates, and
`consider` skill behavior. Runtime rule values are loaded from `content/rules`
JSON files and validated at boot so balance can be inspected without reading
resolver code.

The current `/play` surface renders a Phaser-backed world surface with a text-forward field HUD:

- the center playfield is a Phaser canvas for the visible fog window
- the canvas draws terrain silhouettes plus generated animated Phaser sprite textures for live PCs and mobs from the shard snapshot
- terrain kinds are deliberately simple: `grass` and `mud` are walkable, while `forest` trees and `stone` rocks block movement
- the side HUD shows latest-first logs, the field command prompt, movement controls, and a short character sheet
- full character details, beta reset, and quest information live behind the information tabs below the field; beta reset forces a fresh playfield attach so the live sheet and class sprite refresh from the durable checkpoint
- the combat panel is a dice-text log with visible initiative, attack, defense, damage, and queued-action math
- the field command prompt accepts room-style MUD verbs, D20 terrain checks, `inventory`, `sheet`, `exits`, and `lore <target>`
- during active combat the typed command surface exposes only `flee`; other movement and MUD commands are held until the fight resolves
- the non-combat feed reports shrine, town, and quest-turn-in events on the same panel when no encounter is active
- the fixed release badge links to `/e` so operators can confirm the exact live build from the UI

Combat rules are intentionally compact but now use the persistent weapon rules:

- stepping onto hostile tiles starts combat
- stepping onto the shrine and town coordinates triggers automatic world interactions even though both are rendered as `grass`
- the shrine coordinate grants a one-time recovery and marks the survey quest ready to report
- the town coordinate heals the PC and turns in any quest already marked ready
- level-up reset extras are available at real levels 4, 8, and 14 as one additional attribute-score point each
- initiative is rolled once when the encounter opens
- rounds advance automatically on the live socket heartbeat cadence
- equipped weapons supply damage dice, enhancement, critical range, and modifiers
- class attack progression uses precomputed per-level tables from the rule pack
- durable checkpoints distinguish XP-derived `realLevel` from effect-adjusted `currentLevel`
- attacks log the D20 roll, defense target, hit or miss, criticals, Holy damage, and boss ward blocks
- monster alignment and boss enhancement gates are available to combat and `consider`
- resolved encounters write XP, gold, HP changes, and any loot back into the latest durable checkpoint

## Session Rules

Thornwrithe v1 uses `disconnect before reconnect`.

- If a character already has a live lease, a new attach is rejected.
- Graceful logout clears the lease before the socket closes.
- Dirty disconnect waits for lease expiry.
- Reconnect may land on a different node and therefore a different shard.

The client UI already treats reconnect as a fresh session host. It does not promise return to the same shard.

## Environment Contract

Copy `.env.example` to `.env` before local or deployed runs.

Required settings:

- `EE_CHAINSTORE_API_URL`: CStore endpoint
- `EE_R1FS_API_URL`: R1FS endpoint
- `R1EN_CSTORE_AUTH_HKEY`: auth namespace key
- `R1EN_CSTORE_AUTH_SECRET`: auth secret for the Ratio1 auth layer
- `R1EN_CSTORE_AUTH_BOOTSTRAP_ADMIN_PWD`: bootstrap admin password
- `SESSION_SECRET`: session-cookie signing secret
- `ATTACH_TOKEN_SECRET`: short-lived attach-token signing secret
- `THORNWRITHE_GAME_ID`: shared game id for the deployment
- `THORNWRITHE_NODE_ID`: node identifier written into presence leases
- `THORNWRITHE_LEASE_GRACE_MS`: lease timeout for stale sockets, defaults to `60000`
- `ADMIN_USER`: primary admin username for `/admin`
- `ADMIN_PASS`: primary admin password for `/admin`
- `RESEND_TOKEN`: API token used to send verification links

Deeploy note:

- the current worker runner injects the Ratio1 endpoint vars and `R1EN_CSTORE_AUTH_*`
- Thornwrithe now falls back to the `R1EN_CSTORE_AUTH_HKEY` namespace, with the Deeploy worker-runner suffix stripped, for `THORNWRITHE_GAME_ID`
- Thornwrithe now falls back to `R1EN_CSTORE_AUTH_SECRET` for `SESSION_SECRET` and `ATTACH_TOKEN_SECRET`
- Thornwrithe now falls back to `R1EN_HOST_ID` or `EE_HOST_ID` when `THORNWRITHE_NODE_ID` is absent
- on the thorn devnet, use `THORNWRITHE_NODE_ID=dr1-thorn-01-4c` on `dr1-thorn-01` and `THORNWRITHE_NODE_ID=dr1-thorn-02-4c` on `dr1-thorn-02`
- keep explicit Thornwrithe env values when you need stable node ids, secrets that differ from the CStore auth secret, or a game id that does not derive from the auth namespace

Optional settings:

- `THORNWRITHE_WEBSOCKET_PATH`: gameplay socket path, defaults to `/ws`
- `THORNWRITHE_SHARD_WORLD_INSTANCE_ID`: explicit shard id for the container, defaults to `THORNWRITHE_NODE_ID`
- `THORNWRITHE_VERSION`: explicit `RELEASE.FEATURE.BUILD` label exposed in the UI and `/e`
- `THORNWRITHE_RELEASE`, `THORNWRITHE_FEATURE`, `THORNWRITHE_BUILD`: split version env alternative to `THORNWRITHE_VERSION`
- `THORNWRITHE_ADMIN_USER`: fallback admin username if `ADMIN_USER` is unset
- `THORNWRITHE_ADMIN_PASS`: fallback admin password if `ADMIN_PASS` is unset
- `THORNWRITHE_EMAIL_FROM`: sender address for verification mail, defaults to `RESEND_FROM` and then `onboarding@resend.dev`
- `RESEND_FROM`: sender address fallback for verification mail
- `THORNWRITHE_EXPOSE_VERIFICATION_TOKEN=1`: expose verification tokens in HTTP responses for test-only flows

Proxy note:

- verification emails and `/api/auth/verify` redirects now resolve the public origin from forwarded host and proto headers, rather than trusting the worker-local `request.url`

## Local Commands

`pnpm dev` runs `server.ts` through `tsx`.

`pnpm build` builds Next into `.next/` and compiles `server.ts` into `dist/server.js`.

`pnpm start` launches `dist/server.js` in production mode.

`pnpm test`, `pnpm lint`, and `pnpm typecheck` are the local verification commands used in this repo.

`pnpm live:devnet` runs the public devnet quest runner in `tests/live/devnet-quest-runner.ts`. It waits for `/e`, registers a fresh account through Resend, verifies the email link, creates a character, attaches over `/ws`, and drives the live quest chain through `Secure the Shrine Road`. Movement waits for a concrete player-visible state change, and the runner fails if the route exceeds its defeat budget, which defaults to one defeat and can be changed with `--max-defeats`.

`pnpm live:browser` runs the public devnet browser smoke runner in `tests/live/devnet-browser-smoke.ts`. It waits for `/e`, registers a fresh account through Resend, opens `/play` in Chromium through `playwright-core`, verifies that the Phaser canvas and WebSocket-attached HUD render, and fails unless the March Feed shows the styled `MOVE` entry. `--reset` drives the beta reset UI before moving, and `--reconnect-probe-ms=<ms>` forces a browser offline/online window to prove the canvas, sheet, and command controls do not deplete during reconnect. Set `THORNWRITHE_BROWSER_EXECUTABLE` when Chromium is not installed in a standard system or Playwright cache path.

`GET /e` returns the current Thornwrithe version contract as JSON and mirrors it in headers:

- `x-thornwrithe-version`
- `x-thornwrithe-release`
- `x-thornwrithe-feature`
- `x-thornwrithe-build`
- `x-thornwrithe-commit`

If no explicit version env is set, Thornwrithe falls back to the app `package.json` version.

## Verification

Run these checks from the Thornwrithe worktree:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

For the current first-session smoke path, run:

```bash
pnpm test -- tests/integration/first-session-smoke.test.ts
```

For the attach/runtime slices, run:

```bash
pnpm test -- tests/integration/auth-attach.test.ts tests/integration/websocket-session.test.ts
```

For the Phase 3 and Phase 4 gameplay slices, run:

```bash
pnpm test -- tests/unit/content-loader.test.ts tests/unit/shard-runtime.test.ts
```

For the persistence slice, run:

```bash
pnpm test -- tests/unit/persistence-service.test.ts tests/integration/r1fs-checkpoint.test.ts
```

For the live version contract, run:

```bash
curl -sS https://devnet-thorn.ratio1.link/e
curl -sSI https://devnet-thorn.ratio1.link/e | rg '^x-thornwrithe-'
```

For the permanent public-devnet quest regression, run:

```bash
pnpm live:devnet -- --expect-version=1.14.3
pnpm live:browser -- --expect-version=1.14.3
pnpm live:browser -- --expect-version=1.14.3 --profile=all --combat --reset --reconnect-probe-ms=15000 --idle-ms=300000 --report-path=test-results/live/browser-smoke-report.json
```

Thornwrithe now has a four-level regression ladder:

```bash
pnpm regression:local
pnpm regression:live -- --expect-version=1.14.3
pnpm regression:agent -- --evidence-json=test-results/live/browser-smoke-report.json
```

`regression:local` runs lint, typecheck, Jest, and a production build. `regression:live`
runs the quest regression, then desktop and mobile browser smoke profiles with reset, reconnect probe, screenshots, and idle checks, then writes
an agent-review brief from the browser evidence. `regression:agent` can regenerate
that review brief for an agent or human reviewer without rerunning the live smoke.

## Operational Notes

`server.ts` attempts a startup `syncPresenceHset()` before it binds the gameplay WebSocket server, but a slow CStore hsync is logged and treated as non-fatal so `/e` and the game can still come up during devnet CStore latency spikes.

## Admin Surface

`/admin` is a separate read-only diagnostics page.

- it uses a dedicated admin cookie, not the player session cookie
- it authenticates against `ADMIN_USER` and `ADMIN_PASS`
- it falls back to `THORNWRITHE_ADMIN_USER` and `THORNWRITHE_ADMIN_PASS` if the primary pair is not set
- it renders:
  - the durable Thornwrithe roster hset
  - the live Thornwrithe presence hset
  - the latest `R1FS` checkpoint snapshot for each known PC

The admin dashboard does not mutate gameplay state.
