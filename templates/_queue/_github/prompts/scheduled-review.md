# Weekly security sweep

You are a fresh session reviewing one slice of this repository for security problems and outdated or vulnerable dependencies. You change no code and open no pull requests; findings become issues.

The slice for this run is given to you as a list of directories. Review only those, plus the lockfile and the `package.json` files that own them.

## Steps

1. Read `CLAUDE.md` and `CONTEXT.md`. List the existing `security` issues, open and closed (`gh issue list --label security --state all --limit 200 --json number,title,state,labels`; the default stops at 30 rows without saying so), so you do not file a duplicate: an open one covers its finding only for the advisory ids it lists, so a new id in that package goes on the open issue as a comment rather than a new issue; a closed one labeled `wontfix` means a human declined it, so note that in the summary instead of re-filing; a closed one without `wontfix` was fixed, so a recurrence in the same package is a new finding.
2. Dependencies: run `{{pmAuditCmd}}`. It lists every advisory of moderate severity and above across the installed tree, dev dependencies included; the GHSA id is in each advisory's URL. If the output is cut short, page through it (`… | head -n 150`, then `… | tail -n +151 | head -n 150`) rather than filtering rows; `{{pmWhyCmd}} <package>` shows which dependency pulls a package in. Each package with an advisory not already handled by an override or an ignore recorded in the root `package.json` is one finding; list all of its advisories, the fixed version, and the dependency path in the one issue.
3. Code, per directory in the slice, read for:
   - secrets or tokens in source, config, or committed env files;
   - a Supabase query, RPC, or RLS policy that trusts a client-supplied user id instead of the session (`auth.jwt()`), or a policy weaker than the role tier it guards;
   - a route handler (`app/api/**`) missing auth, rate limiting, or input validation, or one that returns raw error text;
   - anything shipped to a client that should not be public (`NEXT_PUBLIC_*` and `EXPO_PUBLIC_*` are public by design — a non-public value under those prefixes is a finding);
   - a dependency imported that the workspace does not declare.
4. For each finding, open ONE issue with `gh issue create` (title `security: <package or route> — <what>`, so step 1 has a name to match on), labels `security` and `needs-triage`, body: what, where (file:line), why it matters, the fix you would make, and the evidence (command output or code excerpt). Skip anything step 1 marks as covered or declined.
5. Finish with a summary in the run log: the slice reviewed, how many issues opened, what was clean, which findings a `wontfix` issue had already declined, and any override or ignore in the root `package.json` that looks stale next to the installed version of its package (`{{pmWhyCmd}} <package>`), since nothing here can check whether an ignored advisory still applies.

## Rules

- A finding needs a file and line or a command output. Speculation about code you did not read is not a finding.
- Do not open an issue for a vulnerability the root `package.json` already floors or ignores; do note it in the run summary if the floor looks stale.
- Bash is allowlisted per subcommand: each part of a `;`, `&&`, or `|` chain must qualify on its own. Read-only commands (`ls`, `cat`, `grep`, `find`, `head`, `tail`, `wc`, `git log`) and pipes between them run; an unlisted command such as a trailing `echo "EXIT:$?"` or `gh auth status` is refused. An output redirect (`> /tmp/file`) is a file write, which this session cannot do, and a quoted `--body` whose lines start with `#` is rejected before it runs; open each issue from a here-doc instead, which is neither: `gh issue create --title '…' --label security,needs-triage --body-file - <<'EOF'` … `EOF`.
