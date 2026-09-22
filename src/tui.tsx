import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js"
import { RepositoryStatus } from "./rpc"
import type { Status } from "./rpc"

export default Plugin.define({
  id: "shuvcode.repository-status.tui",
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: (input) => <RepositorySidebar context={context} sessionID={input.sessionID} />,
    })
  },
})

function RepositorySidebar(props: { context: Plugin.Context; sessionID: string }) {
  const [status, setStatus] = createSignal<Status | null>()
  const [error, setError] = createSignal(false)
  const [settings, update] = props.context.storage.store("collapsed", { initial: { value: false } })
  const toggle = () =>
    void update((draft) => {
      draft.value = !draft.value
    })
  const rpc = props.context.client.rpc(RepositoryStatus)

  props.context.keymap.layer(() => ({
    commands: [
      {
        id: "shuvcode.repository-status.toggle",
        title: "Toggle repository status",
        group: "Repository",
        palette: true,
        run: toggle,
      },
    ],
  }))

  createEffect(() => {
    const location = props.context.data.session.get(props.sessionID)?.location
    setStatus(undefined)
    setError(false)
    if (!location) return
    const controller = new AbortController()
    const load = async () => {
      await rpc.get({}, { location, signal: controller.signal }).then(
        (value) => {
          if (controller.signal.aborted) return
          setStatus(value)
          setError(false)
        },
        () => {
          if (!controller.signal.aborted) setError(true)
        },
      )
      if (!controller.signal.aborted) timer = setTimeout(load, 5_000)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    void load()
    onCleanup(() => {
      controller.abort()
      clearTimeout(timer)
    })
  })

  return (
    <RepositoryView
      context={props.context}
      status={status()}
      error={error()}
      collapsed={settings.value}
      toggle={toggle}
    />
  )
}

export function RepositoryView(props: {
  context: Pick<Plugin.Context, "theme">
  status: Status | null | undefined
  error: boolean
  collapsed: boolean
  toggle: () => void
}) {
  const theme = props.context.theme
  const summary = () => {
    const status = props.status
    if (props.error) return status ? "stale" : "unavailable"
    if (!status) return "loading"
    if (status.conflicts) return `${status.conflicts} conflict${status.conflicts === 1 ? "" : "s"}`
    return status.files.length ? `${status.files.length} changed` : "clean"
  }
  const label = () => (props.status?.vcs === "jj" ? "jj" : props.status?.vcs === "git" ? "Git" : "Repository")
  const details = () => {
    const status = props.status
    if (!status || status.vcs === "jj") return ""
    return [
      status.staged && `${status.staged} staged`,
      status.unstaged && `${status.unstaged} unstaged`,
      status.untracked && `${status.untracked} untracked`,
    ]
      .filter(Boolean)
      .join(" · ")
  }
  const display = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, "�")

  return (
    <Show when={props.status !== null || props.error}>
      <box flexShrink={0}>
        <box flexDirection="row" gap={1} onMouseDown={props.toggle}>
          <text fg={theme.text.default} flexShrink={0}>
            {props.collapsed ? "▶" : "▼"}
          </text>
          <text fg={theme.text.default} flexShrink={0}>
            <b>{label()}</b>
          </text>
          <text
            fg={props.error || props.status?.conflicts ? theme.text.feedback.warning.default : theme.text.subdued}
            truncate
            wrapMode="none"
            flexShrink={1}
            minWidth={0}
          >
            {summary()}
          </text>
        </box>
        <Show when={!props.collapsed}>
          <box paddingLeft={2}>
            <Show when={props.status}>
              {(status) => (
                <>
                  <text fg={theme.text.default} truncate wrapMode="none">
                    {display(status().reference)}
                  </text>
                  <Show when={status().description}>
                    <text fg={theme.text.subdued} truncate wrapMode="none">
                      {display(status().description)}
                    </text>
                  </Show>
                  <Show when={details()}>
                    <text fg={theme.text.subdued}>{details()}</text>
                  </Show>
                  <Show when={status().ahead || status().behind}>
                    <text fg={theme.text.subdued}>
                      {status().ahead} ahead · {status().behind} behind
                    </text>
                  </Show>
                  <For each={status().files.slice(0, 8)}>
                    {(file) => (
                      <text
                        fg={file.conflict ? theme.text.feedback.warning.default : theme.text.subdued}
                        truncate
                        wrapMode="none"
                      >
                        {file.status.padEnd(2)} {display(file.path)}
                      </text>
                    )}
                  </For>
                  <Show when={status().files.length > 8}>
                    <text fg={theme.text.subdued}>+{status().files.length - 8} more</text>
                  </Show>
                </>
              )}
            </Show>
            <Show when={props.error}>
              <text fg={theme.text.feedback.warning.default}>Status failed · retrying</text>
            </Show>
          </box>
        </Show>
      </box>
    </Show>
  )
}
