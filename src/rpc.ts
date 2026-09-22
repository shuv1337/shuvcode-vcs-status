import { Rpc } from "@opencode/plugin/rpc"
import { z } from "zod"

export const FileStatus = z.object({
  path: z.string(),
  status: z.string(),
  conflict: z.boolean(),
})

export const Status = z.object({
  vcs: z.enum(["git", "jj"]),
  reference: z.string(),
  description: z.string(),
  files: z.array(FileStatus),
  staged: z.number(),
  unstaged: z.number(),
  untracked: z.number(),
  conflicts: z.number(),
  ahead: z.number(),
  behind: z.number(),
})
export type Status = z.infer<typeof Status>

export const RepositoryStatus = Rpc.define({
  id: "shuvcode.repository-status",
  methods: { get: { input: z.object({}), output: Status.nullable() } },
  events: {},
})
