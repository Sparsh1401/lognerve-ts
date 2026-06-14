import { execFileSync } from "node:child_process";

export interface GitContext {
  gitRepo?: string;
  gitRef?: string;
}

export function readGitContext(overrides: GitContext = {}): GitContext {
  return {
    gitRepo:
      overrides.gitRepo ?? readGit(["config", "--get", "remote.origin.url"]),
    gitRef: overrides.gitRef ?? readGit(["rev-parse", "HEAD"]),
  };
}

// Runs `git` with a fixed argument vector and no shell, so there is no command
// string for any input to be interpolated into.
function readGit(args: string[]): string | undefined {
  try {
    const value = execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: false,
    }).trim();

    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
