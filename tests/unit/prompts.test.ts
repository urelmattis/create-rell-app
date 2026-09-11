import { describe, it, expect } from 'vitest';

import {
  buildPartialInputs,
  gatherInputs,
  isStdinInteractive,
  NonInteractiveStdinError,
  PACKAGE_MANAGER_CHOICES,
  TEMPLATE_CHOICES,
} from '../../src/prompts.ts';
import type { PackageManagerName, TemplateName } from '../../src/index.ts';
import type { PromptDriver } from '../../src/prompts.ts';

/**
 * Records every call to the prompt driver so tests can assert which prompts
 * were shown and which were skipped. The fake answers are queued via the
 * `text` and `select` arrays — pop from the front so order matches.
 */
interface FakeDriverCalls {
  text: Array<{ message: string; default?: string }>;
  select: Array<{ message: string; choiceValues: readonly string[] }>;
}

interface FakeDriverConfig {
  // Answer to text prompts in order. If undefined, the driver returns the
  // `default` from the prompt args (mimics "user just hit Enter").
  textAnswers?: Array<string | undefined>;
  // Answer to select prompts in order. If undefined, the first choice is
  // returned (mimics "user accepted the highlighted default").
  selectAnswers?: string[];
}

function makeFakeDriver(config: FakeDriverConfig = {}): {
  driver: PromptDriver;
  calls: FakeDriverCalls;
} {
  const calls: FakeDriverCalls = { text: [], select: [] };
  const textQueue = [...(config.textAnswers ?? [])];
  const selectQueue = [...(config.selectAnswers ?? [])];

  const driver: PromptDriver = {
    text(args) {
      calls.text.push({ message: args.message, default: args.default });
      const queued = textQueue.shift();
      return Promise.resolve(queued ?? args.default ?? '');
    },
    select(args) {
      calls.select.push({
        message: args.message,
        choiceValues: args.choices.map((c) => c.value),
      });
      const queued = selectQueue.shift();
      if (queued !== undefined) {
        const match = args.choices.find((c) => c.value === queued);
        if (!match) {
          throw new Error(`Fake driver: queued select answer "${queued}" not in choices`);
        }
        return Promise.resolve(match.value);
      }
      const first = args.choices[0];
      if (!first) {
        throw new Error('Fake driver: select called with empty choices');
      }
      return Promise.resolve(first.value);
    },
    confirm(args) {
      // Tests in this file don't exercise confirm; default to false so any
      // accidental call fails the surrounding flow loudly.
      return Promise.resolve(args.default ?? false);
    },
  };

  return { driver, calls };
}

describe('buildPartialInputs', () => {
  it('passes through valid template and package manager values', () => {
    const result = buildPartialInputs('my-app', 'web', 'pnpm');
    expect(result).toEqual({ projectName: 'my-app', template: 'web', pm: 'pnpm' });
  });

  it('drops unknown template values to undefined', () => {
    const result = buildPartialInputs('my-app', 'react', 'pnpm');
    expect(result.template).toBeUndefined();
    expect(result.pm).toBe('pnpm');
  });

  it('drops unknown package manager values to undefined', () => {
    const result = buildPartialInputs('my-app', 'web', 'bun');
    expect(result.template).toBe('web');
    expect(result.pm).toBeUndefined();
  });

  it('returns undefined for both when neither flag is provided', () => {
    const result = buildPartialInputs('my-app', undefined, undefined);
    expect(result.template).toBeUndefined();
    expect(result.pm).toBeUndefined();
  });
});

