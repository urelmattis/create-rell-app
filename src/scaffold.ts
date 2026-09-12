// Scaffold engine for create-rell-app.
//
// Story 1.3: walk a template directory, substitute `{{projectName}}` and
// `{{projectNameKebab}}` tokens in file contents, file names, and directory
// names, then write the result to a target directory. Binary files are
// copied byte-for-byte.
//
// Design notes:
//   - Determinism: directory entries are sorted by name before recursion so
//     two scaffolds of the same template produce identical output (FR49).
//   - Binary detection is by extension whitelist — content sniffing is slow
//     and unnecessary for our known template asset types.
//   - The walk is hand-rolled rather than using `fs-extra.copy({ filter })`
//     so we control substitution timing precisely (path segments are
//     transformed before the destination path is computed).
//   - Symlinks are not followed; they fail loudly if encountered to surface
//     accidental traversal in template directories.
//   - We do NOT delete or refuse a pre-existing target directory — Story 1.5
//     owns that policy. Callers are expected to have ensured the target is
//     empty/non-existent.

import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { posix as posixPath, resolve as platformResolve, sep as platformSep } from 'node:path';

import { getPackageManagerCommands } from './install.ts';
import type { ResolvedInputs } from './prompts.ts';

/**
 * Thrown when a substituted path segment would escape the target directory
 * (e.g. via `..` segments or path separators in user input).
 */
export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafePathError';
  }
}

/**
 * File extensions treated as binary. Files with these extensions are copied
 * byte-for-byte; substitution is skipped to avoid corrupting them.
 */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.mp3',
  '.mp4',
  '.wav',
]);

/**
 * Special template filenames (and directory names) that get renamed at
 * scaffold time. Used to smuggle dotfile-style entries past npm's tarball
 * publishing rules — npm strips real `.gitignore` and `.npmrc` files when
 * including a package, so templates ship them under placeholder names and
 * we restore the leading dot here.
 *
 * This rename is applied to BOTH file and directory segments in
 * `walkAndCopy`, which is why `_husky` → `.husky` works — the whole
 * directory (and everything beneath it) ends up under a dot-prefixed path
 * in the scaffold output.
 *
 * Extend this table when more files or directories need the same treatment.
 */
const SPECIAL_FILENAME_RENAMES: ReadonlyMap<string, string> = new Map([
  ['_gitignore', '.gitignore'],
  ['_gitattributes', '.gitattributes'],
  ['_npmrc', '.npmrc'],
  ['_env.example', '.env.example'],
  ['_env.local', '.env.local'],
  ['_husky', '.husky'],
  // `tsconfig.json` files in templates are shipped under `_tsconfig.json`
  // so the IDE's TypeScript server doesn't auto-discover them as standalone
  // projects when a contributor opens a template file. Template node_modules
  // are never installed, so a discovered project would produce spurious
  // "cannot find module '@clerk/nextjs/server'" errors for every import.
  // The scaffold engine renames them back to `tsconfig.json` on write.
  ['_tsconfig.json', 'tsconfig.json'],
  // `eslint.config.mjs` files in templates are shipped under
  // `_eslint.config.mjs` for the same reason: when a contributor opens a
  // template file, the IDE's eslint LSP walks up looking for the nearest
  // `eslint.config.*` and runs the template's typescript-eslint parser
  // against the file. That parser auto-discovers tsconfig candidates and
  // bails with "multiple candidate TSConfigRootDirs" because the repo has
  // several `tsconfig.json`-containing trees (root + templates). The
  // scaffold engine renames it back to `eslint.config.mjs` on write.
  ['_eslint.config.mjs', 'eslint.config.mjs'],
  // The AFK queue bundle (templates/_queue) ships its dot-directories under
  // placeholder names for the same npm-tarball reason as `_gitignore`.
  ['_github', '.github'],
  ['_claude', '.claude'],
  ['_sandcastle', '.sandcastle'],
  ['_prettierignore', '.prettierignore'],
]);

export interface ScaffoldOptions {
  /** Absolute path to the template directory to copy from. */
  templateDir: string;
  /** Absolute path to the destination directory. Created if missing. */
  targetDir: string;
  /** Resolved inputs from gatherInputs() — provides projectName for tokens. */
  resolvedInputs: ResolvedInputs;
  /**
   * When `true`, the scaffold walks the template and collects the list of
   * files that would be written but does NOT create directories or write
   * any files. Used by the CLI `--dry-run` flag.
   */
  dryRun?: boolean;
}

export interface ScaffoldResult {
  filesWritten: number;
  targetDir: string;
  /**
   * Paths (relative to targetDir, POSIX-style) of files that were written
   * — or would have been written in dry-run mode. Present only when the
   * caller opted into collecting them; otherwise omitted to keep the
   * common success path allocation-free.
   */
  plannedFiles?: ReadonlyArray<string>;
}

