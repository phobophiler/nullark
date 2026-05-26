# Nullark Mintlify Docs v2

This directory is a separate Mintlify documentation candidate. It does not replace the existing `docs/` tree or the current custom docs app under `apps/docs/`.

This is the comparison version for deciding which documentation candidate to publish.

## Scope

- Mintlify config: `docs.json`
- Pages: `*.mdx`
- Public contract/runtime facts: copied from `public-artifacts/current.json` as of creation time
- Operational stance: security-first, fail-closed, no deployment or signing instructions

Before publishing, re-check all runtime values against `public-artifacts/current.json`.

## Commit boundary

Treat the Markdown, MDX, config, and checked-in assets in this directory as the reviewable source. Generated export archives such as `export.zip` are handoff artifacts; do not stage one unless the release owner explicitly wants the binary export included in the commit.