describe('gatherInputs', () => {
  it('always prompts for project name with the positional value as the default', async () => {
    const { driver, calls } = makeFakeDriver({
      selectAnswers: ['monolith', 'npm'],
    });

    const resolved = await gatherInputs(
      { projectName: 'my-app', template: undefined, pm: undefined },
      driver,
      { interactive: true },
    );

    expect(calls.text).toHaveLength(1);
    expect(calls.text[0]?.default).toBe('my-app');
    expect(resolved.projectName).toBe('my-app');
  });

  it('skips the template prompt when --template is provided', async () => {
    const { driver, calls } = makeFakeDriver({ selectAnswers: ['npm'] });

    const resolved = await gatherInputs(
      { projectName: 'my-app', template: 'web', pm: undefined },
      driver,
      { interactive: true },
    );

    expect(calls.select).toHaveLength(1);
    expect(calls.select[0]?.choiceValues).toEqual(PACKAGE_MANAGER_CHOICES.map((c) => c.value));
    expect(resolved.template).toBe('web');
    expect(resolved.pm).toBe('npm');
  });

  it('skips the package manager prompt when --pm is provided', async () => {
    const { driver, calls } = makeFakeDriver({ selectAnswers: ['monolith'] });

    const resolved = await gatherInputs(
      { projectName: 'my-app', template: undefined, pm: 'pnpm' },
      driver,
      { interactive: true },
    );

    expect(calls.select).toHaveLength(1);
    expect(calls.select[0]?.choiceValues).toEqual(TEMPLATE_CHOICES.map((c) => c.value));
    expect(resolved.template).toBe('monolith');
    expect(resolved.pm).toBe('pnpm');
  });

  it('skips both select prompts when --template and --pm are provided', async () => {
    const { driver, calls } = makeFakeDriver();

    const resolved = await gatherInputs(
      { projectName: 'my-app', template: 'web', pm: 'pnpm' },
      driver,
      { interactive: true },
    );

    expect(calls.select).toHaveLength(0);
    // Project name is still prompted (AC 5: "confirm or modify").
    expect(calls.text).toHaveLength(1);
    expect(resolved).toEqual({ projectName: 'my-app', template: 'web', pm: 'pnpm' });
  });

  it('returns the user-modified project name when they edit the default', async () => {
    const { driver } = makeFakeDriver({
      textAnswers: ['renamed-app'],
      selectAnswers: ['monolith', 'npm'],
    });

    const resolved = await gatherInputs(
      { projectName: 'my-app', template: undefined, pm: undefined },
      driver,
      { interactive: true },
    );

    expect(resolved.projectName).toBe('renamed-app');
  });

  it('returns the resolved template selected via prompt', async () => {
    const { driver } = makeFakeDriver({ selectAnswers: ['mobile', 'yarn'] });

    const resolved = await gatherInputs(
      { projectName: 'my-app', template: undefined, pm: undefined },
      driver,
      { interactive: true },
    );

    const expectedTemplate: TemplateName = 'mobile';
    const expectedPm: PackageManagerName = 'yarn';
    expect(resolved.template).toBe(expectedTemplate);
    expect(resolved.pm).toBe(expectedPm);
  });

  it('throws NonInteractiveStdinError when stdin is not a TTY and flags are missing', async () => {
    const { driver, calls } = makeFakeDriver();

    await expect(
      gatherInputs({ projectName: 'my-app', template: undefined, pm: undefined }, driver, {
        interactive: false,
      }),
    ).rejects.toBeInstanceOf(NonInteractiveStdinError);

    // Confirm no prompts were attempted in non-interactive mode.
    expect(calls.text).toHaveLength(0);
    expect(calls.select).toHaveLength(0);
  });

  it('lists only the missing flags in NonInteractiveStdinError', async () => {
    const { driver } = makeFakeDriver();

    await expect(
      gatherInputs({ projectName: 'my-app', template: 'web', pm: undefined }, driver, {
        interactive: false,
      }),
    ).rejects.toThrow(/--pm/);
  });

  it('returns inputs without prompting when stdin is non-interactive and all flags are provided', async () => {
    const { driver, calls } = makeFakeDriver();

    const resolved = await gatherInputs(
      { projectName: 'my-app', template: 'web', pm: 'pnpm' },
      driver,
      { interactive: false },
    );

    expect(resolved).toEqual({ projectName: 'my-app', template: 'web', pm: 'pnpm' });
    expect(calls.text).toHaveLength(0);
    expect(calls.select).toHaveLength(0);
  });
});

describe('isStdinInteractive', () => {
  it('returns a boolean reflecting process.stdin.isTTY', () => {
    expect(typeof isStdinInteractive()).toBe('boolean');
  });
});
