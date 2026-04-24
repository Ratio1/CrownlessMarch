# Thornwrithe Agent Notes

## Deployment Memory

- Thornwrithe is deployed to the thorn devnet nodes through WAR.
- `dr1-thorn-01` and `dr1-thorn-02` automatically pick up the app by pushing `apps/Thornwrithe` `main` to `origin/main`.
- Treat `git push origin main` in the Thornwrithe submodule as a deployment step, not just source control.

## Live Validation Rule

- After each completed Thornwrithe recovery phase, push `main` to `origin/main`.
- After each such push, validate the live devnet version at `https://devnet-thorn.ratio1.link`.
- Thornwrithe must always expose a visible `RELEASE.FEATURE.BUILD` version in the UI and mirror it at `GET /e`.
- Post-push verification must include `https://devnet-thorn.ratio1.link/e` plus the `x-thornwrithe-version` headers so the live WAR build can be confirmed in one request.
- After each Thornwrithe update, the final result must summarize the version comparison: previous local version before the update, new local version after the update, and the online version observed from `https://devnet-thorn.ratio1.link/e`. Include the corresponding commit SHAs when available, and explicitly say when the semantic version number did not change.
- The canonical post-push gameplay regression is `pnpm live:devnet`, which runs `tests/live/devnet-quest-runner.ts` against the public devnet and completes the quest chain through `Secure the Shrine Road`.
- Also inspect the node-local state on `dr1-thorn-01` and `dr1-thorn-02` using the checked-in login helpers and `~/show.sh`.

## Current Recovery Sequence

1. Phase 1: verified email registration
2. Phase 2: typed D20-inspired character creation and durable sheet foundation
3. Phase 3: content packs, world state, and monsters
4. Phase 4: combat engine and MUD-style dice log

- Do not batch multiple phases into a single unvalidated live rollout when phase boundaries are clear.
