// Unit tests for the pure helpers exported from tests/smoke/smoke-helpers.mjs.
//
// The smoke runner itself (tests/smoke/smoke-test.mjs) orchestrates
// scaffold + install + build + lint across real filesystems and takes
// several minutes per run, so it is NOT a Vitest test. The testable
// surface is the pure data + string functions extracted into
// smoke-helpers.mjs, which this file exercises in isolation.
//
// The import uses the companion .d.ts for types; at runtime Vitest
// (via Vite) resolves the .mjs source naturally.

import { describe, expect, it } from 'vitest';

import {
  ALL_TEMPLATE_NAMES,
  TEMPLATES,
  computeExitCode,
  formatSummary,
  formatSummaryLine,
  parseTemplatesFlag,
} from '../smoke/smoke-helpers.mjs';
import type { TemplateResult } from '../smoke/smoke-helpers.mjs';

describe('TEMPLATES matrix', () => {
  it('defines exactly the three known templates in the canonical order', () => {
    expect(ALL_TEMPLATE_NAMES).toEqual(['web', 'mobile', 'monolith']);
    // Object.keys preserves insertion order for string keys, which we rely on.
    expect(Object.keys(TEMPLATES)).toEqual(['web', 'mobile', 'monolith']);
  });

  it('every template starts with an install step', () => {
    for (const name of ALL_TEMPLATE_NAMES) {
      const first = TEMPLATES[name].steps[0];
      expect(first?.label).toBe('install');
      expect(first?.cmd).toBe('npm');
      expect(first?.args).toEqual(['install']);
    }
  });

  it('web runs lint and typecheck after install (no next build — requires env vars)', () => {
    const labels = TEMPLATES.web.steps.map((s) => s.label);
    expect(labels).toEqual(['install', 'lint', 'typecheck', 'format:check', 'test']);
    expect(labels).not.toContain('build');
  });

  it('mobile runs lint and typecheck after install (Expo has no build script)', () => {
    const labels = TEMPLATES.mobile.steps.map((s) => s.label);
    expect(labels).toEqual(['install', 'lint', 'typecheck', 'format:check', 'test']);
    expect(labels).not.toContain('build');
  });

  it('monolith runs lint and typecheck after install (no build:web — requires env vars)', () => {
    const labels = TEMPLATES.monolith.steps.map((s) => s.label);
    expect(labels).toEqual(['install', 'lint', 'typecheck', 'format:check', 'test']);
    expect(labels).not.toContain('build');
  });

  it('every template requires the core files at minimum', () => {
    // Monolith ships per-app env files instead of a root .env.example
    const sharedCore = ['package.json', 'README.md', '.gitignore'];
    const soloCore = [...sharedCore, '.env.example', '.env.local', 'scripts/check-env.mjs'];
    for (const name of ALL_TEMPLATE_NAMES) {
      const core = name === 'monolith' ? sharedCore : soloCore;
      for (const file of core) {
        expect(TEMPLATES[name].requiredFiles).toContain(file);
      }
    }
  });

  it('monolith additionally requires the three workspace package.json files', () => {
    expect(TEMPLATES.monolith.requiredFiles).toContain('apps/web/package.json');
    expect(TEMPLATES.monolith.requiredFiles).toContain('apps/mobile/package.json');
    expect(TEMPLATES.monolith.requiredFiles).toContain('packages/shared/package.json');
  });
});

