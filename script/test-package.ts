import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const temporary = await mkdtemp(path.join(tmpdir(), "vcs-status-package-"))

async function run(command: string[], cwd: string) {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "inherit" })
  const output = await new Response(child.stdout).text()
  if (await child.exited) throw new Error(`Failed: ${command.join(" ")}`)
  return output
}

try {
  const packed = Object.values(JSON.parse(await run(["npm", "pack", "--json", "--pack-destination", temporary], root)))[0] as {
    filename: string
    files: { path: string }[]
  }
  const files = packed.files.map((file) => file.path)
  for (const name of ["package.json", "README.md", "LICENSE", "dist/index.js", "dist/tui.js"]) {
    if (!files.includes(name)) throw new Error(`Missing package file: ${name}`)
  }
  if (files.some((name: string) => !/^(dist\/|package.json$|README.md$|LICENSE$)/.test(name))) {
    throw new Error("Unexpected files in npm tarball")
  }
  await Bun.write(path.join(temporary, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "shuvcode-vcs-status": `file:./${packed.filename}`,
      "@opentui/core": "0.5.10",
      "@opentui/solid": "0.5.10",
      "@opencode/theme": "2.0.8",
      "solid-js": "1.9.12",
    },
  }))
  await run(["bun", "install"], temporary)
  await Bun.write(path.join(temporary, "smoke.tsx"), `
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { resolveThemeDocument, DEFAULT_THEME } from "@opencode/theme/tui"
import server from "shuvcode-vcs-status"
import tui from "shuvcode-vcs-status/tui"

test("packed server registers and reads its location; packed TUI mounts its slot", async () => {
  let get
  await server.setup({
    location: { directory: process.cwd() },
    rpc: { register: async (_definition, handlers) => { get = handlers.get } },
  })
  expect(await get({}, { signal: new AbortController().signal })).toBeNull()
  let slot
  const context = {
    theme: resolveThemeDocument(DEFAULT_THEME, "dark"),
    ui: { slot: (value) => { slot = value; return () => {} } },
    storage: { store: (_key, options) => [options.initial, async () => {}] },
    keymap: { layer: () => () => {} },
    data: { session: { get: () => ({ location: { directory: process.cwd() } }) } },
    client: { rpc: () => ({ get: async () => ({
      vcs: "git", reference: "packed-install", description: "", files: [],
      staged: 0, unstaged: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0,
    }) }) },
  }
  const cleanup = tui.setup(context)
  expect(slot.append).toBe("sidebar.content")
  const app = await testRender(() => slot.render({ sessionID: "smoke" }), { width: 37, height: 8 })
  try {
    await Bun.sleep(10)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("packed-install")
    expect(app.captureCharFrame()).toContain("clean")
  } finally {
    app.renderer.destroy()
    cleanup()
  }
})
`)
  // No workspace links: all runtime dependencies resolve from this disposable installation.
  console.log(await run(["bun", "test", "--preload", "@opentui/solid/preload", "./smoke.tsx"], temporary))
  console.log(`Verified ${packed.filename}: ${files.length} shipping files; server and TUI entrypoints loaded.`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
