#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# GitHub HTTPS clone helpers.
#
# The remote URL is always credential-free. When GH_TOKEN is non-empty, git
# delegates credential lookup to `gh auth git-credential`; when it is empty,
# public repositories clone anonymously. Keeping the token out of the URL also
# keeps it out of git's error messages and the persisted origin remote.

github_repo_path() {
  local repo="${1:-}"
  repo="${repo#https://github.com/}"
  repo="${repo%.git}"

  if ! [[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    echo "::error::Invalid GitHub repository: expected owner/repo or https://github.com/owner/repo.git" >&2
    return 1
  fi

  printf '%s\n' "$repo"
}

github_https_url() {
  local repo_path
  repo_path="$(github_repo_path "${1:-}")" || return 1
  printf 'https://github.com/%s.git\n' "$repo_path"
}

github_git() {
  local restore_xtrace=false
  case "$-" in
    *x*)
      restore_xtrace=true
      set +x
      ;;
  esac

  local rc=0
  if [ "${GH_TOKEN:+set}" = set ]; then
    GH_TOKEN="$GH_TOKEN" GIT_TERMINAL_PROMPT=0 git \
      -c credential.https://github.com.helper= \
      -c credential.https://github.com.helper='!gh auth git-credential' \
      "$@" || rc=$?
  else
    GIT_TERMINAL_PROMPT=0 git "$@" || rc=$?
  fi

  if [ "$restore_xtrace" = true ]; then
    set -x
  fi
  return "$rc"
}

github_clone_repo() {
  local repo_url destination
  repo_url="$(github_https_url "${1:-}")" || return 1
  destination="${2:-}"
  [ -n "$destination" ] || {
    echo "::error::github_clone_repo requires a destination" >&2
    return 1
  }

  github_git clone "$repo_url" "$destination"

  # A deploy-branch clone is pushed in a later workflow step. Persist only the
  # credential-helper command, never the credential; that later step supplies
  # GH_TOKEN again.
  if [ "${GH_TOKEN:+set}" = set ]; then
    git -C "$destination" config --local credential.https://github.com.helper ""
    git -C "$destination" config --local --add \
      credential.https://github.com.helper '!gh auth git-credential'
  fi
}

github_materialize_commit() {
  local repo_url source_sha destination
  repo_url="$(github_https_url "${1:-}")" || return 1
  source_sha="${2:-}"
  destination="${3:-}"

  if ! [[ "$source_sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "::error::github_materialize_commit requires a 40-character commit SHA" >&2
    return 1
  fi
  [ -n "$destination" ] || {
    echo "::error::github_materialize_commit requires a destination" >&2
    return 1
  }

  git init -q "$destination"
  git -C "$destination" remote add origin "$repo_url"
  github_git -C "$destination" fetch -q --depth 1 origin "$source_sha"
  git -C "$destination" checkout -q --detach FETCH_HEAD
}
