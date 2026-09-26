import { expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { DEFAULT_THEME, resolveThemeDocument } from "@opencode/theme/tui";
import { createSignal } from "solid-js";
import { RepositorySidebar, RepositoryView } from "../src/tui";
import type { Plugin } from "@opencode/plugin/tui";
import type { Status } from "../src/rpc";

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
};

test("same-location session switches retain status and the polling request", async () => {
  const [sessionID, setSessionID] = createSignal("parent");
  const calls: AbortSignal[] = [];
  const context = {
    theme: resolveThemeDocument(DEFAULT_THEME, "dark"),
    storage: { store: () => [{ value: false }, () => {}] },
    keymap: { layer: () => {} },
    data: {
      session: {
        get: (id: string) => ({
          location: { directory: id === "other" ? "/other" : "/repo" },
        }),
      },
    },
    client: {
      rpc: () => ({
        get: (_: unknown, options: { signal: AbortSignal }) => {
          calls.push(options.signal);
          return calls.length === 1
            ? Promise.resolve(status)
            : new Promise<Status>(() => {});
        },
      }),
    },
  } as unknown as Plugin.Context;
  const app = await testRender(
    () => <RepositorySidebar context={context} sessionID={sessionID()} />,
    { width: 37, height: 16 },
  );
  try {
    await app.renderOnce();
    await Promise.resolve();
    await app.renderOnce();
    expect(app.captureCharFrame()).toContain("abcdefgh");
    setSessionID("child");
    await app.renderOnce();
    expect(app.captureCharFrame()).toContain("abcdefgh");
    expect(calls).toHaveLength(1);
    expect(calls[0].aborted).toBe(false);
    setSessionID("other");
    await app.renderOnce();
    expect(calls).toHaveLength(2);
    expect(calls[0].aborted).toBe(true);
    expect(app.captureCharFrame()).not.toContain("abcdefgh");
  } finally {
    app.renderer.destroy();
  }
});

for (const mode of ["dark", "light"] as const) {
  for (const width of [24, 37]) {
    test(`${mode} ${width} cells: file list is bounded and collapse removes details`, async () => {
      const [collapsed, setCollapsed] = createSignal(false);
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
      );
      try {
        await app.renderOnce();
        expect(app.captureCharFrame()).toContain("12 changed");
        expect(app.captureCharFrame()).toContain("+4 more");
        expect(app.captureCharFrame()).toContain("abcdefgh");
        // Exercise the production click handler, not just its boolean prop.
        await app.mockMouse.click(3, 0);
        await app.renderOnce();
        expect(app.captureCharFrame()).toContain("12 changed");
        expect(app.captureCharFrame()).not.toContain("abcdefgh");
        expect(app.captureCharFrame()).not.toContain("+4 more");
        await app.mockMouse.click(3, 0);
        await app.renderOnce();
        expect(app.captureCharFrame()).toContain("+4 more");
      } finally {
        app.renderer.destroy();
      }
    });
  }
}

test("non-repo hides and failed refresh labels retained data stale", async () => {
  const [value, setValue] = createSignal<Status | null>(null);
  const [error, setError] = createSignal(false);
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
  );
  try {
    await app.renderOnce();
    expect(app.captureCharFrame().trim()).toBe("");
    setValue(status);
    setError(true);
    await app.renderOnce();
    expect(app.captureCharFrame()).toContain("stale");
    expect(app.captureCharFrame()).toContain("Status failed · retrying");
  } finally {
    app.renderer.destroy();
  }
});
