// Token-free smoke of the sandbox mechanics: worktree and the dependency
// install inside the container. No agent runs, so no token is needed.
//
//   {{pmExecLocalCmd}} tsx .sandcastle/smoke.mts
import { execFileSync } from 'node:child_process';
import { createSandbox } from '@ai-hero/sandcastle';
import { sandboxOptions } from './sandbox.mts';

const branch = 'sandcastle/smoke';
const t0 = Date.now();
const since = () => `${Math.round((Date.now() - t0) / 1000)}s`;
const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const sandbox = await createSandbox({ branch, ...sandboxOptions() });
console.log(`sandbox ready (dependencies installed) in ${since()}`);
try {
  for (const cmd of [
    'node -v && claude --version',
    'ls node_modules | wc -l',
    'git status -sb | head -3',
    '{{pmRunCmd}} format:check 2>&1 | tail -1',
  ]) {
    const r = await sandbox.exec(cmd);
    console.log(`$ ${cmd}\n${(r.stdout || r.stderr).trim().slice(0, 400)} [exit ${r.exitCode}]`);
  }
} finally {
  await sandbox.close();
  // The smoke's branch and worktree are throwaway. The worktree path comes
  // from git itself; a guessed path that no longer matches would print
  // success and leave state behind.
  const entries = sh('git', ['worktree', 'list', '--porcelain']).split('\n\n');
  const mine = entries.find((e) => e.includes(`branch refs/heads/${branch}`));
  const path = mine
    ?.split('\n')
    .find((l) => l.startsWith('worktree '))
    ?.slice('worktree '.length);
  if (path) {
    sh('git', ['worktree', 'remove', '--force', path]);
  } else {
    console.log(`sandcastle already removed the worktree for ${branch}`);
  }
  sh('git', ['worktree', 'prune']);
  sh('git', ['branch', '-D', branch]);
}
console.log(`closed and cleaned up in ${since()}`);
