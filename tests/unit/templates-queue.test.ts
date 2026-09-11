import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

import { buildToolchainSteps, scaffoldProject } from '../../src/scaffold.ts';
import type { PackageManagerName, TemplateName } from '../../src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(HERE, '..', '..', 'templates');
const QUEUE_DIR = join(TEMPLATES_DIR, '_queue');

/**
 * What the `_queue` bundle adds to every template. The workflows are the
 * queue itself; the prompts are what each workflow's session reads first;
 * the docs are what the vendored skills read; the rest is the local half
 * (settings, sandcastle, the one-time GitHub setup script).
 */
const QUEUE_FILES: ReadonlyArray<string> = [
  '.github/workflows/agent-explore.yml',
  '.github/workflows/agent-implement.yml',
  '.github/workflows/agent-review.yml',
  '.github/workflows/agent-address.yml',
  '.github/workflows/queue-housekeeping.yml',
  '.github/workflows/dependabot-auto-merge.yml',
  '.github/workflows/scheduled-review.yml',
  '.github/prompts/agent-explore.md',
  '.github/prompts/agent-implement.md',
  '.github/prompts/agent-review.md',
  '.github/prompts/agent-address.md',
  '.github/prompts/agent-merge-main.md',
  '.github/prompts/scheduled-review.md',
  'docs/agents/triage-labels.md',
  'docs/agents/issue-tracker.md',
  'docs/agents/domain.md',
  'docs/adr/README.md',
  '.claude/settings.json',
  '.claude/skills/code-review/SKILL.md',
  '.claude/skills/implement/SKILL.md',
  '.claude/skills/triage/SKILL.md',
  'skills-lock.json',
  '.sandcastle/Dockerfile',
  '.sandcastle/main.mts',
  '.sandcastle/sandbox.mts',
  '.sandcastle/smoke.mts',
  '.sandcastle/implement-prompt.md',
  '.sandcastle/review-prompt.md',
  '.sandcastle/env.example',
  '.sandcastle/.gitignore',
  '.sandcastle/README.md',
  '.prettierignore',
  'CONTEXT.md',
  'scripts/queue-install.sh',
];

/** What each template adds of its own so the queue has gates to wait on. */
const TEMPLATE_QUEUE_FILES: ReadonlyArray<string> = [
  '.github/workflows/ci.yml',
  '.github/dependabot.yml',
  'CLAUDE.md',
];

const TEXT_EXTENSIONS = new Set([
  '.yml',
  '.yaml',
  '.md',
  '.json',
  '.sh',
  '.mts',
  '.ts',
  '.example',
]);

async function walkAllFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walkAllFiles(join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out.sort();
}

async function scaffoldWithQueue(
  targetDir: string,
  template: TemplateName,
  pm: PackageManagerName,
): Promise<void> {
  const resolvedInputs = { projectName: 'queue-app', template, pm };
  await scaffoldProject({ templateDir: join(TEMPLATES_DIR, template), targetDir, resolvedInputs });
  await scaffoldProject({ templateDir: QUEUE_DIR, targetDir, resolvedInputs });
}

