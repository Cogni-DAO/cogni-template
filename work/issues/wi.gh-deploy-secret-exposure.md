---
work_item_id: wi.gh-deploy-secret-exposure
work_item_type: issue
title: "P0 SECURITY: Deploy artifacts expose all secrets"
state: In Progress
priority: 0
estimate: 2
summary: Deploy workflow uploads secrets as GitHub Actions artifact, exposing all production credentials
outcome: Secrets rotated, deploy script fixed to exclude secrets from artifacts
assignees: derek
initiative: ini.docs-system-infrastructure
created: 2026-02-06
updated: 2026-02-06
labels: [security, p0, secrets, ci]
pr:
external_refs:
---

## Execution Checklist

- [ ] Rotate ALL secrets for preview and production environments
- [ ] Fix `platform/ci/scripts/deploy.sh` — don't upload secrets file as artifact (create in /tmp or exclude from artifact upload)
- [ ] Audit artifact retention, delete any existing artifacts containing secrets

**Impact:** CRITICAL — all secrets compromised and must be rotated (DB passwords, API keys, auth secrets, GitHub tokens, Grafana creds, Langfuse keys, EVM RPC URL).

**Root Cause:** `platform/ci/scripts/deploy.sh` line 784-838 creates `deploy-secrets.env` in `$ARTIFACT_DIR`, which gets uploaded as workflow artifact.

**Files:**

- `platform/ci/scripts/deploy.sh` - Creates secrets file in artifact dir
- `.github/workflows/staging-preview.yml` - Uploads artifacts
- `.github/workflows/deploy-production.yml` - Uploads artifacts

## Validation

**Command:**

```bash
# After fix: verify no secrets in artifact directory
ls $ARTIFACT_DIR | grep -v secrets
```

**Expected:** No `deploy-secrets.env` in uploaded artifacts.
