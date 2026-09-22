# shuvcode-vcs-status

Collapsible Git and Jujutsu status for the **Shuvcode / OpenCode V2** sidebar.

- Branch or jj change ID and bookmarks
- Clean/changed status and conflicts
- Git staged, unstaged, untracked, and upstream ahead/behind counts
- Up to eight changed files, with a remaining-file count
- Persistent collapse toggle by clicking the heading or choosing **Toggle repository status** in the command palette

## Install

Add the package to your existing `plugins` array in the server's `opencode.json(c)`:

```json
{
  "plugins": ["shuvcode-vcs-status@0.1.0"]
}
```

For Shuvcode, the global file is `~/.config/shuvcode/opencode.json`.
For upstream OpenCode V2, it is `~/.config/opencode/opencode.json`.
Reopen the TUI after adding the plugin.

The package exports a server plugin and a `./tui` entrypoint; V2 loads them together.
Repository commands run on the **server**, at the displayed session's location.

## Requirements

- OpenCode V2 plugin API; developed against `@opencode/plugin` **2.0.8** and Shuvcode **2.0.8-shuv.2**.
- OpenTUI **0.5.10** and Solid **1.9.x**; supplied by the host.
- `git` on the server; `jj` for Jujutsu repositories. Tests use jj **0.40.0**.
  jj must support `diff --template`, `json()`, and the template methods used in `src/status.ts`.
- V1 is not supported.

## Behavior

The nearest `.jj` or `.git` repository is used, including nested directories,
Git worktrees, and jj workspaces. jj takes precedence in colocated repositories.
Status refreshes five seconds after each request finishes while the sidebar is
mounted. Unmounting cancels pending work. Outside repositories the section hides;
failed refreshes mark the previous snapshot stale and retry.

Git paths use porcelain v2 with NUL delimiters; jj paths use JSON templates.
Control characters in paths are replaced for terminal display.

jj's normal read-command snapshot records working-copy edits, just as `jj status`
does. The plugin does not commit, stage, move bookmarks, fetch, or push.
jj changes are relative to the working-copy commit's parents, not Git's index;
files excluded from jj snapshots are not listed.

## Development

```sh
bun install --frozen-lockfile
bun run check
bun run build
bun run test:package
```

Tests exercise real Git/jj repositories and the production sidebar at narrow and
normal widths in light/dark themes, including mouse collapse/expand interactions.
The package check installs an npm tarball into a temporary project and loads both
entrypoints with the OpenTUI Solid preload.

For local development, configure an absolute path to this repository instead of
the npm package name, and run `bun run build` after editing. The npm package ships
compiled JavaScript, with JSX transformed for OpenTUI. It deliberately does not
bundle a second Solid or OpenTUI runtime.

## Releases

The plugin uses independent semver. Update `package.json`, run the checks, and
publish a GitHub release tagged `v<version>`. `publish.yml` verifies the tag and
publishes to npm with provenance using trusted publishing.

The initial npm publication requires a maintainer's npm sign-in:

```sh
npm login
npm publish --access public
```

After that first publication, configure an npm trusted publisher for:

- GitHub owner: `shuv1337`
- Repository: `shuvcode-vcs-status`
- Workflow: `publish.yml`
- Environment: `npm`

No long-lived npm token is required for subsequent CI releases.

## License

MIT. Extracted from the Shuvcode fork of OpenCode.
