// create-rell-app library module.
//
// This module is pure — importing it has no side effects. The actual
// CLI entry point is `src/cli.ts`, which imports buildProgram() from here
// and runs `parseAsync(process.argv)` unconditionally. Splitting the
// entry from the library lets tests import buildProgram/runCli without
// triggering argv parsing, and avoids brittle isMainModule() checks that
// fail under symlinked global bin shims (e.g. `npm install -g`).

import chalk from 'chalk';
import { Command } from 'commander';
import { execa } from 'execa';
import { stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pkg from '../package.json' with { type: 'json' };
import { buildNextStepsLines } from './banner.ts';
import {
  cleanupLockFiles,
  defaultProcessRunner,
  formatProject,
  getPackageManagerCommands,
  installDependencies,
  InstallFailedError,
} from './install.ts';
import type { ProcessRunner } from './install.ts';
import {
  buildPartialInputs,
  defaultPromptDriver,
  gatherInputs,
  isStdinInteractive,
  NonInteractiveStdinError,
  PromptCancelledError,
} from './prompts.ts';
import type { PromptDriver, ResolvedInputs } from './prompts.ts';
import { scaffoldProject } from './scaffold.ts';
import type { ScaffoldResult } from './scaffold.ts';
import {
  assertTargetDirSafe,
  assertValidPackageManager,
  assertValidProjectName,
  assertValidTemplate,
  ValidationError,
} from './validation.ts';

export type TemplateName = 'web' | 'mobile' | 'monolith';
export type PackageManagerName = 'npm' | 'pnpm' | 'yarn';

export interface CliOptions {
  template?: string;
  pm?: string;
  /**
   * Maps to Commander's `--no-install` negation. Commander stores this as
   * `install: false` when `--no-install` is passed; otherwise the field is
   * left undefined (treated as `true` by `runCli`).
   */
  install?: boolean;
  /**
   * Maps to Commander's `--no-git` negation. Commander stores this as
   * `git: false` when `--no-git` is passed; otherwise the field is left
   * undefined (treated as `true` by `runCli`).
   */
  git?: boolean;
  /**
   * Maps to Commander's `--dry-run` flag. When set, runCli walks the
   * template and prints the files it would write but writes nothing to
   * disk and skips git init and dependency install.
   */
  dryRun?: boolean;
  /** Maps to `--yes`/`-y`: skip prompts, default unspecified values. */
  yes?: boolean;
  /**
   * Maps to Commander's `--no-queue` negation. Commander stores this as
   * `queue: false` when `--no-queue` is passed; otherwise the field is left
   * undefined (treated as `true`): every project gets the AFK agent queue
   * (workflows, prompts, skills, agent docs) unless told not to.
   */
  queue?: boolean;
}

/**
 * Build and configure the Commander program. Factored out so tests can
 * call this without triggering argv parsing or process.exit.
 *
 * Note: strict enum validation for --template and --pm is intentionally
 * deferred to Story 1.5 (Error Handling, Validation, and Exit Codes).
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('create-rell-app')
    .description('Scaffold a fully wired Clerk + Supabase + Drizzle starter app')
    .version(pkg.version, '-v, --version', 'output the current version')
    .argument('<project-name>', 'name of the project directory to create')
    .option('-t, --template <template>', 'template to use (web | mobile | monolith)')
    .option('--pm <packageManager>', 'package manager to use (npm | pnpm | yarn)')
    .option('-y, --yes', 'skip prompts; default unspecified values to web + npm')
    .option('--no-install', 'skip dependency installation after scaffolding')
    .option('--no-git', 'skip git repository initialization after scaffolding')
    .option(
      '--no-queue',
      'skip the AFK agent queue (agent workflows and prompts, .claude/, docs/, CONTEXT.md, .sandcastle/, scripts/queue-install.sh)',
    )
    .option('--dry-run', 'show files that would be written without touching the filesystem')
    .action(async (projectName: string, options: CliOptions) => {
      await runCli(projectName, options);
    });

  return program;
}

/**
 * Resolve the absolute path to the bundled `templates/` directory. The CLI
 * is published as an npm package with `templates/` next to `dist/`, so we
 * compute the path relative to the calling source file rather than the
 * (potentially shimmed) cwd.
 *
 * Exported and overrideable so tests can point at a fixture directory.
 */
export function resolveTemplatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/ → ../templates  |  dist/ → ../templates
  return resolve(here, '..', 'templates');
}

