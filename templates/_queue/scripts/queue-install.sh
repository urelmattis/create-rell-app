#!/usr/bin/env bash
# One-time GitHub setup for the AFK agent queue that create-rell-app scaffolds:
# labels, the repository's merge settings, branch protection on main, and the
# two things only you can add (the Claude GitHub App and the OAuth token).
# Idempotent: run it again after changing anything, it only fixes drift.
#
#   bash scripts/queue-install.sh            # after `gh repo create` and the first push
#
# Requires the GitHub CLI (`gh`) logged in with admin on this repository.
set -euo pipefail

command -v gh >/dev/null || { echo "gh (GitHub CLI) is required: https://cli.github.com" >&2; exit 1; }
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || {
  echo "not inside a GitHub repository: create one first (gh repo create --source . --private --push)" >&2; exit 1; }
default=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
echo "repository: $repo (default branch: $default)"

# --- Labels the queue moves issues and pull requests through -----------------
label() { # name color description
  if gh label list --limit 200 --json name --jq '.[].name' | grep -qx "$1"; then
    gh label edit "$1" --color "$2" --description "$3" >/dev/null
  else
    gh label create "$1" --color "$2" --description "$3" >/dev/null
  fi
  echo "  label $1"
}
label needs-triage      FBCA04 "Not yet triaged: a person decides the next label"
label needs-info        D4C5F9 "Waiting on the reporter for more information"
label needs-human       D93F0B "Blocked on a human decision, credential, or step"
label wontfix           FFFFFF "Will not be worked on"
label story             0E8A16 "A single implementable unit of work"
label epic              5319E7 "A body of work with child story issues"
label agent-explore     1D76DB "Queue: an agent explores the issue and posts a verdict (no code changes)"
label explored          0052CC "An agent has posted its exploration verdict"
label already-fixed     BFD4F2 "Exploration found the code already does what the issue asks"
label agent-implement   C2E0C6 "Queue: an agent implements this on a branch and opens a PR"
label agent-pr          BFD4F2 "A pull request opened by an agent"
label review-ready      0E8A16 "The queue's reviewer said ready to merge; CI decides the rest"
label re-review         FBCA04 "Ask the review workflow for another pass on this PR"
label review-addressed  C2E0C6 "The first address-the-review round has run on this PR"
label review-addressed-2 C2E0C6 "The second address-the-review round has run on this PR; the next verdict is a person's"
label conflict-round    C2E0C6 "One merge-main round has run on this PR; the next conflict with main is a person's"
label security          B60205 "A finding from the scheduled security review"

# --- Merge settings the queue relies on --------------------------------------
gh api -X PATCH "repos/$repo" \
  -F allow_auto_merge=true \
  -F allow_squash_merge=true \
  -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY >/dev/null
echo "  auto-merge on, squash with the PR title and body, branches deleted on merge"

# --- Branch protection: the required checks are the CI job names -------------
# Strict up-to-date is OFF on purpose: a CI run dispatched on a branch is not
# attached to its pull request, so requiring up-to-date branches would force a
# person to rebase and re-run every time main moves.
gh api -X PUT "repos/$repo/branches/$default/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["check", "security-scan"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
echo "  branch protection on $default: required checks check + security-scan, strict off"

# --- What only you can do ----------------------------------------------------
echo
echo "Two steps remain, both yours:"
echo "  1. Install the Claude GitHub App on this repository: https://github.com/apps/claude"
echo "     (the workflows exchange an OIDC token for the app's token; without the app they refuse to run)"
if gh secret list --json name --jq '.[].name' | grep -qx CLAUDE_CODE_OAUTH_TOKEN; then
  echo "  2. CLAUDE_CODE_OAUTH_TOKEN is already set as a repository secret."
else
  echo "  2. Add your Claude Code OAuth token as a repository secret (it bills your subscription, not an API key):"
  echo "       claude setup-token            # prints a token"
  echo "       gh secret set CLAUDE_CODE_OAUTH_TOKEN   # paste it when asked"
  echo "     An organisation-level secret works too, and covers every repository that uses this queue."
fi
echo
echo "Then file an issue. Explore posts a verdict within minutes; docs/agents/triage-labels.md says what happens next."
