#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO
#
# Applies Cogni's slice of Argo CD's core `argocd-cm` as an ADDITIVE JSON merge
# patch. This file is sourced; callers own shell options and error handling
# (the function returns non-zero, it never exits).
#
# ONE writer, TWO callers — cold start (provision-env-vm.sh Phase 5b.1) and day
# two (reconcile-env-substrate.sh, the script `provision-env.yml
# mode=substrate-only` runs). Sharing the block is what lets a live wedged
# environment be repaired through the audited workflow with no re-provision.
#
# NEVER `kubectl apply` this: `argocd-cm` is Argo's OWN config object. A
# whole-object write replaces `metadata.labels`, dropping the
# `app.kubernetes.io/part-of: argocd` label that Argo's informer selector
# matches on — the object goes invisible to every Argo controller and the entire
# fleet falls to SYNC=Unknown (bug.5095). `--type merge` restores the labels and
# sets the data keys without touching anything else.
#
# Usage: apply_argocd_cm_runtime_patch <repo_root> <vm_ip> <ssh_opts>

apply_argocd_cm_runtime_patch() {
  local repo_root="$1" vm_ip="$2" ssh_opts="$3"
  local patch_file="$repo_root/infra/k8s/argocd/argocd-cm-runtime-patch.yaml"
  local remote_file=/tmp/argocd-cm-runtime-patch.yaml

  if [[ ! -r "$patch_file" ]]; then
    echo "argocd-cm merge patch body not readable: $patch_file" >&2
    return 1
  fi

  # shellcheck disable=SC2086  # ssh_opts is an intentional word-split option string
  scp $ssh_opts "$patch_file" "root@${vm_ip}:${remote_file}" || return 1
  # shellcheck disable=SC2086
  ssh $ssh_opts "root@${vm_ip}" "
    kubectl -n argocd patch cm argocd-cm --type merge --patch-file ${remote_file} &&
    rm -f ${remote_file} &&
    kubectl -n argocd rollout restart deployment argocd-repo-server &&
    kubectl -n argocd rollout status deployment argocd-repo-server --timeout=120s
  " || return 1
}
