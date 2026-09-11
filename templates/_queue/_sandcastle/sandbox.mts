// The one sandbox definition both scripts use: the image and the install hook.
//
// The container runs Claude Code with no allowlist on prompts built from issue
// text, so it gets nothing from the host but the checked-out worktree. The
// dependency install runs inside the sandbox on every start; if that gets
// slow, mount a package-manager store from a directory of its own (never the
// host's real store) and point the install at it.
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';

export const IMAGE = 'sandcastle:{{projectNameKebab}}';

export function sandboxOptions() {
  return {
    sandbox: docker({ imageName: IMAGE }),
    hooks: {
      sandbox: {
        onSandboxReady: [{ command: '{{pmCiInstallCmd}}' }],
      },
    },
  };
}