/**
 * Compute the absolute target directory for a given project name. Exported
 * for unit testability and to keep the path resolution policy in one place.
 */
export function resolveTargetDir(projectName: string, cwd: string = process.cwd()): string {
  return resolve(cwd, projectName);
}

/**
 * Internal helper used by runCli to perform the scaffold step. Factored out
 * so tests can stub it via dependency injection without mocking modules.
 */
export interface ScaffoldRunner {
  (
    templateDir: string,
    targetDir: string,
    resolved: ResolvedInputs,
    options?: { dryRun?: boolean },
  ): Promise<ScaffoldResult>;
}

const defaultScaffoldRunner: ScaffoldRunner = (templateDir, targetDir, resolved, options) =>
  scaffoldProject({
    templateDir,
    targetDir,
    resolvedInputs: resolved,
    dryRun: options?.dryRun ?? false,
  });

/**
 * Subprocess runner used to invoke `git`. Defaults to spawning execa
 * directly. Tests inject a recording fake to assert behavior without
 * shelling out to a real git binary.
 */
export interface GitRunner {
  (args: ReadonlyArray<string>, options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<void>;
}

const defaultGitRunner: GitRunner = async (args, options) => {
  await execa('git', [...args], { cwd: options.cwd, env: options.env });
};

export interface RunCliDeps {
  driver?: PromptDriver;
  gatherOptions?: { interactive?: boolean };
  templatesDir?: string;
  targetDirOverride?: string;
  scaffoldRunner?: ScaffoldRunner;
  installRunner?: ProcessRunner;
  /** Whether to install dependencies after scaffolding. Defaults to `true`. */
  installDeps?: boolean;
  /** Subprocess runner used to invoke `git` (for tests). */
  gitRunner?: GitRunner;
  /** Whether to initialize a git repo after scaffolding. Defaults to `true`. */
  initGit?: boolean;
  /** When `true`, the scaffold flow runs in dry-run mode. */
  dryRun?: boolean;
  /** Whether to add the AFK agent queue bundle. Defaults to `true`. */
  addQueue?: boolean;
}

export async function runCli(
  projectName: string,
  options: CliOptions,
  driverOrDeps: PromptDriver | RunCliDeps = defaultPromptDriver,
  legacyGatherOptions: { interactive?: boolean } = {},
): Promise<void> {
  // Backwards-compatible signature: callers may pass a PromptDriver as the
  // third argument (the Story 1.2 shape) or a RunCliDeps object (the
  // Story 1.3+ shape). Tests use whichever is more convenient.
  const deps: RunCliDeps = isPromptDriver(driverOrDeps)
    ? { driver: driverOrDeps, gatherOptions: legacyGatherOptions }
    : driverOrDeps;

  const driver = deps.driver ?? defaultPromptDriver;
  const gatherOptions = deps.gatherOptions ?? {};
  // Default `interactive` from real stdin TTY status when not specified, so
  // the validation logic below knows whether it can fall back to prompts.
  const interactive = gatherOptions.interactive ?? isStdinInteractive();
  const templatesDir = deps.templatesDir ?? resolveTemplatesDir();
  const scaffoldRunner = deps.scaffoldRunner ?? defaultScaffoldRunner;
  const installRunner = deps.installRunner ?? defaultProcessRunner;
  const gitRunner = deps.gitRunner ?? defaultGitRunner;
  // Dry-run is a global short-circuit: it forces install + git off and
  // tells the scaffold runner not to write anything.
  const dryRun = deps.dryRun ?? options.dryRun ?? false;
  // `--no-install` (Commander negation) flips this to false. The deps
  // override (used by tests) takes precedence over the CLI flag default.
  const shouldInstallDeps = dryRun ? false : (deps.installDeps ?? options.install ?? true);
  // `--no-git` (Commander negation) works the same way.
  const shouldInitGit = dryRun ? false : (deps.initGit ?? options.git ?? true);
  // `--no-queue` likewise; dry-run still plans the queue files.
  const shouldAddQueue = deps.addQueue ?? options.queue ?? true;

  try {
    // === Story 1.5 validation gate ===
    // Project name is always validated — there's no second chance to enter
    // it (the positional arg is parsed before runCli is called).
    assertValidProjectName(projectName);

    // Strict flag validation only fires in non-interactive mode. In
    // interactive mode we preserve Story 1.2's friendly drop-and-reprompt
    // UX.
    if (!interactive) {
      if (options.template !== undefined) assertValidTemplate(options.template);
      if (options.pm !== undefined) assertValidPackageManager(options.pm);
    }

    const partial = buildPartialInputs(projectName, options.template, options.pm);

    // `--yes`: fill any unspecified values with defaults and skip prompting.
    const useDefaults = options.yes === true;
    if (useDefaults) {
      partial.template ??= 'web';
      partial.pm ??= 'npm';
    }

    let resolved;
    try {
      resolved = await gatherInputs(partial, driver, {
        interactive: useDefaults ? false : interactive,
      });
    } catch (err) {
      if (err instanceof PromptCancelledError) {
        // User hit Ctrl+C during a prompt. Exit cleanly without a trace.
        console.error('Aborted.');
        process.exit(130); // 128 + SIGINT(2), conventional for cancellation.
      }
      if (err instanceof NonInteractiveStdinError) {
        console.error('Error: %s', err.message);
        process.exit(1);
      }
      throw err;
    }

    const targetDir = deps.targetDirOverride ?? resolveTargetDir(resolved.projectName);

    // Refuse to scaffold over an existing non-empty directory unless the
    // user explicitly confirms (interactive only).
    await assertTargetDirSafe(targetDir, { interactive, driver });

    await executeScaffoldFlow({
      resolved,
      templatesDir,
      targetDir,
      scaffoldRunner,
      installRunner,
      gitRunner,
      shouldInstallDeps,
      shouldInitGit,
      shouldAddQueue,
      dryRun,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Run the scaffold + install steps after validation has passed. Extracted
 * from `runCli` so the validation flow stays readable.
 */
interface ExecuteScaffoldFlowOptions {
  resolved: ResolvedInputs;
  templatesDir: string;
  targetDir: string;
  scaffoldRunner: ScaffoldRunner;
  installRunner: ProcessRunner;
  gitRunner: GitRunner;
  shouldInstallDeps: boolean;
  shouldInitGit: boolean;
  shouldAddQueue: boolean;
  dryRun: boolean;
}

/**
 * Name of the shared bundle directory under `templates/` that carries the
 * AFK agent queue. It is not a template a user can choose; it is layered on
 * top of whichever template was chosen.
 */
export const QUEUE_BUNDLE_DIR = '_queue';

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function executeScaffoldFlow(opts: ExecuteScaffoldFlowOptions): Promise<void> {
  const {
    resolved,
    templatesDir,
    targetDir,
    scaffoldRunner,
    installRunner,
    gitRunner,
    shouldInstallDeps,
    shouldInitGit,
    shouldAddQueue,
    dryRun,
  } = opts;
  const templateDir = resolve(templatesDir, resolved.template);
  const queueDir = resolve(templatesDir, QUEUE_BUNDLE_DIR);

  console.log('');
  console.log(chalk.bold('create-rell-app'));
  console.log('  project name : %s', resolved.projectName);
  console.log('  template     : %s', resolved.template);
  console.log('  package mgr  : %s', resolved.pm);
  if (dryRun) console.log('  mode         : %s', 'dry-run (no files written)');

  // Scaffold the chosen template. In a published build the template
  // directory is always present; the guard below is defensive.
  const templateExists = await pathExists(templateDir);
  if (!templateExists) {
    console.log(
      '[create-rell-app] template "%s" is not yet bundled in this build — skipping scaffold.',
      resolved.template,
    );
    return;
  }

  const templateResult = await scaffoldRunner(templateDir, targetDir, resolved, { dryRun });

  // The AFK agent queue is a second template layered on the first: the same
  // engine, the same tokens, one shared bundle for every template. It shares
  // directories with a template's own files (`.github/` holds the template's
  // ci.yml and dependabot.yml next to the queue's workflows) but never a file
  // name, so order does not matter beyond the log.
  let queueResult: ScaffoldResult | undefined;
  if (shouldAddQueue && (await pathExists(queueDir))) {
    queueResult = await scaffoldRunner(queueDir, targetDir, resolved, { dryRun });
  } else if (shouldAddQueue) {
    console.log('[create-rell-app] the agent queue bundle is not in this build — skipping it.');
  } else {
    console.log(chalk.dim('[create-rell-app] skipping the agent queue (--no-queue)'));
  }
  const result: ScaffoldResult = {
    filesWritten: templateResult.filesWritten + (queueResult?.filesWritten ?? 0),
    targetDir: templateResult.targetDir,
    plannedFiles: [...(templateResult.plannedFiles ?? []), ...(queueResult?.plannedFiles ?? [])],
  };

  if (dryRun) {
    console.log(
      '[create-rell-app] Would scaffold %d files into %s',
      result.filesWritten,
      result.targetDir,
    );
    const plannedFiles = result.plannedFiles ?? [];
    for (const rel of plannedFiles) {
      console.log('  %s', rel);
    }
    console.log(chalk.dim('[create-rell-app] dry-run complete — no files were written'));
    return;
  }

  console.log(
    '[create-rell-app] scaffolded %d files into %s',
    result.filesWritten,
    result.targetDir,
  );

  if (!shouldInstallDeps) {
    console.log(chalk.dim('[create-rell-app] skipping dependency install'));
  } else {
    // Clean up stale lock files BEFORE running install so the chosen
    // package manager doesn't get confused by leftovers from a different
    // one.
    await cleanupLockFiles(targetDir, resolved.pm);

    console.log(chalk.cyan(`Installing dependencies with ${resolved.pm}…`));
    try {
      await installDependencies(targetDir, resolved.pm, installRunner);
    } catch (err) {
      if (err instanceof InstallFailedError) {
        console.error(chalk.red(`Install failed: ${err.message}`));
        process.exit(1);
      }
      throw err;
    }

    // Prettier is now installed, so the tree can be formatted for this
    // project's name before the first commit (see formatProject).
    console.log(chalk.cyan('Formatting the generated files…'));
    try {
      await formatProject(targetDir, resolved.pm, installRunner);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        chalk.yellow(
          `Formatting skipped (run "${getPackageManagerCommands(resolved.pm).run} format" yourself): ${message}`,
        ),
      );
    }
  }

  if (shouldInitGit) {
    await initGitRepo(targetDir, gitRunner);
  }

  printNextSteps(resolved, targetDir, shouldAddQueue);
}

/**
 * Initialize a git repository inside the freshly scaffolded project and
 * create an initial commit. Failures are non-fatal: we print a dim warning
 * and keep going so a missing or misconfigured git install can't break the
 * scaffold flow.
 */
async function initGitRepo(targetDir: string, gitRunner: GitRunner): Promise<void> {
  const gitDir = resolve(targetDir, '.git');
  if (await pathExists(gitDir)) return;
  try {
    await gitRunner(['init', '--quiet'], { cwd: targetDir });
    await gitRunner(['add', '.'], { cwd: targetDir });
    await gitRunner(['commit', '--quiet', '-m', 'chore: initial scaffold'], {
      cwd: targetDir,
      // Skip husky hooks on the first commit — the template ships husky
      // hooks that would otherwise run against an empty commit history.
      env: { ...process.env, HUSKY: '0' },
    });
  } catch {
    console.log(
      chalk.dim('[create-rell-app] git init skipped (git not available or commit failed)'),
    );
  }
}

/**
 * Print the post-scaffold next-steps banner. Composition lives in
 * `buildNextStepsLines` (pure, tested); this only styles + writes.
 */
function printNextSteps(resolved: ResolvedInputs, targetDir: string, withQueue = true): void {
  const lines = buildNextStepsLines(resolved, targetDir, process.cwd(), { withQueue });
  console.log('');
  for (const line of lines) {
    if (line.startsWith('Success!')) {
      console.log(chalk.green('Success!') + line.slice('Success!'.length));
    } else if (/^\s+(cd |[0-9]\. )/.test(line)) {
      console.log(chalk.cyan(line));
    } else {
      console.log(line);
    }
  }
}

/**
 * Discriminate between the legacy `PromptDriver` third-arg and the modern
 * `RunCliDeps` object based on the presence of method-shaped fields.
 */
function isPromptDriver(value: PromptDriver | RunCliDeps): value is PromptDriver {
  return (
    typeof (value as PromptDriver).text === 'function' &&
    typeof (value as PromptDriver).select === 'function'
  );
}
