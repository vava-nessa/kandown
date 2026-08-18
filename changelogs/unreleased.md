# Unreleased - "Plugin Forge"

The plugin system gains an authoring loop designed for coding agents: scaffold,
bundle, validate, hot reload, publish. Everything an agent needs to write a
kandown plugin unattended now comes out of one command, and the contract it reads
is generated from the extension types so it can never drift from the runtime.

## Added

- `kandown plugin <sub>`, the authoring surface next to the administrative
  `kandown extension <sub>`: `create`, `build`, `check`, `dev`, `brief`,
  `publish`, plus aliases for `list`, `enable`, `disable`, `install`, `guide`
  and `purge`.
- `kandown plugin create <id> --kind field|panel|gate|sync|command|full` writes a
  plugin that already builds and already passes every check, and prints the full
  authoring contract to stdout so an agent picks it up in context.
- `kandown plugin create <id> --from "<goal>"` hands the scaffold, the contract
  and the working order to the coding agent already installed on the machine
  (`--agent <id>` to choose one). kandown never calls a model itself.
- `kandown plugin build <id>` bundles `index.ts` and `web.tsx` with esbuild into
  the self-contained JavaScript the browser can execute, with React kept external
  and a hard error when a panel bundle imports it anyway.
- `kandown plugin check <id> --json` validates a plugin against a synthetic
  in-memory board: manifest, entry, registered contributions, permissions
  declared versus called, bundle freshness, one render of every panel, a dispatch
  of every gate, sync and command, and a frontmatter round-trip. Every failure
  carries a `fix` sentence written as an instruction, so an agent can iterate to
  green on its own.
- `kandown plugin dev <id>` watches the plugin directory and, on every save,
  rebuilds, revalidates and pushes a hot reload to every open board.
- `kandown plugin publish <id>` re-verifies and prints the community store entry.
- `docs/EXTENSIONS-AGENT.md`, the plugin authoring contract, generated from
  `src/lib/extensions/types.ts` by `pnpm extension-brief` and embedded in the CLI
  bundle. `pnpm extension-brief:check` runs in `pnpm verify` and fails on drift.
- `POST /api/extensions/reload`, the daemon endpoint behind the hot reload.

## Changed

- The extension host accepts an inspection load (`only`, `inspect`) so the
  validator can report on a plugin that is not trusted or enabled yet, without
  persisting trust or touching the real board.
- Web panels re-import their module after a reload instead of keeping the
  previously mounted bundle.
- `esbuild` is now a runtime dependency, required by `kandown plugin build`.
