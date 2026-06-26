# fleet-ci

Shared CI for the NexGenomics customer-app fleet. Holds the reusable workflow
(`.github/workflows/app-ci.yml`) and the seven per-app lint scripts (`lints/`)
that every `app-*` repo runs against its own code.

## How it is used

Each app repo carries a thin caller workflow that does:

    uses: nexgenomics/fleet-ci/.github/workflows/app-ci.yml@v1

The reusable workflow checks this repo out (at the pinned tag) into the app's
runner and runs `lints/*.mjs` against the app's source. The lints are run from
*here*, not from a copy vendored in the app repo — so an app cannot weaken the
checks that gate it.

## Versioning

- `v1.0.0` — immutable release tag.
- `v1` — moving major alias; re-pointed to each `v1.x` release. Callers pin `@v1`.

## Canonical source

The authoritative copies of `app-ci.yml` and `lints/*.mjs` live in the monorepo
under `fabric-apps/`. This repo is a deployment of those files. Fixes are made in
the monorepo and redeployed here, then a new tag is cut — never hand-edited here.

## Write access

Write is restricted to org administrators. The lints' tamper-resistance rests on
contractors having read, never write: a contributor to an app repo cannot alter
the checks that run against their code.
