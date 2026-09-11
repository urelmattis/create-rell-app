# Review of `{{SOURCE_BRANCH}}` for issue #{{ISSUE_NUMBER}}

{{ISSUE_TEXT}}

# The diff against `{{BASE}}`

!`git diff {{BASE}}...HEAD --stat`

!`git diff {{BASE}}...HEAD`

# Task

You are a fresh session, never the one that wrote this diff. Review it along two axes and fix what you can.

1. **Standards.** Check the diff against the conventions in `CLAUDE.md` and the repository's habits around it, then the general smells: duplicated logic, a function that grew a second job, dead code, a name that contradicts `CONTEXT.md`.
2. **Spec.** Does the diff do what the issue asked, all of it and nothing the issue did not ask for? For a documentation change, is every claim verifiable from the repository (`git log`, the files themselves)? Check a sample.
3. A defect you can fix in a few lines: fix it on this branch and commit it with named paths and the message `review: <what> (#{{ISSUE_NUMBER}})`. Anything larger stays a finding.
4. Write the review, in this exact shape:

```
## Review

### Standards
- file:line — finding — why it matters

### Spec
- what the issue asked → what the diff does → gap, if any

### Verdict
One of: **ready to merge** · **needs changes** (list them) · **needs a human decision** (say which)
```

An empty section says "Nothing found." A finding without a file and line is not a finding.

5. Then output the completion signal on its own line:

<promise>COMPLETE</promise>

# Rules

- There is no GitHub access here. Do not try to post anything; the host copies this review into the pull request.
- No sub-agents and no background work: this session ends when you stop calling tools.
