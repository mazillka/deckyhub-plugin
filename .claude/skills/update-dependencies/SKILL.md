---
name: update-dependencies
description: Bring every DeckyHub dependency up to date in one PR - the root pnpm packages, the decky-mock npm packages and the SHA-pinned GitHub Actions. Use when asked to update, upgrade or bump packages or dependencies, when a Dependabot PR needs folding in or fails CI, or at the start of a work session to check nothing is behind.
---

# Keeping DeckyHub's dependencies current

Three places pin versions. Update all of them together, in one PR, so a release never ships half-updated:

| Where | Manager | Check | Update |
| --- | --- | --- | --- |
| `package.json` + `pnpm-lock.yaml` | pnpm (`corepack enable`) | `pnpm outdated` | `pnpm up --latest` |
| `devtools/decky-mock/package.json` + `package-lock.json` | npm | `npm outdated --prefix devtools/decky-mock` | `npm install <pkg>@latest ... --prefix devtools/decky-mock` |
| `.github/workflows/*.yml` | pinned commit SHA plus a `# vX.Y.Z` comment | `gh release list -R <owner>/<action> --limit 1` per action | replace both the SHA and the comment |

Dependabot (`.github/dependabot.yml`) opens weekly PRs for the same three. When one is open, fold its bump into this run and close it rather than merging it separately.

## Steps

1. Branch from `main` (`chore-deps-<yyyy-mm-dd>`); never update on `main` or on a feature branch.
2. Run the three checks above. If nothing is outdated, stop and say so - don't open an empty PR.
3. Update. Rules:
   - `react` and `react-dom` in the mock must stay on the exact same version (Dependabot groups them for this reason).
   - `@types/react` / `@types/react-dom` follow the major of `react`.
   - Keep the root's `typescript` and the mock's on the same major.
   - The mock's `allowScripts` names packages by exact version (`name@x.y.z`). After updating, make each entry match a package and version still in `package-lock.json`: update a changed version, and remove an entry whose package is gone.
   - For an Action, take the SHA the release tag points at (`gh api repos/<owner>/<action>/git/ref/tags/<tag> --jq .object.sha`, following an annotated tag to its commit), never a branch.
   - A **major** bump: read the package's changelog for breaking changes before running anything, and say in the PR what changed and why the code still fits.
4. Verify - everything in [AGENTS.md](../../../AGENTS.md#commands) must pass:
   - `pnpm run typecheck` and `pnpm run build`
   - `pnpm run test:frontend` and `pnpm run test:backend`
   - `npm run test:e2e --prefix devtools/decky-mock` (a `@decky/ui` update can add exports the mock lacks: the mock build then fails with "No matching export in ui.tsx" - add the stand-in to `devtools/decky-mock/ui.tsx`)
   - If one update breaks something you can't fix cleanly, pin that one package back to its last working version, finish the rest, and list it in the PR as held back with the reason.
5. Version: dependency updates change the built `dist/`, so bump the pre-release in `package.json` (`2.1.1-rc.N` -> `rc.N+1`). An Actions-only update changes no plugin file and needs no bump or release (see SKILLS.md, Release).
6. Commit and open the PR titled `chore(deps): update <names> (<version>)`, e.g. `chore(deps): update rollup, @decky/ui and vite (2.1.1-rc.4)`, listing each package with its old and new version.
7. Release only when the user asks, following [CONTRIBUTING.md](../../../CONTRIBUTING.md#releases) and the release-notes rules in [AGENTS.md](../../../AGENTS.md#release). Dependency-only release notes go under **Under the hood**.
