#!/usr/bin/env bash
# Merge a release-pipeline PR once GitHub's branch policy really allows it.
#
# Usage: scripts/merge-when-ready.sh <pr-number> <head-sha> <commit-subject>
# Env:   GH_TOKEN, REPO (owner/name); MERGE_WAIT_SECONDS (default 900), MERGE_POLL_SECONDS (default 20)
#
# Why: `mergeable` only says "no conflicts". The required `quality-gates` check can still be
# pending on the same head — e.g. the PR's own `pull_request` CI run is still going after
# release.yml reported its verified result — and then `gh pr merge` fails with "the base
# branch policy prohibits the merge" (release runs 36332133694, 36252255527, 36249900562).
# So poll `mergeStateStatus` until it is mergeable, fail fast on conflicts, and fail with an
# actionable message if the policy still blocks after the wait.
set -euo pipefail

PR=${1:?pr number}
SHA=${2:?head sha}
SUBJECT=${3:?commit subject}
: "${REPO:?REPO=owner/name}"
WAIT=${MERGE_WAIT_SECONDS:-900}
POLL=${MERGE_POLL_SECONDS:-20}

deadline=$(( $(date +%s) + WAIT ))
state=UNKNOWN
while :; do
  state=$(gh pr view "$PR" --repo "$REPO" --json mergeStateStatus --jq .mergeStateStatus)
  case "$state" in
    CLEAN|HAS_HOOKS|UNSTABLE) break ;;
    DIRTY)
      echo "::error title=Merge needs a human::PR #$PR has merge conflicts — resolve them on its branch and merge it."
      exit 1 ;;
    BEHIND)
      echo "::error title=Merge needs a human::PR #$PR is behind its base and the branch requires it to be up to date."
      exit 1 ;;
  esac
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error title=Merge blocked::PR #$PR is still $state after ${WAIT}s — a required check failed or never reported; see the PR checks."
    exit 1
  fi
  echo "PR #$PR is $state — waiting ${POLL}s for the required checks"
  sleep "$POLL"
done

gh pr merge "$PR" --repo "$REPO" --merge --match-head-commit "$SHA" --subject "$SUBJECT"
echo "::notice title=Merged::#$PR ($state)"
