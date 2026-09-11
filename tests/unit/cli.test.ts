import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProgram, runCli } from '../../src/index.ts';
import type { GitRunner } from '../../src/index.ts';
import type { PromptDriver, ResolvedInputs } from '../../src/prompts.ts';
import type { ScaffoldResult } from '../../src/scaffold.ts';
import type { ProcessRunner } from '../../src/install.ts';
import { InstallFailedError } from '../../src/install.ts';

/** No-op git runner used to keep unit tests off the real git binary. */
const noopGitRunner: GitRunner = () => Promise.resolve();

describe('buildProgram', () => {
  it('parses project name, --template, and --pm flags', () => {
    const program = buildProgram();
    program.exitOverride();

    // Prevent the default action from firing during parse() so we can
    // inspect the populated state without running runCli().
    program.action(() => {});

    program.parse(['my-project', '--template', 'monolith', '--pm', 'pnpm'], { from: 'user' });

    const opts = program.opts();
    expect(program.args[0]).toBe('my-project');
    expect(opts.template).toBe('monolith');
    expect(opts.pm).toBe('pnpm');
  });

  it('parses the short -t alias for --template', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    program.parse(['my-project', '-t', 'web'], { from: 'user' });

    expect(program.opts().template).toBe('web');
  });

  it('leaves template and pm undefined when no flags are given', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    program.parse(['my-project'], { from: 'user' });

    const opts = program.opts();
    expect(opts.template).toBeUndefined();
    expect(opts.pm).toBeUndefined();
  });

  it('exposes usage information via helpInformation()', () => {
    const program = buildProgram();
    program.exitOverride();

    const help = program.helpInformation();

    expect(help).toContain('create-rell-app');
    expect(help).toContain('<project-name>');
    expect(help).toContain('--template');
    expect(help).toContain('--pm');
    expect(help).toContain('--no-install');
  });

  it('throws on missing required positional argument when exitOverride is set', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    expect(() => program.parse([], { from: 'user' })).toThrow();
  });

  it('parses --no-install as install: false', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    program.parse(['my-project', '--no-install'], { from: 'user' });

    expect(program.opts().install).toBe(false);
  });

  it('leaves install undefined (default true) when --no-install is not passed', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    program.parse(['my-project'], { from: 'user' });

    // Commander stores the default for `--no-X` as true. We accept either
    // `true` or `undefined` here since the consuming code coerces it.
    const install = program.opts().install;
    expect(install === true || install === undefined).toBe(true);
  });

  it('parses --no-git as git: false', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    program.parse(['my-project', '--no-git'], { from: 'user' });

    expect(program.opts().git).toBe(false);
  });

  it('leaves git defaulted to true (or undefined) when --no-git is not passed', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    program.parse(['my-project'], { from: 'user' });

    const git = program.opts().git;
    expect(git === true || git === undefined).toBe(true);
  });

  it('parses --dry-run as dryRun: true', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});

    program.parse(['my-project', '--dry-run'], { from: 'user' });

    expect(program.opts().dryRun).toBe(true);
  });

  it('exposes --no-git and --dry-run in help output', () => {
    const program = buildProgram();
    program.exitOverride();

    const help = program.helpInformation();

    expect(help).toContain('--no-git');
    expect(help).toContain('--dry-run');
  });

  it('parses --yes / -y as yes: true', () => {
    const program = buildProgram();
    program.exitOverride();
    program.action(() => {});
    program.parse(['my-project', '-y'], { from: 'user' });
    expect(program.opts().yes).toBe(true);
  });
});

