// Post-scaffold "next steps" banner composition for create-rell-app.
//
// Pure and unit-tested. `resolveDevCommand` maps a template to the command
// that actually starts its dev server — derived from a static map rather than
// the scaffolded package.json so it is deterministic (works in dry-run and in
// tests with bare fixtures). A consistency test asserts this map matches each
// template's real scripts.

import { posix as posixPath, resolve as platformResolve, sep as platformSep } from 'node:path';

import type { PackageManagerName, TemplateName } from './index.ts';
import { getPackageManagerCommands } from './install.ts';
import type { ResolvedInputs } from './prompts.ts';

/**
 * The command that starts the dev server for a given template, using the
 * chosen package manager. web/monolith use `run <script>`; mobile follows the
 * npm `start` convention (`<pm> start`).
 */
export function resolveDevCommand(template: TemplateName, pm: PackageManagerName): string {
  const { run } = getPackageManagerCommands(pm); // e.g. "npm run"
  const bin = run.split(' ')[0]; // e.g. "npm"
  switch (template) {
    case 'web':
      return `${run} dev`;
    case 'mobile':
      return `${bin} start`;
    case 'monolith':
      return `${run} dev:web`;
  }
}

/**
 * Compose the post-scaffold "next steps" banner as an array of plain lines
 * (no I/O, no chalk — the caller styles + prints). Mirrors the template
 * README order: configure .env.local → migrate → dev. The dev command is
 * template-correct so mobile/monolith never print a script that doesn't exist.
 */
export function buildNextStepsLines(
  resolved: ResolvedInputs,
  targetDir: string,
  cwd: string = process.cwd(),
  options: { withQueue?: boolean } = {},
): string[] {
  const cmds = getPackageManagerCommands(resolved.pm);
  const dev = resolveDevCommand(resolved.template, resolved.pm);
  const absolute = platformResolve(targetDir);
  const relative =
    absolute === cwd || absolute.startsWith(cwd + platformSep)
      ? './' + posixPath.relative(cwd, absolute).split(/[\\/]/).join('/')
      : absolute;

  const lines = [
    `Success! Created ${resolved.projectName} at ${targetDir}`,
    '',
    'Next steps:',
    `  cd ${relative}`,
    `  1. Fill in .env.local        → ${cmds.run} check-env   (shows what's missing + where to get it)`,
    `  2. ${cmds.run} db:migrate       (apply database migrations)`,
    `  3. ${dev}              (start the dev server)`,
  ];
  if (options.withQueue ?? true) {
    lines.push(
      `  4. gh repo create && git push -u origin main, then bash scripts/queue-install.sh`,
      `     (labels, branch protection, auto-merge; then the AFK agent queue runs on every issue)`,
    );
  }
  lines.push('');
  return lines;
}
