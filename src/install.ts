// Package manager abstraction for create-rell-app.
//
// Story 1.4: a single place that knows how to talk to npm/pnpm/yarn —
// install commands, lock file names, run/exec subcommands. Used by runCli
// to perform `<pm> install` after scaffolding and to clean up stale lock
// files left over from the template.
//
// Design notes:
//   - Subprocess execution is gated behind a `ProcessRunner` interface so
//     tests can swap in a fake. The default runner uses `execa` and
//     inherits stdio so the user sees install output in real time.
//   - Lock-file cleanup runs BEFORE install to avoid stale lock files
//     confusing the chosen package manager.
//   - We accept the small footgun that `cleanupLockFiles` deletes any
//     non-selected lock files unconditionally — for a fresh scaffold this is
//     correct behavior. Story 1.5 owns the "target dir already exists"
//     guard rail that prevents stomping on a user's existing project.

import { execa } from 'execa';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { PackageManagerName } from './index.ts';

export interface PackageManagerCommands {
  /** Full install command as a display string, e.g. `"npm install"`. */
  readonly install: string;
  /** Install command broken into its argv components for execa/spawn. */
  readonly installArgv: { readonly binary: string; readonly args: ReadonlyArray<string> };
  /** Run-script prefix as a display string, e.g. `"npm run"`. */
  readonly run: string;
  /** Package executor, e.g. `npx` / `pnpm dlx` / `yarn dlx`. */
  readonly exec: string;
  /** Lock file name, e.g. `package-lock.json`. */
  readonly lockFile: string;
  /** Reproducible install from the lock file, as CI runs it, e.g. `npm ci`. */
  readonly ci: string;
  /** Regenerate the lock file from the manifests without installing. */
  readonly lockfileOnly: string;
  /** Value for `actions/setup-node`'s `cache:` input. */
  readonly nodeCache: string;
  /** Vulnerability audit over the installed tree, e.g. `npm audit`. */
  readonly audit: string;
  /** Why is a package installed, e.g. `npm ls <package>`. */
  readonly why: string;
  /** Add a dev dependency: `npm install -D`, `pnpm add -D`, `yarn add -D`. */
  readonly addDev: string;
  /** Run a locally installed bin (`npx`, `pnpm exec`, `yarn`); `exec` downloads instead. */
  readonly execLocal: string;
}

/**
 * Canonical commands for each supported package manager. Single source of
 * truth for everything CLI-related — adding a new package manager requires
 * exactly one new entry here.
 */
export const PACKAGE_MANAGER_COMMANDS: Readonly<
  Record<PackageManagerName, PackageManagerCommands>
> = {
  npm: {
    install: 'npm install',
    installArgv: { binary: 'npm', args: ['install'] },
    run: 'npm run',
    exec: 'npx',
    lockFile: 'package-lock.json',
    ci: 'npm ci',
    lockfileOnly: 'npm install --package-lock-only',
    nodeCache: 'npm',
    audit: 'npm audit --audit-level=moderate',
    why: 'npm ls',
    addDev: 'npm install -D',
    execLocal: 'npx',
  },
  pnpm: {
    install: 'pnpm install',
    installArgv: { binary: 'pnpm', args: ['install'] },
    run: 'pnpm run',
    exec: 'pnpm dlx',
    lockFile: 'pnpm-lock.yaml',
    ci: 'pnpm install --frozen-lockfile',
    lockfileOnly: 'pnpm install --lockfile-only',
    nodeCache: 'pnpm',
    audit: 'pnpm audit --audit-level moderate',
    why: 'pnpm why -r',
    addDev: 'pnpm add -D',
    execLocal: 'pnpm exec',
  },
  yarn: {
    install: 'yarn install',
    installArgv: { binary: 'yarn', args: ['install'] },
    run: 'yarn run',
    exec: 'yarn dlx',
    lockFile: 'yarn.lock',
    ci: 'yarn install --immutable',
    lockfileOnly: 'yarn install --mode update-lockfile',
    nodeCache: 'yarn',
    audit: 'yarn npm audit --all --recursive --severity moderate',
    why: 'yarn why',
    addDev: 'yarn add -D',
    execLocal: 'yarn',
  },
};

/**
 * Look up the canonical command record for a package manager. Uses a switch
 * to satisfy `noUncheckedIndexedAccess` — every PackageManagerName literal
 * has an entry, but TS still treats `Record<K, V>[k]` as `V | undefined`.
 */
