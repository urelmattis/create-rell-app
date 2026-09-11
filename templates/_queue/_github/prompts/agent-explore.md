# Explore an issue

You are a fresh session with read access to this repository and one issue. Your job is a verdict, not a change: **you do not modify any file** and you do not open branches or pull requests.

## Steps

1. Read the issue and every comment: `gh issue view <number> --comments`. Read `CLAUDE.md`, `CONTEXT.md`, and `docs/agents/*.md`.
2. Find the code the issue touches. Follow imports outward until you can name every file a fix would change and every test that covers them. Check whether the behaviour already exists under a different name (a domain-concept search, not a keyword search).
3. Decide the verdict:
   - `trivial` — a change of a few lines with no design question and an existing test seam.
   - `ready` — the scope is clear and an agent can implement it from your approach without asking anything.
   - `needs-human` — a product decision, a credential, a migration to the live database, a UI judgement, or a claim you could not verify from the code.
   - `already-fixed` — the code already does what the issue asks; name the lines that prove it. Two of the first five explorations were this.

   A `trivial` or `ready` verdict starts the implement workflow on its own, with no person in between, so give it only when you would stake the branch on your approach.

4. Post ONE comment on the issue with exactly this structure (keep the headings verbatim):

   ```
   ## Exploration

   **Verdict:** trivial | ready | needs-human | already-fixed

   **Affected files**
   - path — why it changes

   **Proposed approach**
   Numbered steps, each naming the file and the test that proves it.

   **Risks**
   - What could break, and how you would know.

   **Open questions**
   - Only questions a human must answer. "None" is a valid answer.
   ```

5. Swap the labels: `gh issue edit <number> --remove-label agent-explore --add-label explored`. If the verdict is `needs-human`, also add `needs-human`; if it is `already-fixed`, also add `already-fixed`.

## Rules

- Every claim in the comment must point at a file path or a command output you actually ran.
- Use the vocabulary in `CONTEXT.md`; if the issue uses a term the glossary lacks, say so under open questions.
- Schema changes are Drizzle migrations (`db:generate` from the schema) that a person applies with `db:migrate`; an approach that needs one can still be `ready` for the code, but say that the apply is a person's step.
- Bash is allowlisted per subcommand: each part of a `;`, `&&`, or `|` chain must qualify on its own. Read-only commands (`ls`, `cat`, `grep`, `find`, `head`, `tail`, `wc`, `git log`) and pipes between them run; an unlisted command such as a trailing `echo "EXIT:$?"` or `gh auth status` is refused. An output redirect (`> /tmp/file`) is a file write, which this session cannot do, and a quoted `--body` whose lines start with `#` is rejected before it runs; post the comment from a here-doc instead, which is neither: `gh issue comment <number> --body-file - <<'EOF'` … `EOF`.
