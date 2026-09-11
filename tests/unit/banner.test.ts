import { describe, expect, it } from 'vitest';
import { buildNextStepsLines, resolveDevCommand } from '../../src/banner.ts';

describe('resolveDevCommand', () => {
  it('web → "<pm> run dev"', () => {
    expect(resolveDevCommand('web', 'npm')).toBe('npm run dev');
    expect(resolveDevCommand('web', 'pnpm')).toBe('pnpm run dev');
  });
  it('mobile → "<pm> start"', () => {
    expect(resolveDevCommand('mobile', 'npm')).toBe('npm start');
    expect(resolveDevCommand('mobile', 'yarn')).toBe('yarn start');
  });
  it('monolith → "<pm> run dev:web"', () => {
    expect(resolveDevCommand('monolith', 'pnpm')).toBe('pnpm run dev:web');
  });
});

describe('buildNextStepsLines', () => {
  const resolved = { projectName: 'my-app', template: 'mobile', pm: 'npm' } as const;

  it('uses the template-correct dev command (mobile → npm start, not npm run dev)', () => {
    const lines = buildNextStepsLines(resolved, '/work/my-app', '/work').join('\n');
    expect(lines).toContain('npm start');
    expect(lines).not.toContain('npm run dev');
  });

  it('includes ordered env → migrate → dev steps and check-env', () => {
    const lines = buildNextStepsLines(resolved, '/work/my-app', '/work').join('\n');
    expect(lines).toContain('check-env');
    expect(lines).toContain('.env.local');
    expect(lines).toContain('db:migrate');
    expect(lines).toContain('Success!');
    expect(lines).toContain('cd ./my-app');
  });

  it('names the queue install script as step 4 by default, and drops it with withQueue: false', () => {
    const withQueue = buildNextStepsLines(resolved, '/work/my-app', '/work').join('\n');
    expect(withQueue).toContain('4. gh repo create');
    expect(withQueue).toContain('bash scripts/queue-install.sh');

    const without = buildNextStepsLines(resolved, '/work/my-app', '/work', {
      withQueue: false,
    }).join('\n');
    expect(without).not.toContain('queue-install');
    expect(without).not.toContain('4.');
  });

  it('web banner still contains "<pm> run dev" (back-compat with cli.test.ts)', () => {
    const web = { projectName: 'w', template: 'web', pm: 'pnpm' } as const;
    const lines = buildNextStepsLines(web, '/work/w', '/work').join('\n');
    expect(lines).toContain('pnpm run dev');
  });
});