describe('parseTemplatesFlag', () => {
  it('returns all template names when the flag is absent', () => {
    expect(parseTemplatesFlag([])).toEqual(['web', 'mobile', 'monolith']);
    expect(parseTemplatesFlag(['node', 'smoke-test.mjs'])).toEqual(['web', 'mobile', 'monolith']);
  });

  it('returns a single template when requested', () => {
    expect(parseTemplatesFlag(['--templates=web'])).toEqual(['web']);
  });

  it('returns multiple templates in requested order, not canonical order', () => {
    expect(parseTemplatesFlag(['--templates=monolith,web'])).toEqual(['monolith', 'web']);
  });

  it('collapses duplicates while preserving first-seen order', () => {
    expect(parseTemplatesFlag(['--templates=web,mobile,web'])).toEqual(['web', 'mobile']);
  });

  it('tolerates whitespace around commas', () => {
    expect(parseTemplatesFlag(['--templates=web, mobile ,monolith'])).toEqual([
      'web',
      'mobile',
      'monolith',
    ]);
  });

  it('throws on an empty flag value', () => {
    expect(() => parseTemplatesFlag(['--templates='])).toThrow(/empty/i);
  });

  it('throws on an empty comma entry', () => {
    expect(() => parseTemplatesFlag(['--templates=web,,mobile'])).toThrow(/empty/i);
  });

  it('throws on an unknown template name with a helpful message', () => {
    expect(() => parseTemplatesFlag(['--templates=bogus'])).toThrow(/Unknown template/);
    expect(() => parseTemplatesFlag(['--templates=web,bogus'])).toThrow(/bogus/);
  });

  it('ignores unrelated argv entries', () => {
    expect(parseTemplatesFlag(['--verbose', '--templates=web', '--other'])).toEqual(['web']);
  });
});

describe('formatSummaryLine', () => {
  it('formats a passing result with padded name and seconds', () => {
    const line = formatSummaryLine('web', { status: 'pass', durationMs: 12345 });
    expect(line).toBe('web       : PASS (12.3s)');
  });

  it('formats a failing result with the step that failed', () => {
    const line = formatSummaryLine('monolith', {
      status: 'fail',
      failedStep: 'build:web',
      durationMs: 45100,
    });
    expect(line).toBe('monolith  : FAIL @ build:web (45.1s)');
  });

  it('formats a failing result without a step label if none supplied', () => {
    const line = formatSummaryLine('mobile', { status: 'fail', durationMs: 1000 });
    expect(line).toBe('mobile    : FAIL (1.0s)');
  });

  it('pads short template names to 10 characters for alignment', () => {
    const line = formatSummaryLine('web', { status: 'pass', durationMs: 1000 });
    // 'web' + 7 spaces + ': PASS (1.0s)'
    expect(line.startsWith('web       :')).toBe(true);
  });
});

describe('formatSummary', () => {
  it('produces a PASS overall line when every template passes', () => {
    const results: TemplateResult[] = [
      { name: 'web', status: 'pass', durationMs: 1000 },
      { name: 'mobile', status: 'pass', durationMs: 2000 },
      { name: 'monolith', status: 'pass', durationMs: 3000 },
    ];
    const out = formatSummary(results);
    expect(out).toContain('web       : PASS (1.0s)');
    expect(out).toContain('mobile    : PASS (2.0s)');
    expect(out).toContain('monolith  : PASS (3.0s)');
    expect(out).toContain('overall   : PASS');
    expect(out).not.toContain('FAIL');
  });

  it('produces a FAIL overall line when any template fails', () => {
    const results: TemplateResult[] = [
      { name: 'web', status: 'pass', durationMs: 1000 },
      { name: 'mobile', status: 'fail', failedStep: 'lint', durationMs: 2000 },
      { name: 'monolith', status: 'pass', durationMs: 3000 },
    ];
    const out = formatSummary(results);
    expect(out).toContain('mobile    : FAIL @ lint (2.0s)');
    expect(out).toContain('overall   : FAIL');
  });
});

describe('computeExitCode', () => {
  it('returns 0 on all-pass', () => {
    expect(computeExitCode([{ status: 'pass' }, { status: 'pass' }])).toBe(0);
  });

  it('returns 1 on any fail', () => {
    expect(computeExitCode([{ status: 'pass' }, { status: 'fail' }])).toBe(1);
  });

  it('returns 1 on an empty result set (nothing ran)', () => {
    expect(computeExitCode([])).toBe(1);
  });
});
