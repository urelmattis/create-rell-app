import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import {
  BINARY_EXTENSIONS,
  buildSubstitutionVars,
  isBinaryFile,
  renameSpecialFiles,
  scaffoldProject,
  stripTemplateNoCheck,
  substitutePathSegment,
  substituteVariables,
  toKebabCase,
  UnsafePathError,
} from '../../src/scaffold.ts';

/**
 * A few specific bytes that include 0x00 and high-bit values so we can
 * detect any utf-8 round-tripping that would corrupt them.
 */
const BINARY_PAYLOAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

interface TempDirs {
  templateDir: string;
  targetDir: string;
}

let dirs: TempDirs;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'crapp-scaffold-'));
  dirs = {
    templateDir: join(root, 'template'),
    targetDir: join(root, 'target'),
  };
});

afterEach(() => {
  if (dirs.templateDir) rmSync(join(dirs.templateDir, '..'), { recursive: true, force: true });
});

async function makeTemplateFixture(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'nested', '{{projectNameKebab}}'), { recursive: true });
  await mkdir(join(root, 'assets'), { recursive: true });

  await writeFile(
    join(root, 'package.json'),
    '{\n  "name": "{{projectName}}",\n  "version": "0.1.0"\n}\n',
    'utf8',
  );
  await writeFile(
    join(root, 'README.md'),
    '# {{projectName}}\n\nKebab: {{projectNameKebab}}\n',
    'utf8',
  );
  await writeFile(join(root, '_gitignore'), 'node_modules\ndist\n', 'utf8');
  await writeFile(
    join(root, 'src', '{{projectName}}.config.ts'),
    "export const name = '{{projectName}}';\n",
    'utf8',
  );
  await writeFile(
    join(root, 'nested', '{{projectNameKebab}}', 'index.ts'),
    "export default '{{projectNameKebab}}';\n",
    'utf8',
  );
  await writeFile(join(root, 'assets', 'logo.png'), BINARY_PAYLOAD);
  await writeFile(join(root, 'unknown-token.txt'), '{{notReplaced}} stays\n', 'utf8');
}

describe('toKebabCase', () => {
  it('lowercases and replaces non-alphanumerics with dashes', () => {
    expect(toKebabCase('My App')).toBe('my-app');
  });

  it('collapses runs of separators', () => {
    expect(toKebabCase('foo___bar  baz')).toBe('foo-bar-baz');
  });

  it('trims leading and trailing separators', () => {
    expect(toKebabCase('  hello world  ')).toBe('hello-world');
  });

  it('preserves digits', () => {
    expect(toKebabCase('App2')).toBe('app2');
  });
});

describe('stripTemplateNoCheck', () => {
  it('strips a leading `// @ts-nocheck` marker line', () => {
    const input = '// @ts-nocheck -- template-only\nexport const x = 1;\n';
    expect(stripTemplateNoCheck(input)).toBe('export const x = 1;\n');
  });

  it('strips with CRLF line endings', () => {
    const input = '// @ts-nocheck -- template-only\r\nexport const x = 1;\r\n';
    expect(stripTemplateNoCheck(input)).toBe('export const x = 1;\r\n');
  });

  it('strips a bare `// @ts-nocheck` line with no trailing comment', () => {
    const input = '// @ts-nocheck\nexport const x = 1;\n';
    expect(stripTemplateNoCheck(input)).toBe('export const x = 1;\n');
  });

  it('leaves files without the marker unchanged', () => {
    const input = "import 'server-only';\nexport const x = 1;\n";
    expect(stripTemplateNoCheck(input)).toBe(input);
  });

  it('only strips the FIRST line — does not remove @ts-nocheck later in the file', () => {
    const input = '// header\n// @ts-nocheck -- still in comment block\nexport const x = 1;\n';
    expect(stripTemplateNoCheck(input)).toBe(input);
  });

  it('leaves empty files unchanged', () => {
    expect(stripTemplateNoCheck('')).toBe('');
  });
});

describe('substituteVariables', () => {
  it('replaces known tokens', () => {
    expect(substituteVariables('Hello {{name}}!', { name: 'world' })).toBe('Hello world!');
  });

  it('leaves unknown tokens in place', () => {
    expect(substituteVariables('{{unknown}} and {{name}}', { name: 'x' })).toBe(
      '{{unknown}} and x',
    );
  });

  it('handles multiple occurrences of the same token', () => {
    expect(substituteVariables('{{x}} {{x}}', { x: 'y' })).toBe('y y');
  });
});

