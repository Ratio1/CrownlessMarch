# Thornwrithe Agent Notes

## Deployment Memory

- Thornwrithe is deployed to the thorn devnet nodes through WAR.
- `dr1-thorn-01` and `dr1-thorn-02` automatically pick up the app by pushing `apps/Thornwrithe` `main` to `origin/main`.
- Treat `git push origin main` in the Thornwrithe submodule as a deployment step, not just source control.

## Version And Commit Rules

- Thornwrithe uses `RELEASE.FEATURE.BUILD`, exposed visibly in the UI and through `GET /e`.
- When no explicit `THORNWRITHE_VERSION` or split `THORNWRITHE_RELEASE` / `THORNWRITHE_FEATURE` / `THORNWRITHE_BUILD` env is set, the canonical local version is `package.json` `version`.
- Every shipped Thornwrithe app update must use a commit subject that starts with one of the supported change classes and must update the version in the same commit:
  - `feat:` for new player-visible gameplay, UX, content, graphics, mechanics, or capability changes. Increment `FEATURE` and reset `BUILD` to `0`.
  - `fix:` for bug fixes, balance corrections, deployment fixes, regressions, and production recovery. Increment `BUILD`.
  - `chore:` for tooling, dependency, operational, observability, or non-player-facing maintenance that still changes the shipped app or deployment behavior. Increment `BUILD`.
- Increment `RELEASE` and reset `FEATURE` and `BUILD` to `0` only for a milestone release, incompatible live-state contract change, major runtime/deployment contract change, or intentional world/progression reset. Use a `feat:` or explicit release commit subject and call out the reason in the final summary.
- Docs-only or agent-rule-only changes may use `docs:` and do not require a Thornwrithe app version bump when they do not change shipped runtime behavior. If such a commit is pushed to the WAR-tracked `main`, still run `/e` verification and state that the semantic version intentionally did not change.
- Before editing, record the previous local version and current online `/e` version. After the version bump, verify the new local version and, after deployment, the online `/e` version.

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
