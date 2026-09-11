// Interactive prompt layer for create-rell-app.
//
// Story 1.2: gather missing inputs (project name, template, package manager)
// from the developer when they aren't supplied via CLI flags.
//
// Design notes:
//   - We define a narrow PromptDriver interface so tests can inject a fake
//     driver instead of mocking @inquirer/prompts at the module level.
//     ESM module mocking is brittle; explicit dependency injection is not.
//   - The default driver is a tiny adapter that wraps @inquirer/prompts'
//     `input()` and `select()` exports.
//   - Strict validation of project name + final flag values is intentionally
//     deferred to Story 1.5. Here we only sanitize unknown flag values to
//     `undefined` so the prompt is shown again, which is the friendliest UX
//     for partial/invalid input.

import { confirm, input, select } from '@inquirer/prompts';

import type { PackageManagerName, TemplateName } from './index.ts';

/**
 * Detect a Ctrl+C cancellation thrown by @inquirer/prompts. The error class
 * lives in @inquirer/core (a transitive dep), so we identify it by name to
 * avoid taking on a second direct dependency.
 */
function isInquirerExitError(err: unknown): boolean {
  return err instanceof Error && err.name === 'ExitPromptError';
}

/**
 * Thrown when the developer cancels an interactive prompt (e.g. Ctrl+C).
 * The CLI top-level catches this and exits with a non-zero status without
 * printing a stack trace.
 */
export class PromptCancelledError extends Error {
  constructor() {
    super('Prompt cancelled by user.');
    this.name = 'PromptCancelledError';
  }
}

/**
 * Thrown when interactive prompts are required but stdin is not a TTY
 * (e.g. piped input in CI). Tells the developer to use flags instead.
 */
export class NonInteractiveStdinError extends Error {
  constructor(missing: ReadonlyArray<string>) {
    super(
      `Interactive prompts require a TTY but stdin is not interactive. ` +
        `Pass the missing values via flags: ${missing.join(', ')}.`,
    );
    this.name = 'NonInteractiveStdinError';
  }
}

/**
 * Choices shown in the template selection prompt. Single source of truth for
 * the (label, value) pairs and the set of valid template names.
 */
export const TEMPLATE_CHOICES: ReadonlyArray<{
  readonly name: string;
  readonly value: TemplateName;
  readonly description: string;
}> = [
  {
    name: 'Solo Web App',
    value: 'web',
    description: 'Next.js + Clerk + Supabase + Drizzle (web only)',
  },
  {
    name: 'Solo Mobile App',
    value: 'mobile',
    description: 'Expo + Clerk + Supabase + Drizzle (mobile only)',
  },
  {
    name: 'Full-Stack Monolith',
    value: 'monolith',
    description: 'Next.js web + Expo mobile sharing schema and types',
  },
];

/**
 * Choices shown in the package manager selection prompt.
 */
export const PACKAGE_MANAGER_CHOICES: ReadonlyArray<{
  readonly name: string;
  readonly value: PackageManagerName;
}> = [
  { name: 'npm', value: 'npm' },
  { name: 'pnpm', value: 'pnpm' },
  { name: 'yarn', value: 'yarn' },
];

const TEMPLATE_VALUES: ReadonlySet<TemplateName> = new Set(TEMPLATE_CHOICES.map((c) => c.value));
const PACKAGE_MANAGER_VALUES: ReadonlySet<PackageManagerName> = new Set(
  PACKAGE_MANAGER_CHOICES.map((c) => c.value),
);

/**
 * Raw inputs gathered from CLI args, before any prompting. Flag values that
 * fail enum validation are narrowed to `undefined` so the prompt re-asks.
 */
export interface PartialInputs {
  projectName: string;
  template?: TemplateName;
  pm?: PackageManagerName;
}

/**
 * Fully resolved inputs after prompting. All fields are required and the
 * template / package manager are narrowed to their literal union types.
 */
export interface ResolvedInputs {
  projectName: string;
  template: TemplateName;
  pm: PackageManagerName;
}

/**
 * Narrow prompt interface used by gatherInputs(). The default implementation
 * wraps @inquirer/prompts; tests substitute a fake driver that records calls.
 *
 * We deliberately do not re-export @inquirer/prompts' types here — the goal
 * is to keep the public surface stable and the test fakes trivial to write.
 */
export interface PromptDriver {
  text(args: { message: string; default?: string }): Promise<string>;
  select<TValue extends string>(args: {
    message: string;
    choices: ReadonlyArray<{
      readonly name: string;
      readonly value: TValue;
      readonly description?: string;
    }>;
  }): Promise<TValue>;
  confirm(args: { message: string; default?: boolean }): Promise<boolean>;
}