describe('isBinaryFile', () => {
  it('detects PNGs', () => {
    expect(isBinaryFile('logo.png')).toBe(true);
  });

  it('detects woff fonts', () => {
    expect(isBinaryFile('font.woff2')).toBe(true);
  });

  it('treats .ts as text', () => {
    expect(isBinaryFile('index.ts')).toBe(false);
  });

  it('treats files with no extension as text', () => {
    expect(isBinaryFile('Dockerfile')).toBe(false);
  });

  it('is case-insensitive on the extension', () => {
    expect(isBinaryFile('LOGO.PNG')).toBe(true);
  });

  it('exposes a populated extension set', () => {
    expect(BINARY_EXTENSIONS.size).toBeGreaterThan(0);
  });
});

describe('renameSpecialFiles', () => {
  it('renames _gitignore to .gitignore', () => {
    expect(renameSpecialFiles('_gitignore')).toBe('.gitignore');
  });

  it('renames _gitattributes to .gitattributes', () => {
    expect(renameSpecialFiles('_gitattributes')).toBe('.gitattributes');
  });

  it('renames _npmrc to .npmrc', () => {
    expect(renameSpecialFiles('_npmrc')).toBe('.npmrc');
  });

  it('renames _env.example to .env.example', () => {
    expect(renameSpecialFiles('_env.example')).toBe('.env.example');
  });

  it('renames _husky directory to .husky (Story 4.4)', () => {
    expect(renameSpecialFiles('_husky')).toBe('.husky');
  });

  it('renames _tsconfig.json to tsconfig.json (hides template TS projects from the IDE)', () => {
    expect(renameSpecialFiles('_tsconfig.json')).toBe('tsconfig.json');
  });

  it('renames _eslint.config.mjs to eslint.config.mjs (hides template eslint configs from IDE eslint LSP)', () => {
    expect(renameSpecialFiles('_eslint.config.mjs')).toBe('eslint.config.mjs');
  });

  it('passes regular filenames through unchanged', () => {
    expect(renameSpecialFiles('package.json')).toBe('package.json');
  });
});

describe('buildSubstitutionVars', () => {
  it('produces both projectName and projectNameKebab', () => {
    const vars = buildSubstitutionVars({
      projectName: 'My SaaS App',
      template: 'web',
      pm: 'pnpm',
    });
    expect(vars.projectName).toBe('My SaaS App');
    expect(vars.projectNameKebab).toBe('my-saas-app');
  });
});