/**
 * Convert an arbitrary string to kebab-case. Lowercases, replaces non-
 * alphanumeric runs with `-`, and trims leading/trailing dashes. Used to
 * derive `{{projectNameKebab}}` from the user-supplied project name.
 *
 * Examples:
 *   "My App"          → "my-app"
 *   "MySaaS_v2"       → "mysaas-v2"
 *   "  hello world  " → "hello-world"
 */
export function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Detect and strip the leading `// @ts-nocheck ...` marker line used by
 * every template TS file. Template files ship with this marker at the top
 * so that contributors opening them in an IDE don't see phantom module-
 * resolution errors — template node_modules are never installed, so every
 * import would otherwise fail at the IDE level. The marker MUST be removed
 * when copying into a real scaffolded project so the user's TypeScript
 * checker runs normally against their own installed dependencies.
 *
 * The pattern deliberately matches only the very first line and only if it
 * begins with `// @ts-nocheck` — any file that does not start with the
 * marker is returned unchanged. This keeps the transform safe for files
 * that never had the marker in the first place (the two scaffold engine
 * test fixtures do not, for example).
 */
const TS_NOCHECK_LINE_PATTERN = /^\/\/ @ts-nocheck[^\n]*\r?\n/;

export function stripTemplateNoCheck(contents: string): string {
  return contents.replace(TS_NOCHECK_LINE_PATTERN, '');
}

/**
 * Replace every `{{key}}` token in `input` with `vars[key]`. Tokens with
 * unknown keys are left in place — silent passthrough is the safer default
 * for catching templating mistakes during smoke tests.
 */
export function substituteVariables(input: string, vars: Readonly<Record<string, string>>): string {
  return input.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const replacement = vars[key];
    return replacement !== undefined ? replacement : match;
  });
}

/**
 * Substitute variables inside a single path **segment** (filename or
 * directory name). Throws UnsafePathError if the substituted result contains
 * any path separator, `..`, or is empty / `.` — these would let user input
 * escape the target directory.
 *
 * This is the security-critical entry point: it prevents path traversal via
 * crafted project names like `../../etc/passwd`. Every template path segment
 * goes through this function before being joined to the destination.
 */
export function substitutePathSegment(
  segment: string,
  vars: Readonly<Record<string, string>>,
): string {
  const substituted = substituteVariables(segment, vars);

  // Defence in depth: forbid empty/dot/dotdot segments and any separators.
  if (
    substituted === '' ||
    substituted === '.' ||
    substituted === '..' ||
    substituted.includes('/') ||
    substituted.includes('\\') ||
    substituted.includes('\0')
  ) {
    throw new UnsafePathError(
      `Refusing to scaffold path segment that would escape the target directory: ${JSON.stringify(
        substituted,
      )} (from template segment ${JSON.stringify(segment)})`,
    );
  }

  return substituted;
}

/**
 * Get the lowercase extension of a filename, including the leading dot.
 * Returns an empty string if there is no extension. Files like `.gitignore`
 * (where the dot is at index 0) are treated as having no extension and are
 * therefore copied as text — this is the desired behavior.
 */
function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return '';
  return filename.slice(dot).toLowerCase();
}

/**
 * Detect whether the file at `relativePath` should be copied as binary
 * (skip substitution) based on its extension.
 */
export function isBinaryFile(relativePath: string): boolean {
  return BINARY_EXTENSIONS.has(getExtension(relativePath));
}

/**
 * Map a template-side filename to its scaffold-output filename, applying
 * the special-rename table. Inputs not in the table pass through unchanged.
 */
export function renameSpecialFiles(filename: string): string {
  return SPECIAL_FILENAME_RENAMES.get(filename) ?? filename;
}

/**
 * Convert a platform-native path into a POSIX-style relative path. Used to
 * keep substitution and reporting consistent across operating systems.
 */
function toPosix(pathStr: string): string {
  return platformSep === '/' ? pathStr : pathStr.split(platformSep).join('/');
}

/**
 * Convert a POSIX path back to platform-native form for filesystem writes.
 */
function toPlatform(posixStr: string): string {
  return platformSep === '/' ? posixStr : posixStr.split('/').join(platformSep);
}

/**
 * Recursively walk `templateDir` in sorted order so the output is
 * deterministic. The source path (relative to templateDir) is tracked
 * separately from the destination path (relative to targetDir) so that
 * variable substitution applied to a parent directory name does not break
 * lookups for children — the source path stays untouched, only the
 * destination path is rewritten.
 *
 * Returns the running file count.
 */