export function getPackageManagerCommands(pm: PackageManagerName): PackageManagerCommands {
  switch (pm) {
    case 'npm':
      return PACKAGE_MANAGER_COMMANDS.npm;
    case 'pnpm':
      return PACKAGE_MANAGER_COMMANDS.pnpm;
    case 'yarn':
      return PACKAGE_MANAGER_COMMANDS.yarn;
  }
}

/**
 * Subprocess runner interface. The default implementation uses `execa` and
 * inherits stdio. Tests inject a fake to avoid spawning real subprocesses.
 */
export interface ProcessRunner {
  run(
    command: string,
    args: ReadonlyArray<string>,
    options: { readonly cwd: string },
  ): Promise<void>;
}

/**
 * Thrown when the package manager subprocess fails (non-zero exit, missing
 * binary, etc.). The CLI top-level catches this and exits with status 1.
 */
export class InstallFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InstallFailedError';
  }
}

/**
 * Default process runner: spawns via execa and inherits stdio so the user
 * sees the package manager's progress in real time. Wraps subprocess errors
 * (including ENOENT for missing binaries) in `InstallFailedError`.
 */
export const defaultProcessRunner: ProcessRunner = {
  async run(command, args, options) {
    try {
      await execa(command, [...args], { cwd: options.cwd, stdio: 'inherit' });
    } catch (err) {
      // Detect missing binary first so we can produce a friendlier hint.
      const code = (err as { code?: string }).code;
      if (code === 'ENOENT') {
        throw new InstallFailedError(
          `Could not find '${command}' in PATH. ` +
            `Install it and re-run create-rell-app, or pick a different package manager.`,
          { cause: err },
        );
      }
      throw new InstallFailedError(`Subprocess '${command} ${args.join(' ')}' failed.`, {
        cause: err,
      });
    }
  },
};

/**
 * Install dependencies in `targetDir` using the chosen package manager.
 * Returns when the subprocess exits successfully; rejects with
 * `InstallFailedError` otherwise.
 *
 * Verifies that `targetDir` exists and is a directory before invoking the
 * runner — otherwise execa would emit a confusing low-level ENOENT.
 */
export async function installDependencies(
  targetDir: string,
  pm: PackageManagerName,
  runner: ProcessRunner = defaultProcessRunner,
): Promise<void> {
  let targetStat;
  try {
    targetStat = await stat(targetDir);
  } catch (err) {
    throw new InstallFailedError(
      `Cannot install dependencies — target directory does not exist: ${targetDir}`,
      { cause: err },
    );
  }
  if (!targetStat.isDirectory()) {
    throw new InstallFailedError(
      `Cannot install dependencies — target path is not a directory: ${targetDir}`,
    );
  }

  const { binary, args } = getPackageManagerCommands(pm).installArgv;
  await runner.run(binary, args, { cwd: targetDir });
}

/**
 * Run the generated project's own `format` script (Prettier, with the
 * project's config) after a successful install. Template files are formatted
 * for a typical project name, but a very short or very long name changes
 * where Prettier wraps the lines that carry it (imports of the monolith's
 * shared package, the tsconfig path map), and the CI `check` job the agent
 * queue waits on runs `format:check` over the whole tree. Formatting once
 * here, before the first commit, makes that job green for any name.
 */
export async function formatProject(
  targetDir: string,
  pm: PackageManagerName,
  runner: ProcessRunner = defaultProcessRunner,
): Promise<void> {
  const [binary, ...args] = getPackageManagerCommands(pm).run.split(' ');
  if (!binary) throw new Error(`no run command for package manager ${pm}`);
  await runner.run(binary, [...args, 'format'], { cwd: targetDir });
}

/**
 * Remove every lock file from `targetDir` that does not match the chosen
 * package manager's lock file. Idempotent — silently ignores missing files.
 *
 * Run BEFORE the install step so a stale lock file from a different
 * package manager (left in the template, copied during scaffold) doesn't
 * confuse the chosen one.
 */
export async function cleanupLockFiles(targetDir: string, pm: PackageManagerName): Promise<void> {
  const keep = getPackageManagerCommands(pm).lockFile;
  const allLockFiles = Object.values(PACKAGE_MANAGER_COMMANDS).map((c) => c.lockFile);

  await Promise.all(
    allLockFiles
      .filter((lockFile) => lockFile !== keep)
      .map((lockFile) => rm(join(targetDir, lockFile), { recursive: true, force: true })),
  );
}
