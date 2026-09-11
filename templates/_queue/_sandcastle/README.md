# sandcastle: the on-demand runner

The agent queue in `.github/workflows/` runs on GitHub-hosted runners. This directory is the same work done in a Docker sandbox on your own machine, with [sandcastle](https://github.com/mattpocock/sandcastle): one session implements an issue, a second reviews it in the same sandbox, and the host pushes the branch and opens the pull request labeled `agent-pr`, so the queue's review and auto-merge take it from there. Use it when a runner is not enough: a long build, a local service, a bigger model budget.

## One-time setup

```sh
{{pmAddDevCmd}} @ai-hero/sandcastle tsx
{{pmExecLocalCmd}} sandcastle docker build-image --dockerfile .sandcastle/Dockerfile --image-name sandcastle:{{projectNameKebab}}
cp .sandcastle/env.example .sandcastle/.env    # then paste the token from `claude setup-token`
```

The image is `sandcastle:{{projectNameKebab}}`; rebuild it after changing the Dockerfile. `.sandcastle/.env`, `logs/` and `worktrees/` are ignored by git.

## Run

```sh
{{pmExecLocalCmd}} tsx .sandcastle/smoke.mts          # no token needed: proves the sandbox and the install
{{pmExecLocalCmd}} tsx .sandcastle/main.mts <issue>   # implement, review, push, open the PR
```

The sandbox never talks to GitHub: the host fetches the issue and the pull requests it cites with your `gh` login, injects them into the prompts, and pushes afterwards. The prompts are `implement-prompt.md` and `review-prompt.md`; `sandbox.mts` is the one place the image and the install hook are defined.
