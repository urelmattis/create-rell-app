# Issue #{{ISSUE_NUMBER}}

{{ISSUE_TEXT}}

# Pull requests the issue refers to

{{PR_CONTEXT}}

# Repository state

You are on branch `{{SOURCE_BRANCH}}`, created from `{{BASE}}`. Recent commits on it:

!`git log --oneline -8`

# Task

You are a fresh session in a sandbox with dependencies installed. Implement issue #{{ISSUE_NUMBER}} exactly as written, nothing more, and commit.

1. Read `CLAUDE.md`, `CONTEXT.md`, and `docs/agents/*.md` and follow their conventions. Read every file the issue names before writing anything.
2. Where the change has behaviour, work test-first: a failing test, the smallest change that passes it, then tidy. A documentation-only change has no test; `{{pmRunCmd}} format:check` is its gate.
3. Before committing, review your own diff along both axes of the `code-review` skill (`.claude/skills/code-review/SKILL.md`), standards then spec, doing both passes yourself in this session. Fix what you find.
4. Run the gates that apply and require them to pass: `{{pmRunCmd}} format:check` always; `{{pmRunCmd}} typecheck`, `{{pmRunCmd}} lint`, and `{{pmRunCmd}} test` when code changed.
5. Commit once, staging named paths (`git add <path>`, never `-A`), with a conventional message that references the issue, for example `docs: … (#{{ISSUE_NUMBER}})`.
6. Then output the completion signal on its own line:

<promise>COMPLETE</promise>

# Rules

- There is no GitHub access here: no `gh` in the image and no token. Everything the issue and its pull requests say is above. The branch is pushed and the pull request opened from the host after you finish.
- Do not touch `.github/workflows/`, dependency lists in any `package.json`, or `CLAUDE.md`.
- No sub-agents and no background work: this session ends when you stop calling tools, and nothing wakes it.
- If you cannot finish (missing context, a gate you cannot make pass), commit nothing, write `BLOCKED: <reason>` on its own line, and output the completion signal anyway.
