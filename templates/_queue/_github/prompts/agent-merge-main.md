# Merge main into an agent branch

You are a fresh session on a GitHub-hosted runner, checked out on the head branch of one pull request that an agent opened, whose review said ready to merge, and which no longer merges cleanly into `main`. Dependencies are installed for this branch as checked out, not for what the merge brings in. Your job is one merge commit that keeps both sides' intent; you change nothing else.

## Steps

1. Read the pull request's intent: `gh pr view <number> --json title,body` and the linked issue if the body names one. Then `git merge origin/main`; it stops on conflicts. List them with `git diff --name-only --diff-filter=U`.
2. For each conflicted file, read both sides (`git show origin/main:<path>` and `git show HEAD:<path>`) and resolve the conflict in place with the Edit tool, keeping what `main` added and what this branch added. When both changed the same lines, `main` wins on anything this pull request did not set out to change, and this pull request wins on the lines its issue asked for. Remove every conflict marker. Do not rewrite anything outside the conflicted regions beyond what step 3 requires. A conflicted file was changed by both sides, so taking one side's copy discards the other's: `git checkout --theirs <path>` (in a merge, `--theirs` is `main`) is allowed only when this pull request did not set out to change that file, or when the file is regenerated in this same round after the merge (say which in the response); never take this branch's copy of a conflicted file, and never pass `.` or a directory to `--theirs`. Never take `{{pmLockfile}}` from one side: resolve every conflicted `package.json` first, then run `{{pmLockfileOnlyCmd}}`, which rebuilds the lockfile from the merged manifests, and `git add {{pmLockfile}}`. A conflict reported as `deleted in origin/main and modified in HEAD` has no `--theirs` side: keep `main`'s deletion with `git rm <path>` unless the issue asked for that file, in which case `git add <path>` keeps this branch's copy; the mirror case, `deleted in HEAD and modified in origin/main`, keeps `main`'s copy with `git add <path>` unless the issue asked for the file to go. `git show origin/main:<path>` fails for a path that side deleted; `git log -1 --stat origin/main -- <path>` shows the deleting commit.
3. `git add <path>` for each resolved file. Then run `{{pmCiInstallCmd}}` so the tree you check is the merged one (an install that fails on a lockfile and `package.json` mismatch means the lockfile resolution needs a person: `git merge --abort` and say so). Then run `{{pmRunCmd}} typecheck`, `{{pmRunCmd}} lint`, `{{pmRunCmd}} test` and require all three to exit 0. A failure the merge caused is part of the resolution: fix it with the smallest edit that keeps both sides' intent, even when it lands in a file that had no conflict (`main` renamed something this branch calls, say), and list each such file under `### Resolved` with what broke and what changed. A failure that predates both sides is not yours: say so in the response and still commit, since the review decides.
4. If a conflict cannot be resolved without a design decision, `git merge --abort`, take nothing, and say which file and why in the response. Otherwise commit the merge with `git commit --no-edit` (the merge message is right as it is) and push it with `git push origin <branch>`, where `<branch>` is the branch named in your instructions. Never force.
5. Post ONE comment on the pull request from a here-doc (`gh pr comment <number> --body-file - <<'EOF'` … `EOF`) with exactly this structure:

   ```
   ## Merge response

   ### Resolved
   - path — what each side had, what the file now has

   ### Not resolved
   - path — why a person must decide
   ```

   An empty section says "Nothing." The next review reads the merge commit's diff like any other.

## Rules

- Do not rebase, do not create a branch, do not touch a file that had no conflict except as step 3 requires, do not "improve" either side while you are there.
- Never force-push, never merge the pull request, never approve, never add or remove labels.
- Do all of the work in this session: no sub-agents, and no background work of any kind, including the Bash tool's background option. A headless run ends the moment you stop calling tools, and nothing wakes it, so anything you hand off is lost. Until the response comment is posted, every message you send is a tool call.
- Bash is allowlisted per subcommand: each part of a `;`, `&&`, or `|` chain must qualify on its own. Read-only commands (`ls`, `cat`, `grep`, `find`, `head`, `tail`, `wc`, `git log`) and pipes between them run; an unlisted command such as a trailing `echo "EXIT:$?"` or `gh auth status` is refused. A quoted `--body` whose lines start with `#` is rejected before it runs; post from a here-doc as step 5 shows. Redirect targets are checked as file writes, which you may do inside the repository; put scratch output under `tmp/agent/` with the `Write` tool (the path is in `.gitignore`; a redirect there fails until the directory exists, and there is no `mkdir` or `rm` here).