/**
 * Default prompt driver — thin adapter over @inquirer/prompts. Kept inside
 * this module so the rest of the codebase only depends on PromptDriver, not
 * on the inquirer package directly.
 */
export const defaultPromptDriver: PromptDriver = {
  async text({ message, default: defaultValue }) {
    try {
      return await input({ message, default: defaultValue });
    } catch (err) {
      if (isInquirerExitError(err)) throw new PromptCancelledError();
      throw err;
    }
  },
  async select({ message, choices }) {
    // @inquirer/prompts types `choices` as a mutable array. Cloning a copy
    // here keeps our public PromptDriver interface readonly without forcing
    // a cast on every call site. We also strip undefined `description`
    // entries so the prompt UI doesn't render an empty hint line.
    const mapped = choices.map((c) =>
      c.description === undefined
        ? { name: c.name, value: c.value }
        : { name: c.name, value: c.value, description: c.description },
    );
    try {
      return await select({ message, choices: mapped });
    } catch (err) {
      if (isInquirerExitError(err)) throw new PromptCancelledError();
      throw err;
    }
  },
  async confirm({ message, default: defaultValue }) {
    try {
      return await confirm({ message, default: defaultValue });
    } catch (err) {
      if (isInquirerExitError(err)) throw new PromptCancelledError();
      throw err;
    }
  },
};

/**
 * Type guard: is `value` one of the known TemplateName literals?
 *
 * The `as TemplateName` cast inside `Set.has()` is a safe assertion: we are
 * checking membership in a set whose element type is the literal union, and
 * the cast is contained inside the type guard. The return type narrows for
 * callers.
 */
function isTemplateName(value: string | undefined): value is TemplateName {
  return value !== undefined && TEMPLATE_VALUES.has(value as TemplateName);
}

/**
 * Type guard: is `value` one of the known PackageManagerName literals?
 * Same caveat as `isTemplateName` — the cast inside `Set.has()` is contained.
 */
function isPackageManagerName(value: string | undefined): value is PackageManagerName {
  return value !== undefined && PACKAGE_MANAGER_VALUES.has(value as PackageManagerName);
}

/**
 * Detect whether interactive prompts are usable. Returns false in CI / piped
 * environments where `@inquirer/prompts` would hang waiting for input.
 */
export function isStdinInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}

/**
 * Coerce raw flag values from Commander into a PartialInputs object.
 * Unknown values are dropped to undefined so gatherInputs() will prompt for
 * them. Strict validation with hard errors lands in Story 1.5.
 */
export function buildPartialInputs(
  projectName: string,
  rawTemplate: string | undefined,
  rawPackageManager: string | undefined,
): PartialInputs {
  return {
    projectName,
    template: isTemplateName(rawTemplate) ? rawTemplate : undefined,
    pm: isPackageManagerName(rawPackageManager) ? rawPackageManager : undefined,
  };
}

/**
 * Interactively gather any missing inputs and return a fully resolved
 * configuration. Prompts that have already been answered via flags are
 * skipped.
 *
 * @param initial  raw inputs from the command line
 * @param driver   prompt driver — defaults to the @inquirer/prompts adapter,
 *                 tests inject a fake to avoid spawning a TTY
 */
export async function gatherInputs(
  initial: PartialInputs,
  driver: PromptDriver = defaultPromptDriver,
  options: { interactive?: boolean } = {},
): Promise<ResolvedInputs> {
  // If stdin is not a TTY (CI, piped input), we cannot interactively prompt.
  // Default to the real TTY check, but allow tests/callers to override.
  const interactive = options.interactive ?? isStdinInteractive();

  if (!interactive) {
    const missing: string[] = [];
    if (initial.template === undefined) missing.push('--template');
    if (initial.pm === undefined) missing.push('--pm');
    if (missing.length > 0) throw new NonInteractiveStdinError(missing);

    // Fully specified via flags — no prompts needed even in non-TTY mode.
    return {
      projectName: initial.projectName,
      template: initial.template as TemplateName,
      pm: initial.pm as PackageManagerName,
    };
  }

  // Project name: always confirm in interactive mode. The positional arg is
  // the default so a happy-path user just hits Enter.
  const projectName = await driver.text({
    message: 'Project name',
    default: initial.projectName,
  });

  const template: TemplateName =
    initial.template ??
    (await driver.select<TemplateName>({
      message: 'Which template do you want to use?',
      choices: TEMPLATE_CHOICES,
    }));

  const pm: PackageManagerName =
    initial.pm ??
    (await driver.select<PackageManagerName>({
      message: 'Which package manager do you want to use?',
      choices: PACKAGE_MANAGER_CHOICES,
    }));

  return { projectName, template, pm };
}
