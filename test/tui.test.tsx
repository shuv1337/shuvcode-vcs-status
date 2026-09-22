import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { DEFAULT_THEME, resolveThemeDocument } from "@opencode/theme/tui"
import { createSignal } from "solid-js"
import { RepositoryView } from "../src/tui"
import type { Status } from "../src/rpc"

const status: Status = {
  vcs: "jj",
  reference: "abcdefgh · feature-sidebar-with-a-long-bookmark-name",
  description: "Working on sidebar status",
  staged: 0,
  unstaged: 12,
  untracked: 0,
  conflicts: 0,
  ahead: 0,
  behind: 0,
  files: Array.from({ length: 12 }, (_, index) => ({
    path: `packages/example/src/changed-file-${index}.ts`,
    status: "M",
    conflict: false,
  })),
}

for (const mode of ["dark", "light"] as const) {
  for (const width of [24, 37]) {
    test(`${mode} ${width} cells: file list is bounded and collapse removes details`, async () => {
      const [collapsed, setCollapsed] = createSignal(false)
      const app = await testRender(
        () => (
          <RepositoryView
            context={{ theme: resolveThemeDocument(DEFAULT_THEME, mode) }}
            status={status}
            error={false}
            collapsed={collapsed()}
            toggle={() => setCollapsed(!collapsed())}
          />
        ),
        { width, height: 16 },
      )
      try {
        await app.renderOnce()
        expect(app.captureCharFrame()).toContain("12 changed")
        expect(app.captureCharFrame()).toContain("+4 more")
        expect(app.captureCharFrame()).toContain("abcdefgh")
        // Exercise the production click handler, not just its boolean prop.
        await app.mockMouse.click(3, 0)
        await app.renderOnce()
        expect(app.captureCharFrame()).toContain("12 changed")
        expect(app.captureCharFrame()).not.toContain("abcdefgh")
        expect(app.captureCharFrame()).not.toContain("+4 more")
        await app.mockMouse.click(3, 0)
        await app.renderOnce()
        expect(app.captureCharFrame()).toContain("+4 more")
      } finally {
        app.renderer.destroy()
      }
    })
  }
}

test("non-repo hides and failed refresh labels retained data stale", async () => {
  const [value, setValue] = createSignal<Status | null>(null)
  const [error, setError] = createSignal(false)
  const app = await testRender(
    () => (
      <RepositoryView
        context={{ theme: resolveThemeDocument(DEFAULT_THEME, "dark") }}
        status={value()}
        error={error()}
        collapsed={false}
        toggle={() => {}}
      />
    ),
    { width: 37, height: 16 },
  )
  try {
    await app.renderOnce()
    expect(app.captureCharFrame().trim()).toBe("")
    setValue(status)
    setError(true)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("stale")
    expect(app.captureCharFrame()).toContain("Status failed · retrying")
  } finally {
    app.renderer.destroy()
  }
})
