import { execSync } from "node:child_process";

export interface GitContext {
  gitRepo?: string;
  gitRef?: string;
}

export function readGitContext(overrides: GitContext = {}): GitContext {
  return {
    gitRepo: overrides.gitRepo ?? readGit("git config --get remote.origin.url"),
    gitRef: overrides.gitRef ?? readGit("git rev-parse HEAD"),
  };
}

function readGit(command: string): string | undefined {
  try {
    const value = execSync(command, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