async function walkAndCopy(
  templateDir: string,
  targetDir: string,
  sourceRelativeDir: string,
  destRelativeDir: string,
  vars: Readonly<Record<string, string>>,
  filesWritten: number,
  dryRun: boolean,
  plannedFiles: string[],
): Promise<number> {
  const absSourceDir =
    sourceRelativeDir === '' ? templateDir : posixPath.join(templateDir, sourceRelativeDir);
  const entries = await readdir(absSourceDir, { withFileTypes: true });

  // Sort by name for deterministic order. Sorting by codepoint is sufficient
  // because filenames are not locale-sensitive in this codebase.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  let count = filesWritten;

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Symlinks are not supported in template directories: ${posixPath.join(sourceRelativeDir, entry.name)}`,
      );
    }

    // Substitute variables in the segment, then apply special-name rename.
    // Order matters: substitution first because the rename table doesn't
    // contain {{tokens}}. substitutePathSegment also enforces that the
    // substituted name does not contain path separators or `..` parts.
    const transformedName = renameSpecialFiles(substitutePathSegment(entry.name, vars));
    const childSourceRelative =
      sourceRelativeDir === '' ? entry.name : posixPath.join(sourceRelativeDir, entry.name);
    const childDestRelative =
      destRelativeDir === '' ? transformedName : posixPath.join(destRelativeDir, transformedName);
    const destPath = posixPath.join(targetDir, childDestRelative);

    // Defence-in-depth containment check: even with sanitized segments,
    // verify the resolved absolute path stays inside the target directory.
    assertContained(destPath, targetDir);

    if (entry.isDirectory()) {
      if (!dryRun) {
        await mkdir(toPlatform(destPath), { recursive: true });
      }
      count = await walkAndCopy(
        templateDir,
        targetDir,
        childSourceRelative,
        childDestRelative,
        vars,
        count,
        dryRun,
        plannedFiles,
      );
    } else if (entry.isFile()) {
      const sourceAbs = toPlatform(posixPath.join(templateDir, childSourceRelative));
      const destAbs = toPlatform(destPath);

      if (dryRun) {
        // Just record the destination; skip any filesystem mutation.
        plannedFiles.push(childDestRelative);
      } else {
        await mkdir(toPlatform(posixPath.dirname(destPath)), { recursive: true });

        if (isBinaryFile(entry.name)) {
          await copyFile(sourceAbs, destAbs);
        } else {
          const contents = await readFile(sourceAbs, 'utf8');
          // Strip the leading `// @ts-nocheck` marker before variable
          // substitution so user projects receive normally-checked
          // TypeScript. See `stripTemplateNoCheck` for the rationale.
          const stripped = stripTemplateNoCheck(contents);
          const substituted = substituteVariables(stripped, vars);
          await writeFile(destAbs, substituted, 'utf8');
        }
        plannedFiles.push(childDestRelative);
      }
      count += 1;
    }
    // Other dirent types (block/char devices, fifos, sockets) are silently
    // skipped — they should never appear in a template directory anyway.
  }

  return count;
}

/**
 * Verify that `childPosixPath` resolves to a location inside `targetPosixPath`.
 * Throws `UnsafePathError` otherwise. Defence in depth alongside the
 * `substitutePathSegment` checks — catches any path that slips through via
 * symlinks, normalization quirks, or future template tokens.
 */
function assertContained(childPosixPath: string, targetPosixPath: string): void {
  // Normalize using the platform-native resolver so we catch e.g. Windows
  // case-insensitivity or drive letter mismatches at runtime.
  const childAbs = platformResolve(toPlatform(childPosixPath));
  const targetAbs = platformResolve(toPlatform(targetPosixPath));
  const targetWithSep = targetAbs.endsWith(platformSep) ? targetAbs : targetAbs + platformSep;
  if (childAbs !== targetAbs && !childAbs.startsWith(targetWithSep)) {
    throw new UnsafePathError(
      `Refusing to write outside the target directory: ${childAbs} (target: ${targetAbs})`,
    );
  }
}

/**
 * Build the substitution variable map from the resolved inputs. Exported so
 * tests can verify the kebab transform without invoking the full scaffold.
 *
 * Variables produced:
 *   - `projectName`         — exact user input, used in file contents
 *   - `projectNameKebab`    — kebab-cased project name
 *   - `pmInstallCmd`        — e.g. `pnpm install`
 *   - `pmRunCmd`            — e.g. `pnpm run`
 *   - `pmExecCmd`           — e.g. `pnpm dlx`
 *
 * Note: `projectName` here is the **content** value used for in-file
 * substitutions and is allowed to contain spaces / punctuation. Path-segment
 * substitutions go through `substitutePathSegment` which rejects separators.
 */
