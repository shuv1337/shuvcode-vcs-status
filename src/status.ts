import { execFile } from "node:child_process"
import { stat } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { z } from "zod"
import type { Status } from "./rpc"

const exec = promisify(execFile)
const JjFile = z.tuple([z.string(), z.string(), z.boolean()])
const JjInfo = z.tuple([z.string(), z.array(z.string()), z.string(), z.boolean()])

export async function readStatus(directory: string, signal?: AbortSignal): Promise<Status | null> {
  const root = await findRepository(directory)
  if (!root) return null
  const run = async (command: string, args: string[]) =>
    (
      await exec(command, args, {
        cwd: root.directory,
        signal,
        timeout: 10_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      })
    ).stdout

  if (root.vcs === "jj") {
    // Snapshot first so the files and working-copy identity describe the same jj operation.
    const diff = await run("jj", [
      "diff",
      "--no-pager",
      "--color",
      "never",
      "--template",
      `'[' ++ json(path) ++ ',' ++ json(status_char) ++ ',' ++ json(target.conflict()) ++ "]\\n"`,
    ])
    const info = JjInfo.parse(
      JSON.parse(
        await run("jj", [
          "log",
          "-r",
          "@",
          "--no-graph",
          "--ignore-working-copy",
          "--no-pager",
          "--color",
          "never",
          "-T",
          `'[' ++ json(change_id.short(8)) ++ ',' ++ json(bookmarks.map(|b| b.name())) ++ ',' ++ json(description.first_line()) ++ ',' ++ json(conflict) ++ ']'`,
        ]),
      ),
    )
    const files = diff
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const item = JjFile.parse(JSON.parse(line))
        return { path: item[0], status: item[1], conflict: item[2] }
      })
    return {
      vcs: "jj",
      reference: [info[0], info[1].join(", ")].filter(Boolean).join(" · "),
      description: info[2],
      files,
      staged: 0,
      unstaged: files.length,
      untracked: 0,
      conflicts: Math.max(files.filter((file) => file.conflict).length, Number(info[3])),
      ahead: 0,
      behind: 0,
    }
  }

  return parseGitStatus(await run("git", ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]))
}

async function findRepository(directory: string): Promise<{ directory: string; vcs: "git" | "jj" } | undefined> {
  const markers = await Promise.all(
    [".jj", ".git"].map((name) =>
      stat(path.join(directory, name)).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT" || error.code === "ENOTDIR") return false
          throw error
        },
      ),
    ),
  )
  if (markers[0]) return { directory, vcs: "jj" }
  if (markers[1]) return { directory, vcs: "git" }
  const parent = path.dirname(directory)
  if (parent !== directory) return findRepository(parent)
}

export function parseGitStatus(output: string): Status {
  const result: Status = {
    vcs: "git",
    reference: "",
    description: "",
    files: [],
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
    ahead: 0,
    behind: 0,
  }
  const records = output.split("\0")
  let oid = ""
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (record.startsWith("# branch.oid ")) oid = record.slice(13)
    if (record.startsWith("# branch.head ")) result.reference = record.slice(14)
    if (record.startsWith("# branch.ab ")) {
      const counts = record.slice(12).split(" ")
      result.ahead = Number(counts[0].slice(1))
      result.behind = Number(counts[1].slice(1))
    }
    if (record.startsWith("? ")) {
      result.files.push({ path: record.slice(2), status: "?", conflict: false })
      result.untracked++
      continue
    }
    const kind = record[0]
    if (kind !== "1" && kind !== "2" && kind !== "u") continue
    const fields = record.split(" ")
    const xy = fields[1]
    const conflict = kind === "u"
    result.files.push({
      path: fields.slice(kind === "1" ? 8 : kind === "2" ? 9 : 10).join(" "),
      status: conflict ? "UU" : xy.replaceAll(".", " "),
      conflict,
    })
    if (conflict) result.conflicts++
    if (!conflict && xy[0] !== ".") result.staged++
    if (!conflict && xy[1] !== ".") result.unstaged++
    // Rename/copy records have a second NUL-delimited path, even if it looks like a status record.
    if (kind === "2") index++
  }
  if (result.reference === "(detached)") result.reference = `detached ${oid.slice(0, 8)}`
  return result
}
