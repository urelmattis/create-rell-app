import { describe, expect, it } from 'vitest';
// @ts-expect-error — check-env.mjs is an untyped dependency-free JS file; runtime behaviour is verified below.
import { parseEnvExample, parseDotenv, evaluate } from '../../templates/web/scripts/check-env.mjs';

describe('check-env parseEnvExample', () => {
  it('uncommented KEY= → required; commented # KEY= → optional', () => {
    const { required, optional } = parseEnvExample('A=\nB=\n# DATABASE_URL=x\n# C comment\n');
    expect(required).toEqual(['A', 'B']);
    expect(optional).toEqual(['DATABASE_URL']);
  });
});

describe('check-env parseDotenv', () => {
  it('parses KEY=VALUE, ignores comments/blanks, strips one quote pair, no eval', () => {
    const env = parseDotenv('A=1\n# c\n\nB="two"\nC=\n');
    expect(env).toEqual({ A: '1', B: 'two', C: '' });
  });
});

describe('check-env evaluate', () => {
  it('flags only non-empty-missing required keys; optional never blocks', () => {
    const spec = { required: ['A', 'B'], optional: ['DATABASE_URL'] };
    const { missingRequired, missingOptional } = evaluate(spec, {
      A: 'x',
      B: '',
      DATABASE_URL: '',
    });
    expect(missingRequired).toEqual(['B']);
    expect(missingOptional).toEqual(['DATABASE_URL']);
  });
});
