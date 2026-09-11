import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertTargetDirSafe,
  assertValidPackageManager,
  assertValidProjectName,
  assertValidTemplate,
  validatePackageManager,
  validateProjectName,
  validateTemplate,
  ValidationError,
} from '../../src/validation.ts';
import type { PromptDriver } from '../../src/prompts.ts';

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'crapp-validation-'));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

describe('validateProjectName', () => {
  it.each(['my-app', 'my_app', 'app123', 'a', 'lowercase.dot.app'])(
    'accepts valid name "%s"',
    (name) => {
      expect(validateProjectName(name)).toEqual({ ok: true });
    },
  );

  it('rejects an empty string', () => {
    const result = validateProjectName('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/required/i);
  });

  it('rejects whitespace-padded names', () => {
    expect(validateProjectName(' my-app').ok).toBe(false);
    expect(validateProjectName('my-app ').ok).toBe(false);
  });

  it('rejects names containing forward slashes', () => {
    expect(validateProjectName('foo/bar').ok).toBe(false);
  });

  it('rejects names containing backslashes', () => {
    expect(validateProjectName('foo\\bar').ok).toBe(false);
  });

  it('rejects names with NUL bytes', () => {
    expect(validateProjectName('evil\0name').ok).toBe(false);
  });

  it('rejects names starting with a dot', () => {
    expect(validateProjectName('.dotapp').ok).toBe(false);
  });

  it('rejects names starting with an underscore', () => {
    expect(validateProjectName('_underscore').ok).toBe(false);
  });

  it('rejects names longer than 214 characters', () => {
    const long = 'a'.repeat(215);
    const result = validateProjectName(long);
    expect(result.ok).toBe(false);
  });

  it('accepts a 214-character name', () => {
    const just = 'a'.repeat(214);
    expect(validateProjectName(just)).toEqual({ ok: true });
  });

  it('rejects names containing uppercase letters', () => {
    expect(validateProjectName('MyApp').ok).toBe(false);
  });

  it('rejects names containing spaces', () => {
    expect(validateProjectName('my app').ok).toBe(false);
  });
});

describe('assertValidProjectName', () => {
  it('returns void on valid input', () => {
    expect(() => assertValidProjectName('my-app')).not.toThrow();
  });

  it('throws ValidationError on invalid input', () => {
    expect(() => assertValidProjectName('')).toThrow(ValidationError);
  });

  it('embeds the input name in the error message', () => {
    try {
      assertValidProjectName('Bad Name');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).toContain('Bad Name');
    }
  });
});

describe('validateTemplate', () => {
  it.each(['web', 'mobile', 'monolith'])('accepts %s', (value) => {
    expect(validateTemplate(value)).toEqual({ ok: true });
  });

  it('rejects unknown template values', () => {
    const result = validateTemplate('react');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('react');
      expect(result.reason).toContain('web');
      expect(result.reason).toContain('mobile');
      expect(result.reason).toContain('monolith');
    }
  });
});

describe('validatePackageManager', () => {
  it.each(['npm', 'pnpm', 'yarn'])('accepts %s', (value) => {
    expect(validatePackageManager(value)).toEqual({ ok: true });
  });

  it('rejects unknown package managers', () => {
    const result = validatePackageManager('bun');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('bun');
  });
});

describe('assertValidTemplate / assertValidPackageManager', () => {
  it('throw on invalid values', () => {
    expect(() => assertValidTemplate('react')).toThrow(ValidationError);
    expect(() => assertValidPackageManager('bun')).toThrow(ValidationError);
  });

  it('do not throw on valid values', () => {
    expect(() => assertValidTemplate('web')).not.toThrow();
    expect(() => assertValidPackageManager('pnpm')).not.toThrow();
  });
});

describe('assertTargetDirSafe', () => {
  function makeDriver(opts: { confirmAnswer?: boolean } = {}): {
    driver: PromptDriver;
    confirmCalls: number;
  } {
    let confirmCalls = 0;
    const driver: PromptDriver = {
      text: () => Promise.resolve(''),
      select: ({ choices }) => {
        const first = choices[0];
        if (!first) throw new Error('empty choices');
        return Promise.resolve(first.value);
      },
      confirm: () => {
        confirmCalls += 1;
        return Promise.resolve(opts.confirmAnswer ?? false);
      },
    };
    return { driver, confirmCalls: confirmCalls };
  }

  it('returns immediately when target dir does not exist', async () => {
    const { driver } = makeDriver();
    const missing = join(tempRoot, 'nope');

    await expect(
      assertTargetDirSafe(missing, { interactive: true, driver }),
    ).resolves.toBeUndefined();
  });

  it('returns immediately when target dir is empty', async () => {
    const { driver } = makeDriver();

    await expect(
      assertTargetDirSafe(tempRoot, { interactive: true, driver }),
    ).resolves.toBeUndefined();
  });

  it('throws ValidationError in non-interactive mode when target dir is non-empty', async () => {
    await writeFile(join(tempRoot, 'existing.txt'), '', 'utf8');
    const { driver } = makeDriver();

    await expect(
      assertTargetDirSafe(tempRoot, { interactive: false, driver }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('asks the driver to confirm in interactive mode when target dir is non-empty', async () => {
    await writeFile(join(tempRoot, 'existing.txt'), '', 'utf8');
    let calls = 0;
    const driver: PromptDriver = {
      text: () => Promise.resolve(''),
      select: ({ choices }) => {
        const first = choices[0];
        if (!first) throw new Error('empty choices');
        return Promise.resolve(first.value);
      },
      confirm: () => {
        calls += 1;
        return Promise.resolve(true);
      },
    };

    await expect(
      assertTargetDirSafe(tempRoot, { interactive: true, driver }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });

  it('throws ValidationError when the user declines the overwrite confirm', async () => {
    await writeFile(join(tempRoot, 'existing.txt'), '', 'utf8');
    const driver: PromptDriver = {
      text: () => Promise.resolve(''),
      select: ({ choices }) => {
        const first = choices[0];
        if (!first) throw new Error('empty choices');
        return Promise.resolve(first.value);
      },
      confirm: () => Promise.resolve(false),
    };

    await expect(assertTargetDirSafe(tempRoot, { interactive: true, driver })).rejects.toThrow(
      /aborted/i,
    );
  });

  it('throws ValidationError when target path exists but is a file', async () => {
    const filePath = join(tempRoot, 'just-a-file');
    await writeFile(filePath, '', 'utf8');
    const driver: PromptDriver = {
      text: () => Promise.resolve(''),
      select: ({ choices }) => {
        const first = choices[0];
        if (!first) throw new Error('empty choices');
        return Promise.resolve(first.value);
      },
      confirm: () => Promise.resolve(true),
    };

    await expect(assertTargetDirSafe(filePath, { interactive: true, driver })).rejects.toThrow(
      /not a directory/,
    );
  });
});
