// Input validation and target-dir safety for create-rell-app.
//
// Story 1.5: hardens the CLI against bad input. Where Story 1.2 was lenient
// (drop unknown flag values, re-prompt), this module is strict — anything
// that survives prompts must pass these checks before scaffolding starts.
//
// Design notes:
//   - Validation is split into pure functions (`validateX`) returning a
//     discriminated union, and assertion wrappers (`assertX`) that throw
//     `ValidationError`. Tests use the pure functions; runCli uses the
//     assertions.
//   - Target directory safety lives here too — it's the same kind of check
//     (refuse to proceed unless the input is safe), and keeping it together
//     keeps `runCli` short.

import { readdir, stat } from 'node:fs/promises';

import type { PackageManagerName, TemplateName } from './index.ts';
import type { PromptDriver } from './prompts.ts';
import { PACKAGE_MANAGER_CHOICES, TEMPLATE_CHOICES } from './prompts.ts';

/**
 * Discriminated-union result for validation functions. Tests pattern-match
 * on `ok` to inspect the failure reason.
 */
export type ValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Thrown by `assertX` helpers and by `runCli` when input is invalid. Caught
 * at the CLI top level and converted into a non-zero exit + friendly error.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const PROJECT_NAME_MAX_LENGTH = 214; // npm package name limit
const PROJECT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/**
 * Validate a project name. Rules:
 *   - Non-empty after trimming.
 *   - No path separators or NUL bytes.
 *   - Doesn't start with `.` or `_` (npm rejects these).
 *   - Length ≤ 214 characters.
 *   - Matches the lower-case kebab/dot/underscore pattern (npm-compatible).
 *
 * The rules are intentionally restrictive — they cover both filesystem
 * safety (no separators, no NUL) and npm package-name compatibility, since
 * the project name will appear in the generated `package.json`.
 */
export function validateProjectName(name: string): ValidationResult {
  if (typeof name !== 'string' || name === '') {
    return { ok: false, reason: 'Project name is required.' };
  }
  if (name.trim() !== name) {
    return { ok: false, reason: 'Project name cannot have leading or trailing whitespace.' };
  }
  if (name.includes('/') || name.includes('\\')) {
    return { ok: false, reason: 'Project name cannot contain path separators.' };
  }
  if (name.includes('\0')) {
    return { ok: false, reason: 'Project name cannot contain a NUL byte.' };
  }
  if (name.startsWith('.') || name.startsWith('_')) {
    return { ok: false, reason: 'Project name cannot start with a dot or underscore.' };
  }
  if (name.length > PROJECT_NAME_MAX_LENGTH) {
    return {
      ok: false,
      reason: `Project name cannot exceed ${PROJECT_NAME_MAX_LENGTH} characters.`,
    };
  }
  if (!PROJECT_NAME_PATTERN.test(name)) {
    return {
      ok: false,
      reason:
        'Project name must be lowercase and may contain letters, digits, dots, underscores, and dashes.',
    };
  }
  return { ok: true };
}

/**
 * Throw `ValidationError` if the project name is invalid; otherwise no-op.
 */
export function assertValidProjectName(name: string): void {
  const result = validateProjectName(name);
  if (!result.ok) {
    throw new ValidationError(`Invalid project name "${name}": ${result.reason}`);
  }
}

const TEMPLATE_VALUES: ReadonlyArray<TemplateName> = TEMPLATE_CHOICES.map((c) => c.value);
const PACKAGE_MANAGER_VALUES: ReadonlyArray<PackageManagerName> = PACKAGE_MANAGER_CHOICES.map(
  (c) => c.value,
);

/**
 * Validate a `--template` flag value against the canonical list.
 */
export function validateTemplate(value: string): ValidationResult {
  if (TEMPLATE_VALUES.includes(value as TemplateName)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Unknown template "${value}". Valid templates: ${TEMPLATE_VALUES.join(', ')}.`,
  };
}

/**
 * Throw `ValidationError` if the template value is invalid; otherwise no-op.
 */
export function assertValidTemplate(value: string): void {
  const result = validateTemplate(value);
  if (!result.ok) throw new ValidationError(result.reason);
}

/**
 * Validate a `--pm` flag value against the canonical list.
 */
export function validatePackageManager(value: string): ValidationResult {
  if (PACKAGE_MANAGER_VALUES.includes(value as PackageManagerName)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Unknown package manager "${value}". Valid managers: ${PACKAGE_MANAGER_VALUES.join(', ')}.`,
  };
}

/**
 * Throw `ValidationError` if the package manager value is invalid; otherwise no-op.
 */
export function assertValidPackageManager(value: string): void {
  const result = validatePackageManager(value);
  if (!result.ok) throw new ValidationError(result.reason);
}

export interface AssertTargetDirSafeOptions {
  interactive: boolean;
  driver: PromptDriver;
}

/**
 * Refuse to scaffold over an existing non-empty directory unless the user
 * explicitly confirms (interactive mode only). Empty directories and
 * non-existent paths are always allowed.
 *
 * Throws `ValidationError` on user decline or non-interactive non-empty.
 */
export async function assertTargetDirSafe(
  targetDir: string,
  options: AssertTargetDirSafeOptions,
): Promise<void> {
  let targetStat;
  try {
    targetStat = await stat(targetDir);
  } catch {
    // Path does not exist — safe to scaffold into.
    return;
  }

  if (!targetStat.isDirectory()) {
    throw new ValidationError(`Target path already exists and is not a directory: ${targetDir}`);
  }

  const entries = await readdir(targetDir);
  if (entries.length === 0) {
    // Empty directory — safe to scaffold into.
    return;
  }

  if (!options.interactive) {
    throw new ValidationError(
      `Target directory ${targetDir} already exists and is not empty. ` +
        `Pick a different project name or remove the directory first.`,
    );
  }

  const confirmed = await options.driver.confirm({
    message: `Target directory ${targetDir} already exists and is not empty. Continue and overwrite files?`,
    default: false,
  });

  if (!confirmed) {
    throw new ValidationError('Aborted by user — target directory was not empty.');
  }
}
