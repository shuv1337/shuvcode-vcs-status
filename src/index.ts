import { Plugin } from "@opencode/plugin"
import { RepositoryStatus } from "./rpc"
import { readStatus } from "./status"

export default Plugin.define({
  id: "shuvcode.repository-status",
  async setup(context) {
    await context.rpc.register(RepositoryStatus, {
      get: (_input, request) => readStatus(context.location.directory, request.signal),
    })
  },
})