export function buildSubstitutionVars(resolvedInputs: ResolvedInputs): Record<string, string> {
  const pmCommands = getPackageManagerCommands(resolvedInputs.pm);
  return {
    projectName: resolvedInputs.projectName,
    projectNameKebab: toKebabCase(resolvedInputs.projectName),
    pmInstallCmd: pmCommands.install,
    pmRunCmd: pmCommands.run,
    pmExecCmd: pmCommands.exec,
    // Used by the AFK queue bundle (templates/_queue): the workflows and the
    // agent prompts name the exact commands the sessions may run.
    pmCiInstallCmd: pmCommands.ci,
    pmLockfileOnlyCmd: pmCommands.lockfileOnly,
    pmLockfile: pmCommands.lockFile,
    pmNodeCache: pmCommands.nodeCache,
    pmSetupSteps: buildToolchainSteps(resolvedInputs.pm),
    pmAuditCmd: pmCommands.audit,
    pmWhyCmd: pmCommands.why,
    pmAddDevCmd: pmCommands.addDev,
    pmExecLocalCmd: pmCommands.execLocal,
  };
}

/**
 * The GitHub Actions steps that put the chosen package manager and Node on
 * the runner, rendered as complete YAML list items at the indentation the
 * queue workflows use for their `steps:`. Always non-empty, so a template
 * can surround the token with blank lines without producing a double blank
 * line for one package manager and not another.
 */
export function buildToolchainSteps(pm: ResolvedInputs['pm']): string {
  const cache = getPackageManagerCommands(pm).nodeCache;
  const setupNode = [
    '      - uses: actions/setup-node@v6',
    '        with:',
    '          node-version: 22',
    `          cache: ${cache}`,
  ].join('\n');
  if (pm === 'pnpm') {
    return [
      '      - uses: pnpm/action-setup@v6',
      '        with:',
      '          version: 10',
      '',
      setupNode,
    ].join('\n');
  }
  if (pm === 'yarn') {
    // The runner's preinstalled yarn is 1.x; the templates use Yarn 4 (`yarn dlx`,
    // `--immutable`). Enable the corepack shim and install Yarn 4 as its global
    // default before setup-node resolves the cache folder through it.
    return ['      - run: corepack enable yarn && corepack install -g yarn@4', '', setupNode].join(
      '\n',
    );
  }
  return setupNode;
}

/**
 * After the template walk, ensure every `.env.example` has a sibling
 * `.env.local` the framework will actually load. Content is copied verbatim
 * from the example (single source of truth) so there is no second template
 * file to keep in sync. Never overwrites an existing `.env.local` (a template
 * may ship its own via `_env.local`). Dry-run records the path without writing.
 *
 * Returns the number of `.env.local` files created (or planned in dry-run).
 */
async function materializeEnvLocal(
  targetDir: string,
  plannedFiles: string[],
  dryRun: boolean,
): Promise<number> {
  const examples = plannedFiles.filter((p) => p === '.env.example' || p.endsWith('/.env.example'));
  let created = 0;
  for (const example of examples) {
    const local = example.replace(/\.env\.example$/, '.env.local');
    if (plannedFiles.includes(local)) continue; // template already shipped one
    if (dryRun) {
      plannedFiles.push(local);
      created += 1;
      continue;
    }
    const localAbs = platformResolve(targetDir, toPlatform(local));
    try {
      await stat(localAbs);
      continue; // already exists on disk — do not overwrite
    } catch {
      /* does not exist — create it */
    }
    const exampleAbs = platformResolve(targetDir, toPlatform(example));
    const content = await readFile(exampleAbs, 'utf8');
    await writeFile(localAbs, content, 'utf8');
    plannedFiles.push(local);
    created += 1;
  }
  return created;
}

/**
 * Copy `templateDir` to `targetDir`, substituting `{{projectName}}` and
 * `{{projectNameKebab}}` tokens in file contents, file names, and directory
 * names. Binary files are copied byte-for-byte. Returns the number of files
 * written and the (absolute) target directory.
 *
 * The caller is responsible for:
 *   - ensuring `templateDir` exists and is a directory
 *   - validating `targetDir` (Story 1.5 owns "already exists" handling)
 *   - installing dependencies (Story 1.4)
 */
export async function scaffoldProject(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { templateDir, targetDir, resolvedInputs, dryRun = false } = options;

  const templateStat = await stat(templateDir);
  if (!templateStat.isDirectory()) {
    throw new Error(`Template path is not a directory: ${templateDir}`);
  }

  if (!dryRun) {
    await mkdir(targetDir, { recursive: true });
  }

  const vars = buildSubstitutionVars(resolvedInputs);
  const plannedFiles: string[] = [];
  const filesWritten = await walkAndCopy(
    toPosix(templateDir),
    toPosix(targetDir),
    '',
    '',
    vars,
    0,
    dryRun,
    plannedFiles,
  );

  const envLocalCount = await materializeEnvLocal(targetDir, plannedFiles, dryRun);
  return { filesWritten: filesWritten + envLocalCount, targetDir, plannedFiles };
}