describe('scaffoldProject', () => {
  it('writes every fixture file into the target directory', async () => {
    await makeTemplateFixture(dirs.templateDir);

    const result = await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });

    // 7 files in the fixture: package.json, README.md, _gitignore (renamed),
    // src/{{projectName}}.config.ts, nested/{{projectNameKebab}}/index.ts,
    // assets/logo.png, unknown-token.txt.
    expect(result.filesWritten).toBe(7);
    expect(result.targetDir).toBe(dirs.targetDir);
  });

  it('substitutes {{projectName}} and {{projectNameKebab}} in file contents', async () => {
    await makeTemplateFixture(dirs.templateDir);

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });

    const pkg = await readFile(join(dirs.targetDir, 'package.json'), 'utf8');
    expect(pkg).toContain('"name": "my-app"');

    const readme = await readFile(join(dirs.targetDir, 'README.md'), 'utf8');
    expect(readme).toContain('# my-app');
    expect(readme).toContain('Kebab: my-app');
  });

  it('substitutes {{projectName}} in filenames', async () => {
    await makeTemplateFixture(dirs.templateDir);

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });

    const configPath = join(dirs.targetDir, 'src', 'my-app.config.ts');
    const config = await readFile(configPath, 'utf8');
    expect(config).toContain("export const name = 'my-app'");
  });

  it('substitutes {{projectNameKebab}} in directory names and contents', async () => {
    await makeTemplateFixture(dirs.templateDir);

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'My SaaS App', template: 'web', pm: 'pnpm' },
    });

    const nested = await readFile(
      join(dirs.targetDir, 'nested', 'my-saas-app', 'index.ts'),
      'utf8',
    );
    expect(nested).toContain("export default 'my-saas-app'");
  });

  it('renames _gitignore to .gitignore', async () => {
    await makeTemplateFixture(dirs.templateDir);

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });

    const gitignore = await readFile(join(dirs.targetDir, '.gitignore'), 'utf8');
    expect(gitignore).toBe('node_modules\ndist\n');
  });

  it('copies binary files byte-for-byte without corruption', async () => {
    await makeTemplateFixture(dirs.templateDir);

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });

    const copied = await readFile(join(dirs.targetDir, 'assets', 'logo.png'));
    expect(copied.equals(BINARY_PAYLOAD)).toBe(true);
  });

  it('leaves unknown {{tokens}} untouched (silent passthrough)', async () => {
    await makeTemplateFixture(dirs.templateDir);

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });

    const text = await readFile(join(dirs.targetDir, 'unknown-token.txt'), 'utf8');
    expect(text).toBe('{{notReplaced}} stays\n');
  });

  it('produces deterministic output across two runs', async () => {
    await makeTemplateFixture(dirs.templateDir);
    const root = join(dirs.templateDir, '..');

    const targetA = join(root, 'target-a');
    const targetB = join(root, 'target-b');

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: targetA,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });
    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: targetB,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });

    async function listAll(root: string): Promise<Array<{ path: string; bytes: Buffer }>> {
      const out: Array<{ path: string; bytes: Buffer }> = [];
      async function walk(dir: string, rel: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });
        entries.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
        for (const e of entries) {
          const childRel = rel === '' ? e.name : rel + '/' + e.name;
          if (e.isDirectory()) {
            await walk(join(dir, e.name), childRel);
          } else if (e.isFile()) {
            out.push({ path: childRel, bytes: await readFile(join(dir, e.name)) });
          }
        }
      }
      await walk(root, '');
      return out;
    }

    const a = await listAll(targetA);
    const b = await listAll(targetB);

    expect(a.length).toBe(b.length);
    expect(a.map((x) => x.path)).toEqual(b.map((x) => x.path));
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]?.bytes.equals(b[i]?.bytes ?? Buffer.alloc(0))).toBe(true);
    }
  });

  it('throws when the templateDir does not exist', async () => {
    await expect(
      scaffoldProject({
        templateDir: join(dirs.templateDir, 'does-not-exist'),
        targetDir: dirs.targetDir,
        resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
      }),
    ).rejects.toThrow();
  });

  it('throws when templateDir points at a file', async () => {
    await mkdir(dirs.templateDir, { recursive: true });
    await writeFile(join(dirs.templateDir, 'just-a-file.txt'), 'hi', 'utf8');

    await expect(
      scaffoldProject({
        templateDir: join(dirs.templateDir, 'just-a-file.txt'),
        targetDir: dirs.targetDir,
        resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
      }),
    ).rejects.toThrow(/not a directory/);
  });

  it('uses platform-native separators in the result targetDir', async () => {
    await makeTemplateFixture(dirs.templateDir);
    const result = await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
    });
    // Just verify the path is shaped like an absolute platform path; we
    // don't want to hard-code the separator in the assertion.
    expect(result.targetDir).toContain(sep);
  });

  it('does not write any files when dryRun is true', async () => {
    await makeTemplateFixture(dirs.templateDir);

    const result = await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
      dryRun: true,
    });

    // filesWritten counts what would be written, same as the non-dry-run
    // path — it lets the CLI print a reliable number.
    expect(result.filesWritten).toBe(7);
    // But nothing touched the filesystem: the target dir was never created.
    expect(existsSync(dirs.targetDir)).toBe(false);
  });

  it('collects plannedFiles (POSIX relative paths) when dryRun is true', async () => {
    await makeTemplateFixture(dirs.templateDir);

    const result = await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'my-app', template: 'web', pm: 'pnpm' },
      dryRun: true,
    });

    expect(result.plannedFiles).toBeDefined();
    const files = [...(result.plannedFiles ?? [])].sort();
    expect(files).toEqual(
      [
        '.gitignore',
        'README.md',
        'assets/logo.png',
        'nested/my-app/index.ts',
        'package.json',
        'src/my-app.config.ts',
        'unknown-token.txt',
      ].sort(),
    );
  });
});

