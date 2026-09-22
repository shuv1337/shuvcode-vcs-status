import { afterEach, expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { readStatus } from "../src/status"

const exec = promisify(execFile)
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixture(vcs: "git" | "jj") {
  const directory = await mkdtemp(path.join(tmpdir(), "vcs-sidebar-"))
  directories.push(directory)
  const run = (command: string, ...args: string[]) => exec(command, args, { cwd: directory })
  if (vcs === "jj") await run("jj", "git", "init", "--colocate")
  if (vcs === "git") await run("git", "init", "-b", "test-branch")
  await run("git", "config", "user.name", "Test")
  await run("git", "config", "user.email", "test@example.com")
  return { directory, run }
}

test("Git handles unborn, staged, unstaged, untracked and renamed paths", async () => {
  const repo = await fixture("git")
  expect(await readStatus(repo.directory)).toMatchObject({ reference: "test-branch", files: [] })
  await Bun.write(path.join(repo.directory, "old name.txt"), "initial\n")
  await repo.run("git", "add", ".")
  await repo.run("git", "commit", "-m", "initial")
  await repo.run("git", "mv", "old name.txt", "new name.txt")
  await Bun.write(path.join(repo.directory, "new name.txt"), "initial\nmore\n")
  await Bun.write(path.join(repo.directory, "untracked\nfile.txt"), "new\n")
  await mkdir(path.join(repo.directory, "nested"))
  expect(await readStatus(path.join(repo.directory, "nested"))).toMatchObject({
    vcs: "git",
    reference: "test-branch",
    staged: 1,
    unstaged: 1,
    untracked: 1,
    files: [
      { path: "new name.txt", status: "RM", conflict: false },
      { path: "untracked\nfile.txt", status: "?", conflict: false },
    ],
  })
})

test("Git reports conflicts and detached HEAD", async () => {
  const repo = await fixture("git")
  await Bun.write(path.join(repo.directory, "file"), "base\n")
  await repo.run("git", "add", ".")
  await repo.run("git", "commit", "-m", "base")
  await repo.run("git", "checkout", "-b", "other")
  await Bun.write(path.join(repo.directory, "file"), "other\n")
  await repo.run("git", "commit", "-am", "other")
  await repo.run("git", "checkout", "test-branch")
  await Bun.write(path.join(repo.directory, "file"), "branch\n")
  await repo.run("git", "commit", "-am", "branch")
  await repo.run("git", "merge", "other").catch(() => {})
  expect(await readStatus(repo.directory)).toMatchObject({
    conflicts: 1,
    files: [{ path: "file", status: "UU", conflict: true }],
  })
  await repo.run("git", "merge", "--abort")
  await repo.run("git", "checkout", "--detach")
  expect((await readStatus(repo.directory))?.reference).toMatch(/^detached [0-9a-f]{8}$/)
})

test("jj wins over colocated Git and includes unsnapshotted edits and bookmarks", async () => {
  const repo = await fixture("jj")
  await repo.run("jj", "describe", "-m", "Working change")
  await repo.run("jj", "bookmark", "create", "sidebar-test")
  await Bun.write(path.join(repo.directory, 'quoted "name"\n.txt'), "new\n")
  const status = await readStatus(repo.directory)
  expect(status).toMatchObject({
    vcs: "jj",
    description: "Working change",
    conflicts: 0,
    files: [{ path: 'quoted "name"\n.txt', status: "A", conflict: false }],
  })
  expect(status?.reference).toContain("sidebar-test")
})

test("jj workspace status uses that workspace, not the canonical checkout", async () => {
  const repo = await fixture("jj")
  const workspace = path.join(repo.directory, "workspace")
  await repo.run("jj", "workspace", "add", workspace)
  await Bun.write(path.join(workspace, "workspace-only.txt"), "new\n")
  expect(await readStatus(workspace)).toMatchObject({
    vcs: "jj",
    files: [{ path: "workspace-only.txt", status: "A" }],
  })
})

test("non-repositories return null and cancelled reads reject", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "vcs-sidebar-empty-"))
  directories.push(directory)
  expect(await readStatus(directory)).toBeNull()
  const repo = await fixture("git")
  await expect(readStatus(repo.directory, AbortSignal.abort())).rejects.toThrow()
})
