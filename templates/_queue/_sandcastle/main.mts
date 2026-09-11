// Sandcastle runner: implement one GitHub issue in a Docker sandbox on this
// machine, review it in the same sandbox with a second session, then push the
// branch and open the pull request from the host. The on-demand alternative to
// the queue's implement workflow, for when the GitHub-hosted runner is not
// enough (a long build, a local service, a bigger model budget).
//
//   {{pmExecLocalCmd}} tsx .sandcastle/main.mts <issue-number>
//
// The sandbox never talks to GitHub: the issue and the pull requests it refers
// to are fetched here with the host's gh login and injected into the prompts,
// and the push and `gh pr create` run here afterwards. The only secret the
// container needs is CLAUDE_CODE_OAUTH_TOKEN from .sandcastle/.env.
//
// Needs `@ai-hero/sandcastle` and `tsx` installed (see .sandcastle/README.md);
// this directory is outside the repository's lint and typecheck.
import { execFileSync } from 'node:child_process';
import { claudeCode, createSandbox } from '@ai-hero/sandcastle';
import { sandboxOptions } from './sandbox.mts';

const sh = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const REPO = sh('gh', ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
const BASE = 'origin/main';
// Take the first numeric argument wherever it sits (a runner may forward `--`).
const issue = process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? '';
if (!issue) {
  console.error('usage: {{pmExecLocalCmd}} tsx .sandcastle/main.mts <issue-number>');
  process.exit(2);
}

const gh = (...args: string[]) => sh('gh', [...args, '--repo', REPO]);

// Context gathered on the host, with the host's gh login.
const issueText = gh(
  'issue',
  'view',
  issue,
  '--json',
  'title,body,comments',
  '--jq',
  '"# \\(.title)\\n\\n\\(.body)" + ([.comments[] | "\\n\\n---\\n[\\(.author.login)]\\n\\(.body)"] | join(""))',
);
const referenced = [...new Set([...issueText.matchAll(/#(\d{2,5})\b/g)].map((m) => m[1]))]
  .filter((n): n is string => typeof n === 'string' && n !== issue)
  .slice(0, 6);
const prContext = referenced
  .map((n) => {
    try {
      return gh(
        'pr',
        'view',
        n,
        '--json',
        'number,title,body',
        '--jq',
        '"## Pull request #\\(.number): \\(.title)\\n\\n\\(.body)"',
      );
    } catch {
      return `## #${n}: not a pull request, or not readable`;
    }
  })
  .join('\n\n');

// The agent's branch starts from origin/main, whatever the host has checked out.
const branch = `sandcastle/issue-${issue}`;
sh('git', ['fetch', '-q', 'origin', 'main']);
try {
  sh('git', ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]);
  console.log(`branch ${branch} already exists; reusing it`);
} catch {
  sh('git', ['branch', branch, BASE]);
  console.log(`created ${branch} from ${BASE}`);
}

const started = Date.now();
const since = (t: number) => `${Math.round((Date.now() - t) / 1000)}s`;
type Ran = Awaited<ReturnType<Awaited<ReturnType<typeof createSandbox>>['run']>>;
// Per-iteration snapshots of the last assistant message, not run totals.
const usage = (r: Ran) =>
  r.iterations.reduce(
    (acc, it) => ({
      input: acc.input + (it.usage?.inputTokens ?? 0) + (it.usage?.cacheReadInputTokens ?? 0),
      output: acc.output + (it.usage?.outputTokens ?? 0),
    }),
    { input: 0, output: 0 },
  );

const sandbox = await createSandbox({ branch, ...sandboxOptions() });
console.log(`sandbox ready in ${since(started)}`);

let implement: Ran | undefined;
let review: Ran | undefined;
try {
  const t1 = Date.now();
  implement = await sandbox.run({
    name: 'implementer',
    maxIterations: 2,
    agent: claudeCode('claude-sonnet-5'),
    promptFile: '.sandcastle/implement-prompt.md',
    promptArgs: {
      ISSUE_NUMBER: issue,
      ISSUE_TEXT: issueText,
      PR_CONTEXT: prContext || '(none referenced)',
      BASE,
    },
    logging: { type: 'file', path: `.sandcastle/logs/issue-${issue}-implement.log` },
  });
  console.log(
    `implement: ${implement.iterations.length} iteration(s), ${implement.commits.length} commit(s), signal=${implement.completionSignal ?? 'none'}, ${since(t1)}, last-message tokens=${JSON.stringify(usage(implement))}`,
  );

  if (implement.commits.length) {
    const t2 = Date.now();
    review = await sandbox.run({
      name: 'reviewer',
      maxIterations: 1,
      agent: claudeCode('claude-opus-5'),
      promptFile: '.sandcastle/review-prompt.md',
      promptArgs: { ISSUE_NUMBER: issue, ISSUE_TEXT: issueText, BASE },
      logging: { type: 'file', path: `.sandcastle/logs/issue-${issue}-review.log` },
    });
    console.log(
      `review: ${review.iterations.length} iteration(s), ${review.commits.length} commit(s), signal=${review.completionSignal ?? 'none'}, ${since(t2)}, last-message tokens=${JSON.stringify(usage(review))}`,
    );
  }
} finally {
  await sandbox.close();
}

const firstCommit = implement?.commits[0];
if (!implement || !firstCommit) {
  console.log('no commits; nothing to push. Implementer output tail:');
  console.log(implement?.stdout.slice(-1500) ?? '(no output)');
  process.exit(1);
}

// Push and open the pull request from the host, so CI, the review workflow
// and branch protection gate it exactly like any other PR. The title comes
// from the implementer's first commit: the branch tip may be the reviewer's.
const title = sh('git', ['log', '-1', '--format=%s', firstCommit.sha]);
const reviewText = review ? review.stdout.split('<promise>')[0]?.trim().slice(-4000) : '';
const body = [
  `Closes #${issue}.`,
  '',
  "Implemented and reviewed by two Claude Code sessions in a sandcastle Docker sandbox on the maintainer's machine (see `.sandcastle/`), then pushed from the host.",
  '',
  '## Run',
  '',
  `- implement: ${implement.iterations.length} iteration(s), ${implement.commits.length} commit(s)`,
  review
    ? `- review: ${review.iterations.length} iteration(s), ${review.commits.length} commit(s)`
    : '- review: skipped',
  `- wall clock: ${since(started)} including sandbox start and the dependency install`,
  '',
  '## Sandbox review',
  '',
  reviewText || '(no review: implementer made no commits)',
].join('\n');
sh('git', ['push', '-u', 'origin', branch]);
const url = sh('gh', [
  'pr',
  'create',
  '--repo',
  REPO,
  '--base',
  'main',
  '--head',
  branch,
  '--title',
  title,
  '--body',
  body,
  '--label',
  'agent-pr',
]);
console.log(`pull request: ${url}`);
console.log(`done in ${since(started)}`);