describe('substitutePathSegment (security)', () => {
  it('passes through normal substitutions', () => {
    expect(substitutePathSegment('{{projectName}}.config.ts', { projectName: 'my-app' })).toBe(
      'my-app.config.ts',
    );
  });

  it('rejects substitutions that introduce a forward slash', () => {
    expect(() =>
      substitutePathSegment('{{projectName}}.txt', { projectName: '../escaped' }),
    ).toThrow(UnsafePathError);
  });

  it('rejects substitutions that introduce a backslash', () => {
    expect(() => substitutePathSegment('{{projectName}}.txt', { projectName: '..\\boom' })).toThrow(
      UnsafePathError,
    );
  });

  it('rejects substitutions that produce `..`', () => {
    expect(() => substitutePathSegment('{{projectName}}', { projectName: '..' })).toThrow(
      UnsafePathError,
    );
  });

  it('rejects substitutions that produce `.`', () => {
    expect(() => substitutePathSegment('{{projectName}}', { projectName: '.' })).toThrow(
      UnsafePathError,
    );
  });

  it('rejects substitutions that produce an empty segment', () => {
    expect(() => substitutePathSegment('{{projectName}}', { projectName: '' })).toThrow(
      UnsafePathError,
    );
  });

  it('rejects substitutions that contain a NUL byte', () => {
    expect(() => substitutePathSegment('{{projectName}}', { projectName: 'evil\0name' })).toThrow(
      UnsafePathError,
    );
  });
});

describe('scaffoldProject (path traversal defence)', () => {
  it('refuses to scaffold when projectName contains path separators', async () => {
    // Build a fixture whose filename uses {{projectName}}.
    await mkdir(dirs.templateDir, { recursive: true });
    await writeFile(
      join(dirs.templateDir, '{{projectName}}.txt'),
      'hello {{projectName}}\n',
      'utf8',
    );

    await expect(
      scaffoldProject({
        templateDir: dirs.templateDir,
        targetDir: dirs.targetDir,
        resolvedInputs: { projectName: '../boom', template: 'web', pm: 'pnpm' },
      }),
    ).rejects.toBeInstanceOf(UnsafePathError);
  });

  it('still substitutes projectName inside file contents (only path segments are restricted)', async () => {
    await mkdir(dirs.templateDir, { recursive: true });
    // Filename does NOT use {{projectName}}, so the path-segment guard does
    // not fire and the in-file substitution still runs with the spaces.
    await writeFile(join(dirs.templateDir, 'package.json'), '"name": "{{projectName}}"', 'utf8');

    await scaffoldProject({
      templateDir: dirs.templateDir,
      targetDir: dirs.targetDir,
      resolvedInputs: { projectName: 'My SaaS App', template: 'web', pm: 'pnpm' },
    });

    const pkg = await readFile(join(dirs.targetDir, 'package.json'), 'utf8');
    expect(pkg).toBe('"name": "My SaaS App"');
  });
});

describe('scaffoldProject .env.local materialization', () => {
  it('creates .env.local alongside each .env.example with identical content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'crapp-envlocal-'));
    const tpl = join(root, 'tpl');
    await mkdir(tpl, { recursive: true });
    await writeFile(join(tpl, '_env.example'), 'FOO=\n# DATABASE_URL=x\n', 'utf8');

    const target = join(root, 'out');
    await scaffoldProject({
      templateDir: tpl,
      targetDir: target,
      resolvedInputs: { projectName: 'p', template: 'web', pm: 'npm' },
    });

    const example = await readFile(join(target, '.env.example'), 'utf8');
    const local = await readFile(join(target, '.env.local'), 'utf8');
    expect(local).toBe(example);
  });

  it('does not overwrite an existing .env.local in the template', async () => {
    const root = await mkdtemp(join(tmpdir(), 'crapp-envlocal2-'));
    const tpl = join(root, 'tpl');
    await mkdir(tpl, { recursive: true });
    await writeFile(join(tpl, '_env.example'), 'FOO=\n', 'utf8');
    await writeFile(join(tpl, '_env.local'), 'FOO=already\n', 'utf8'); // renames to .env.local

    const target = join(root, 'out');
    await scaffoldProject({
      templateDir: tpl,
      targetDir: target,
      resolvedInputs: { projectName: 'p', template: 'web', pm: 'npm' },
    });

    const local = await readFile(join(target, '.env.local'), 'utf8');
    expect(local).toBe('FOO=already\n');
  });

  it('dry-run records .env.local in plannedFiles but writes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'crapp-envlocal3-'));
    const tpl = join(root, 'tpl');
    await mkdir(tpl, { recursive: true });
    await writeFile(join(tpl, '_env.example'), 'FOO=\n', 'utf8');

    const target = join(root, 'out');
    const result = await scaffoldProject({
      templateDir: tpl,
      targetDir: target,
      resolvedInputs: { projectName: 'p', template: 'web', pm: 'npm' },
      dryRun: true,
    });

    expect(result.plannedFiles).toContain('.env.local');
    await expect(stat(join(target, '.env.local'))).rejects.toThrow();
  });
});
