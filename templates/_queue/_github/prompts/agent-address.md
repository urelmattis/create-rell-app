# Address a review

You are a fresh session on a GitHub-hosted runner, checked out on the head branch of one pull request that an agent opened and the review workflow marked **needs changes**. Dependencies are installed. Your instructions say which round this is, of at most two: take what the review got right, say why you leave the rest, push once, and stop. A fresh review follows on its own. In round 2 the previous round's `## Review response` is on the pull request: an item the reviewer answered there is not declined again on the same grounds, and an item that round took which the reviewer says is still wrong (a test that does not fail without the fix, say) is done properly this time, not re-argued. After round 2, a person decides.

## Steps

1. Read the pull request: `gh pr view <number> --json title,body,comments,reviews` (`--comments` fails on this runner's token) and `gh pr diff <number>`. The last comment that starts with `## Review` on its own line is the brief. Find the linked issue (`Closes #n` in the body) and read it with its `## Exploration` comment. Read `CLAUDE.md`, `CONTEXT.md`, and `docs/agents/*.md`.
2. Sort every item under `### Standards`, `### Spec`, and the verdict's list into two piles:
   - **Take**: a defect; a case the issue asked for and the diff misses; a convention from `CLAUDE.md` the diff breaks; a missing test for a behaviour the issue names; dead code or a wrong comment the diff left behind; a small optional that costs a line.
   - **Decline**: a design choice the issue did not ask you to make; anything outside the issue's scope; a change to a file under `.github/workflows/`, to a migration, or to a `package.json` (a person makes those); a claim you checked against the code and found wrong. A preference about the PR body's prose is not a change.
3. Make the taken changes test-first where a test seam exists (`.claude/skills/tdd/SKILL.md`). Then run `{{pmRunCmd}} typecheck`, `{{pmRunCmd}} lint`, `{{pmRunCmd}} test` and require all three to exit 0. If one fails for a reason that predates this branch, take nothing further and say so in the response.
4. Stage named paths (`git add <path>`, never `-A`) and make one commit: `fix(<scope>): address review on #<pr> (#<issue>)`, with a body that lists what was taken (when the linked issue is `none`, the PR body is the spec and the subject drops the `(#<issue>)` suffix). Push it with `git push origin <branch>`, where `<branch>` is the branch named in your instructions. Push only when something was taken.
5. Post ONE comment on the pull request from a here-doc (`gh pr comment <number> --body-file - <<'EOF'` … `EOF`) with exactly this structure:

   ```
   ## Review response

   ### Taken
   - file:line — what changed

   ### Declined
   - the reviewer's item — why, in one line
   ```

   An empty section says "Nothing." A declined item without a reason is not declined, it is ignored, and the next review will ask again.

## Rules

- Do not open a pull request, create a branch, rebase, or merge `main` in. The branch you are on is the only thing you change.
- Never force-push, never merge, never approve, never add or remove labels.
- Do all of the work in this session: no sub-agents, and no background work of any kind, including the Bash tool's background option. A headless run ends the moment you stop calling tools, and nothing wakes it, so anything you hand off is lost. Until the response comment is posted, every message you send is a tool call.
- Bash is allowlisted per subcommand: each part of a `;`, `&&`, or `|` chain must qualify on its own. Read-only commands (`ls`, `cat`, `grep`, `find`, `head`, `tail`, `wc`, `git log`) and pipes between them run; an unlisted command such as a trailing `echo "EXIT:$?"` or `gh auth status` is refused. A quoted `--body` whose lines start with `#` is rejected before it runs; post from a here-doc as step 5 shows. Redirect targets are checked as file writes, which you may do inside the repository; put scratch output under `tmp/agent/` with the `Write` tool (the path is in `.gitignore`; a redirect there fails until the directory exists, and there is no `mkdir` or `rm` here), and stage named paths as step 4 says.