let tempRoot: string;
beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'crapp-queue-'));
});
afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('templates/_queue: the AFK agent queue bundle', () => {
  it('has no `.github` of its own inside the template directories beyond ci.yml and dependabot.yml', async () => {
    for (const template of ['web', 'mobile', 'monolith'] as const) {
      const files = await walkAllFiles(join(TEMPLATES_DIR, template, '_github'));
      expect(files, template).toEqual(['dependabot.yml', 'workflows/ci.yml']);
    }
  });

  it('lands every queue file next to the template, for each template', async () => {
    for (const template of ['web', 'mobile', 'monolith'] as const) {
      const targetDir = join(tempRoot, template);
      await scaffoldWithQueue(targetDir, template, 'npm');
      for (const file of [...QUEUE_FILES, ...TEMPLATE_QUEUE_FILES]) {
        const info = await stat(join(targetDir, file)).catch(() => null);
        expect(info?.isFile(), `${template}: ${file}`).toBe(true);
      }
    }
  });

  it('leaves no {{...}} token in any queue text file, for each package manager', async () => {
    for (const pm of ['npm', 'pnpm', 'yarn'] as const) {
      const targetDir = join(tempRoot, `web-${pm}`);
      await scaffoldWithQueue(targetDir, 'web', pm);
      for (const file of [...QUEUE_FILES, ...TEMPLATE_QUEUE_FILES]) {
        const ext = file.slice(file.lastIndexOf('.'));
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        const text = await readFile(join(targetDir, file), 'utf8');
        expect(text, `${pm}: ${file}`).not.toMatch(/\{\{\s*(pm|project)[A-Za-z]*\s*\}\}/);
      }
    }
  });

  it('renders the package manager into the workflows: setup steps, install, run, audit', async () => {
    const cases: ReadonlyArray<{
      pm: PackageManagerName;
      ci: string;
      run: string;
      audit: string;
      setup: string;
      notSetup: string;
    }> = [
      {
        pm: 'npm',
        ci: 'run: npm ci',
        run: 'Bash(npm run typecheck)',
        audit: 'Bash(npm audit --audit-level=moderate)',
        setup: 'cache: npm',
        notSetup: 'pnpm/action-setup',
      },
      {
        pm: 'pnpm',
        ci: 'run: pnpm install --frozen-lockfile',
        run: 'Bash(pnpm run typecheck)',
        audit: 'Bash(pnpm audit --audit-level moderate)',
        setup: 'pnpm/action-setup@v6',
        notSetup: 'cache: npm',
      },
      {
        pm: 'yarn',
        ci: 'run: yarn install --immutable',
        run: 'Bash(yarn run typecheck)',
        audit: 'Bash(yarn npm audit --all --recursive --severity moderate)',
        setup: 'cache: yarn',
        notSetup: 'pnpm/action-setup',
      },
    ];
    for (const c of cases) {
      const targetDir = join(tempRoot, `mobile-${c.pm}`);
      await scaffoldWithQueue(targetDir, 'mobile', c.pm);
      const ci = await readFile(join(targetDir, '.github/workflows/ci.yml'), 'utf8');
      const implement = await readFile(
        join(targetDir, '.github/workflows/agent-implement.yml'),
        'utf8',
      );
      const scheduled = await readFile(
        join(targetDir, '.github/workflows/scheduled-review.yml'),
        'utf8',
      );
      expect(ci, c.pm).toContain(c.ci);
      expect(ci, c.pm).toContain(c.setup);
      expect(ci, c.pm).not.toContain(c.notSetup);
      expect(implement, c.pm).toContain(c.run);
      expect(implement, c.pm).toContain(c.setup);
      expect(scheduled, c.pm).toContain(c.audit);
    }
  });

  it('buildToolchainSteps yields a YAML list fragment at step indentation, pnpm with its own setup action', () => {
    for (const pm of ['npm', 'pnpm', 'yarn'] as const) {
      const steps = buildToolchainSteps(pm);
      expect(/^ {6}- (uses|run): /.test(steps), pm).toBe(true);
      expect(steps.endsWith('\n'), pm).toBe(false);
      for (const line of steps.split('\n'))
        expect(line === '' || line.startsWith('      '), `${pm}: ${line}`).toBe(true);
      expect(steps).toContain(`cache: ${pm}`);
      expect(steps.includes('pnpm/action-setup@v6'), pm).toBe(pm === 'pnpm');
      expect(steps.includes('corepack install -g yarn@4'), pm).toBe(pm === 'yarn');
    }
  });

  it('generates a prettier-clean tree, so the CI `check` job the queue waits on passes on day one', async () => {
    for (const [template, pm] of [
      ['web', 'npm'],
      ['mobile', 'yarn'],
      ['monolith', 'pnpm'],
    ] as const) {
      const targetDir = join(tempRoot, `${template}-${pm}`);
      await scaffoldWithQueue(targetDir, template, pm);
      const ignorePath = join(targetDir, '.prettierignore');
      const dirty: string[] = [];
      let checked = 0;
      for (const file of await walkAllFiles(targetDir)) {
        const filepath = join(targetDir, file);
        const info = await prettier.getFileInfo(filepath, { ignorePath });
        if (info.ignored || !info.inferredParser) continue;
        // The generated repository's own config (the `prettier` key in its package.json).
        const config = (await prettier.resolveConfig(filepath)) ?? {};
        const text = await readFile(filepath, 'utf8');
        if (!(await prettier.check(text, { ...config, filepath }))) dirty.push(file);
        checked += 1;
      }
      expect(dirty, `${template}-${pm}`).toEqual([]);
      expect(checked, `${template}-${pm}`).toBeGreaterThan(60);
    }
  });

  it('protects the same paths the queue-install script requires as checks', async () => {
    const review = await readFile(join(QUEUE_DIR, '_github/workflows/agent-review.yml'), 'utf8');
    const install = await readFile(join(QUEUE_DIR, 'scripts/queue-install.sh'), 'utf8');
    const ci = await readFile(join(TEMPLATES_DIR, 'web/_github/workflows/ci.yml'), 'utf8');
    // The review's merge job waits on the same check names branch protection requires.
    expect(install).toContain('"contexts": ["check", "security-scan"]');
    expect(ci).toMatch(/^ {2}check:$/m);
    expect(ci).toMatch(/^ {2}security-scan:$/m);
    // The paths a person must merge cover every gate the queue relies on.
    for (const path of [
      '.github/*',
      '.claude/*',
      'docs/agents/*',
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'db/migrations/*',
    ]) {
      expect(review, path).toContain(path);
    }
  });

  it("has a test script in every template package, so the queue's test gate has something to run", async () => {
    for (const pkg of ['web', 'mobile', 'monolith', 'monolith/apps/web', 'monolith/apps/mobile']) {
      const text = await readFile(join(TEMPLATES_DIR, pkg, 'package.json'), 'utf8');
      const parsed = JSON.parse(text) as { scripts: Record<string, string> };
      expect(parsed.scripts.test, pkg).toBeDefined();
    }
  });
});