describe('runCli (action handler)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let legacyTempRoot: string;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    legacyTempRoot = mkdtempSync(join(tmpdir(), 'crapp-legacy-cli-'));
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(legacyTempRoot, { recursive: true, force: true });
  });

  function makeRecordingDriver(selectAnswers: string[] = []): {
    driver: PromptDriver;
    selectCallCount: { count: number };
  } {
    const queue = [...selectAnswers];
    const selectCallCount = { count: 0 };
    const driver: PromptDriver = {
      text({ default: defaultValue }) {
        return Promise.resolve(defaultValue ?? '');
      },
      select({ choices }) {
        selectCallCount.count += 1;
        const queued = queue.shift();
        if (queued !== undefined) {
          const match = choices.find((c) => c.value === queued);
          if (!match) throw new Error(`unknown choice ${queued}`);
          return Promise.resolve(match.value);
        }
        const first = choices[0];
        if (!first) throw new Error('empty choices');
        return Promise.resolve(first.value);
      },
      confirm({ default: defaultValue }) {
        return Promise.resolve(defaultValue ?? false);
      },
    };
    return { driver, selectCallCount };
  }

  it('logs the resolved project name, template, and package manager when all flags are provided', async () => {
    const { driver, selectCallCount } = makeRecordingDriver();

    await runCli(
      'my-project',
      { template: 'monolith', pm: 'pnpm' },
      {
        driver,
        gatherOptions: { interactive: true },
        // Point at an empty templates dir so the scaffold step takes the
        // "template not yet bundled" branch and we don't touch cwd.
        templatesDir: join(legacyTempRoot, 'empty-templates'),
        targetDirOverride: join(legacyTempRoot, 'out-my-project'),
        installDeps: false,
      },
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('my-project');
    expect(output).toContain('monolith');
    expect(output).toContain('pnpm');
    // Both flags provided → no select prompts.
    expect(selectCallCount.count).toBe(0);
  });

  it('prompts for missing template and package manager when no flags are provided', async () => {
    const { driver, selectCallCount } = makeRecordingDriver(['web', 'npm']);

    await runCli(
      'minimal-project',
      {},
      {
        driver,
        gatherOptions: { interactive: true },
        templatesDir: join(legacyTempRoot, 'empty-templates'),
        targetDirOverride: join(legacyTempRoot, 'out-minimal'),
        installDeps: false,
      },
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('minimal-project');
    expect(output).toContain('web');
    expect(output).toContain('npm');
    expect(selectCallCount.count).toBe(2);
  });

  it('drops invalid flag values and re-prompts via the driver', async () => {
    // Pretend Commander parsed `--template react --pm bun`. Both should be
    // sanitized to undefined and the prompts shown.
    const { driver, selectCallCount } = makeRecordingDriver(['mobile', 'yarn']);

    await runCli(
      'my-project',
      { template: 'react', pm: 'bun' },
      {
        driver,
        gatherOptions: { interactive: true },
        templatesDir: join(legacyTempRoot, 'empty-templates'),
        targetDirOverride: join(legacyTempRoot, 'out-reprompt'),
        installDeps: false,
      },
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('mobile');
    expect(output).toContain('yarn');
    expect(selectCallCount.count).toBe(2);
  });

  it('with --yes and no flags in non-interactive mode, defaults to web + npm (no error)', async () => {
    const { driver, selectCallCount } = makeRecordingDriver();
    await runCli(
      'yes-project',
      { yes: true },
      {
        driver,
        gatherOptions: { interactive: false },
        templatesDir: join(legacyTempRoot, 'empty-templates'),
        targetDirOverride: join(legacyTempRoot, 'out-yes'),
        installDeps: false,
      },
    );
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('yes-project');
    expect(output).toContain('web');
    expect(output).toContain('npm');
    expect(selectCallCount.count).toBe(0);
  });

  it('exits with code 1 when stdin is non-interactive and required flags are missing', async () => {
    const { driver } = makeRecordingDriver();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);

    try {
      await expect(runCli('my-project', {}, driver, { interactive: false })).rejects.toThrow(
        'process.exit:1',
      );
      expect(errSpy).toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

describe('runCli scaffold integration', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let tempRoot: string;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    tempRoot = mkdtempSync(join(tmpdir(), 'crapp-cli-'));
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function quietDriver(confirmDefault = true): PromptDriver {
    return {
      text: ({ default: defaultValue }) => Promise.resolve(defaultValue ?? ''),
      select: ({ choices }) => {
        const first = choices[0];
        if (!first) throw new Error('empty choices');
        return Promise.resolve(first.value);
      },
      confirm: () => Promise.resolve(confirmDefault),
    };
  }

  it('skips scaffolding and prints a placeholder when the template directory does not exist', async () => {
    const driver = quietDriver();
    const scaffoldCalls: Array<{ templateDir: string }> = [];

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm' },
      {
        driver,
        gatherOptions: { interactive: true },
        templatesDir: join(tempRoot, 'templates-empty'),
        targetDirOverride: join(tempRoot, 'out'),
        scaffoldRunner: (templateDir, targetDir) => {
          scaffoldCalls.push({ templateDir });
          return Promise.resolve({ filesWritten: 0, targetDir } satisfies ScaffoldResult);
        },
      },
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('not yet bundled');
    expect(scaffoldCalls).toHaveLength(0);
  });

  it('invokes scaffoldRunner with the resolved template + target dirs when the template exists', async () => {
    // Build a fake templates directory with a `web` subdirectory.
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');

    const calls: Array<{
      templateDir: string;
      targetDir: string;
      resolved: ResolvedInputs;
    }> = [];

    const targetDir = join(tempRoot, 'my-app');

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm' },
      {
        driver: quietDriver(),
        gatherOptions: { interactive: true },
        templatesDir,
        targetDirOverride: targetDir,
        scaffoldRunner: (templateDir, target, resolved) => {
          calls.push({ templateDir, targetDir: target, resolved });
          return Promise.resolve({ filesWritten: 1, targetDir: target });
        },
        gitRunner: noopGitRunner,
        installDeps: false,
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.templateDir).toBe(join(templatesDir, 'web'));
    expect(calls[0]?.targetDir).toBe(targetDir);
    expect(calls[0]?.resolved.template).toBe('web');
    expect(calls[0]?.resolved.pm).toBe('pnpm');

    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    // The format string and its args are captured separately by the spy, so
    // we look for the format-string fragment plus the value separately.
    expect(output).toContain('scaffolded');
    expect(output).toContain('files into');
    expect(output).toContain(targetDir);
  });

  it('layers the _queue bundle on the template by default, and skips it with addQueue: false', async () => {
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');
    await mkdir(join(templatesDir, '_queue'), { recursive: true });
    await writeFile(join(templatesDir, '_queue', 'CONTEXT.md'), '# {{projectName}}', 'utf8');

    const run = async (addQueue: boolean | undefined) => {
      const targetDir = join(tempRoot, `app-${String(addQueue)}`);
      const calls: string[] = [];
      await runCli(
        'my-app',
        { template: 'web', pm: 'npm' },
        {
          driver: quietDriver(),
          gatherOptions: { interactive: true },
          templatesDir,
          targetDirOverride: targetDir,
          scaffoldRunner: async (templateDir, target) => {
            calls.push(templateDir);
            await mkdir(target, { recursive: true });
            return { filesWritten: 1, targetDir: target };
          },
          installDeps: false,
          gitRunner: noopGitRunner,
          ...(addQueue === undefined ? {} : { addQueue }),
        },
      );
      return calls;
    };

    const byDefault = await run(undefined);
    expect(byDefault).toEqual([join(templatesDir, 'web'), join(templatesDir, '_queue')]);

    const without = await run(false);
    expect(without).toEqual([join(templatesDir, 'web')]);
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('skipping the agent queue');
  });

  it('runs the install runner exactly once when installDeps is true (default)', async () => {
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');
    const targetDir = join(tempRoot, 'my-app');

    const installCalls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    const installRunner: ProcessRunner = {
      run(command, args, options) {
        installCalls.push({ command, args, cwd: options.cwd });
        return Promise.resolve();
      },
    };

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm' },
      {
        driver: quietDriver(),
        gatherOptions: { interactive: true },
        templatesDir,
        targetDirOverride: targetDir,
        // The fake scaffoldRunner mirrors the real scaffoldProject by
        // creating the targetDir, so the install step's existence check
        // passes.
        scaffoldRunner: async (_templateDir, target) => {
          await mkdir(target, { recursive: true });
          return { filesWritten: 1, targetDir: target };
        },
        installRunner,
        gitRunner: noopGitRunner,
        // installDeps defaults to true; left implicit on purpose.
      },
    );

    // Install once, then the project's own `format` script (Prettier is
    // installed by then), so the tree is clean for this project name.
    expect(installCalls.map((c) => [c.command, ...c.args])).toEqual([
      ['pnpm', 'install'],
      ['pnpm', 'run', 'format'],
    ]);
    expect(installCalls[0]?.cwd).toBe(targetDir);
    expect(installCalls[1]?.cwd).toBe(targetDir);

    // Success-path banner should include the "next steps" message.
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('Success!');
    expect(output).toContain('pnpm run dev');
    expect(output).toContain('cd ');
  });

  it('skips the install runner when installDeps is false', async () => {
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');
    const targetDir = join(tempRoot, 'my-app');

    const installCalls: Array<{ command: string }> = [];
    const installRunner: ProcessRunner = {
      run(command) {
        installCalls.push({ command });
        return Promise.resolve();
      },
    };

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm' },
      {
        driver: quietDriver(),
        gatherOptions: { interactive: true },
        templatesDir,
        targetDirOverride: targetDir,
        scaffoldRunner: (_templateDir, target) =>
          Promise.resolve({ filesWritten: 1, targetDir: target }),
        installRunner,
        gitRunner: noopGitRunner,
        installDeps: false,
      },
    );

    expect(installCalls).toHaveLength(0);
  });

  it('exits with code 1 when the install runner rejects with InstallFailedError', async () => {
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');
    const targetDir = join(tempRoot, 'my-app');

    const installRunner: ProcessRunner = {
      run() {
        return Promise.reject(new InstallFailedError('boom'));
      },
    };

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? 0}`);
    }) as never);

    try {
      await expect(
        runCli(
          'my-app',
          { template: 'web', pm: 'pnpm' },
          {
            driver: quietDriver(),
            gatherOptions: { interactive: true },
            templatesDir,
            targetDirOverride: targetDir,
            scaffoldRunner: async (_templateDir, target) => {
              await mkdir(target, { recursive: true });
              return { filesWritten: 1, targetDir: target };
            },
            installRunner,
            gitRunner: noopGitRunner,
            installDeps: true,
          },
        ),
      ).rejects.toThrow('process.exit:1');
      expect(errSpy).toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('invokes the git runner with init + add + commit after a successful scaffold', async () => {
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');
    const targetDir = join(tempRoot, 'my-app');

    const gitCalls: Array<{ args: ReadonlyArray<string>; cwd: string }> = [];
    const gitRunner: GitRunner = (args, options) => {
      gitCalls.push({ args, cwd: options.cwd });
      return Promise.resolve();
    };

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm' },
      {
        driver: quietDriver(),
        gatherOptions: { interactive: true },
        templatesDir,
        targetDirOverride: targetDir,
        scaffoldRunner: async (_templateDir, target) => {
          await mkdir(target, { recursive: true });
          return { filesWritten: 1, targetDir: target };
        },
        installRunner: { run: () => Promise.resolve() },
        gitRunner,
        installDeps: true,
      },
    );

    expect(gitCalls.map((c) => c.args[0])).toEqual(['init', 'add', 'commit']);
    for (const call of gitCalls) expect(call.cwd).toBe(targetDir);
  });

  it('skips git init when initGit is false', async () => {
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');
    const targetDir = join(tempRoot, 'my-app');

    const gitCalls: Array<{ args: ReadonlyArray<string> }> = [];
    const gitRunner: GitRunner = (args) => {
      gitCalls.push({ args });
      return Promise.resolve();
    };

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm' },
      {
        driver: quietDriver(),
        gatherOptions: { interactive: true },
        templatesDir,
        targetDirOverride: targetDir,
        scaffoldRunner: (_templateDir, target) =>
          Promise.resolve({ filesWritten: 1, targetDir: target }),
        installRunner: { run: () => Promise.resolve() },
        gitRunner,
        installDeps: false,
        initGit: false,
      },
    );

    expect(gitCalls).toHaveLength(0);
  });

  it('swallows git failures and warns instead of aborting the scaffold', async () => {
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'placeholder.txt'), 'hi', 'utf8');
    const targetDir = join(tempRoot, 'my-app');

    const gitRunner: GitRunner = () => Promise.reject(new Error('git missing'));

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm' },
      {
        driver: quietDriver(),
        gatherOptions: { interactive: true },
        templatesDir,
        targetDirOverride: targetDir,
        scaffoldRunner: async (_templateDir, target) => {
          await mkdir(target, { recursive: true });
          return { filesWritten: 1, targetDir: target };
        },
        installRunner: { run: () => Promise.resolve() },
        gitRunner,
        installDeps: true,
      },
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toMatch(/git init skipped/);
    // Success banner should still print.
    expect(output).toContain('Success!');
  });

  it('dry-run does not create the target directory or invoke install/git runners', async () => {
    // Build a template fixture with one real file so the default scaffold
    // runner has something to walk; the dry-run path must not write it.
    const templatesDir = join(tempRoot, 'templates');
    await mkdir(join(templatesDir, 'web'), { recursive: true });
    await writeFile(join(templatesDir, 'web', 'file.txt'), 'hi', 'utf8');
    const targetDir = join(tempRoot, 'dry-run-target');

    const installCalls: Array<{ command: string }> = [];
    const gitCalls: Array<{ args: ReadonlyArray<string> }> = [];

    await runCli(
      'my-app',
      { template: 'web', pm: 'pnpm', dryRun: true },
      {
        driver: quietDriver(),
        gatherOptions: { interactive: true },
        templatesDir,
        targetDirOverride: targetDir,
        installRunner: {
          run(command) {
            installCalls.push({ command });
            return Promise.resolve();
          },
        },
        gitRunner: (args) => {
          gitCalls.push({ args });
          return Promise.resolve();
        },
      },
    );

    expect(installCalls).toHaveLength(0);
    expect(gitCalls).toHaveLength(0);
    // Target directory must not have been created on disk.
    expect(existsSync(targetDir)).toBe(false);

    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toMatch(/Would scaffold/);
    expect(output).toContain('dry-run complete');
  });
});
