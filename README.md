# Thornwrithe v1

Thornwrithe v1 is a server-authoritative browser game shell for disposable shard-worlds. Each Ratio1 node runs one Thornwrithe container, and each container hosts one live shard-world. Players keep durable character progression in `R1FS` and attach to whatever shard answers their gameplay WebSocket.

## Current Runtime Model

The shipped v1 runtime has these boundaries:

- one public HTTP origin per Thornwrithe node
- one custom Node server in `server.ts`
- one Next.js App Router shell for auth and play surfaces
- one dedicated `/admin` diagnostics surface
- one gameplay WebSocket path on the same origin
- one live shard runtime per container
- one `CStore` durable roster row per player-character
- one `CStore` live lease row per active player-character
- one `R1FS` checkpoint chain per character

The current browser flow is:

1. the player opens `/`
2. the client registers or logs in through the auth routes
3. the play page requests a short-lived attach token from `/api/auth/attach`
4. the client opens the gameplay socket on `THORNWRITHE_WEBSOCKET_PATH`
5. the socket sends `attach`
6. the server loads the character from `R1FS` and inserts it into the local shard

After attach, gameplay is WebSocket-only.

Registration note:

- when `R1EN_CSTORE_AUTH_*` is configured, `/api/auth/register` creates the shared auth user in `CStore`
- the same registration call also writes the initial character checkpoint into `R1FS`, and the returned `characterId` is that checkpoint CID
- this keeps login and attach working even when register, login, and socket attach land on different thorn nodes

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

Shard-local position and shard-local encounter state are disposable in v1. Reconnect loads the latest durable checkpoint from the roster hset, not the last live location.

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
- `THORNWRITHE_LEASE_GRACE_MS`: lease timeout for stale sockets
- `ADMIN_USER`: primary admin username for `/admin`
- `ADMIN_PASS`: primary admin password for `/admin`

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
- `THORNWRITHE_ADMIN_USER`: fallback admin username if `ADMIN_USER` is unset
- `THORNWRITHE_ADMIN_PASS`: fallback admin password if `ADMIN_PASS` is unset

## Local Commands

`pnpm dev` runs `server.ts` through `tsx`.

`pnpm build` builds Next into `.next/` and compiles `server.ts` into `dist/server.js`.

`pnpm start` launches `dist/server.js` in production mode.

`pnpm test`, `pnpm lint`, and `pnpm typecheck` are the local verification commands used in this repo.

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

For the persistence slice, run:

```bash
pnpm test -- tests/unit/persistence-service.test.ts tests/integration/r1fs-checkpoint.test.ts
```

## Operational Notes

The repo includes a `syncPresenceHset()` helper in `src/server/platform/cstore-presence.ts`, but `server.ts` does not wire it into startup yet. Treat fresh-start presence state as best-effort until you add startup `hsync` or enforce it outside the app.

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
