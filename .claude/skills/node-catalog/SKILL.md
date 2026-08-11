---
name: node-catalog
description: >
  The node roster + operator-governance reference for devs working IN this repo. Use to answer "what
  nodes exist / are they online / what are their URLs", "who owns a node and what can the operator do
  to it", "how do I address a node (id vs slug)", or "which parts are the node's vs the operator's".
  This is the where-to-look map, NOT a doer — for actions route to deploy-node / node-wizard-expert /
  promote / manage-node-envs. Triggers: "list the nodes", "node roster", "node URLs", "is <node> live",
  "operator's role over nodes", "node ownership / permissions", "who can flight/promote/secrets a node".
---

# node-catalog — the node roster + operator-governance map

> **First recall the hub.** The durable, always-fresh version is the operator knowledge hub entry
> `operator-node-catalog` (`GET https://cognidao.org/api/v1/knowledge/operator-node-catalog`). Live
> roster + per-env liveness DRIFT — never trust a hardcoded list (blue/oss/habitat proved this). This
> file is the in-repo pointer; refine the hub entry when the model changes, not this file.

## 1 · The active node roster is LIVE STATE — read it, don't hardcode

Three sources, in order of truth:

| Want | Source |
| --- | --- |
| **Live registry** (who's registered + owner, per env) | `GET /api/v1/nodes` (owner-scoped Bearer) — the Postgres `nodes` table SSOT. Per-env deploy status: `GET /api/v1/nodes/{id}/deploy-state` (`developer` grant). |
| **Git-declared shape** (in-repo nodes) | `infra/catalog/*.yaml` `type:node` — `CATALOG_IS_SSOT` (Axiom 16). Today: **operator, node-template, beacon, poly**. (`litellm`/`openfga` = `type:infra`; `scheduler-worker` = service — NOT nodes.) |
| **Is it actually serving** | `curl -s https://<host>/version` from OUTSIDE the cluster — `buildSha`, not workflow-green (per `/promote`). |

**URL derivation** (`verify-buildsha.sh` hostname rule): operator = the bare env domain; every other node = `<node>-<envprefix>.<base>`.
- prod: `cognidao.org` (operator) · `<node>.cognidao.org`
- preview: `preview.cognidao.org` · `<node>-preview.cognidao.org`
- candidate-a: `test.cognidao.org` · `<node>-test.cognidao.org`

**External submodule nodes** (e.g. blue, oss, habitat) are NOT in the in-repo catalog — they live in their own forked repos and carry their own repo-spec `node_id`. They appear in the registry (`GET /api/v1/nodes`) but not `infra/catalog/`. If a node isn't in the catalog and isn't serving, it's an external node's own deploy, not an in-repo gap.

## 2 · Operator's role over nodes — "node declares shape; operator wires environment"

The load-bearing invariant ([`node-baas-architecture.md`](../../../docs/spec/node-baas-architecture.md) §"node declares shape; operator wires environment"):

| The NODE owns (you edit in the node repo) | The OPERATOR owns (the deploy plane) |
| --- | --- |
| app code, packages, base manifests, image build, local policy, declarations (`repo-spec.yaml`, DB schema, `secrets-catalog.yaml`) | catalog rows, per-env overlays/AppSets, provisioning, DNS, **flight + promotion**, secret **values**, env ownership |

**Identity SSOT is one value everywhere:** repo-spec `node_id` = `nodes.id` = OpenFGA `node:<id>` = Loki `node` label. Address a node by that `node_id` (slug also resolves on most routes). Operator is a **uniform node** — it is addressed by its own `nodeId` on flight/merge/promote just like any node.

## 3 · What the operator CAN do to a node — and its limits (all OpenFGA-gated)

The `OPERATOR_PLANE_CONTRACT` ([`cicd-platform-boundary.md`](../../../docs/spec/cicd-platform-boundary.md) §"typed operator control plane"): every control-plane write is `(node_id, env)`-scoped, resolves the node once via the registry, gates OpenFGA `node:<id>`, executes with the **operator's own** in-cluster identity, and the caller holds **only an API key** (no kube/vault/deploy cred).

| Action | Endpoint | Relation (role) |
| --- | --- | --- |
| Flight → candidate-a | `POST /api/v1/vcs/flight` | `node.flight` (`developer`) |
| Merge a node PR (on green) | `POST /api/v1/vcs/merge` | `node.flight` |
| Promote → production | `POST /api/v1/deploy/promote` | `node.promote_production` (`production_promoter`; `admin` inherits) |
| Write/rotate a node secret VALUE | `POST /api/v1/nodes/{id}/secrets` | `node.manage_secrets` (`secrets_manager`) |
| Read deploy-state / logs | `GET /api/v1/nodes/{id}/{deploy-state,observability/logs}` | `developer` |

**Roles:** `owner` (the governance-approver wallet from repo-spec — RLS-owns the row, approves access-requests) → `developer` / `production_promoter` / `secrets_manager` (granted per-node via `POST /api/v1/nodes/{id}/access-requests` → owner approves at `POST /api/v1/nodes/{id}/developers`). Fail-closed: **403 `authz_denied`** = no grant; **503 `authz_unavailable`** = that env's OpenFGA store isn't bootstrapped (≠ denial).

**Hard limits — what the operator does NOT do:**
- It is the **deploy plane only** — code, work-items, and knowledge do **not** live here (node repo + work API + Dolt hub do).
- It does **not** edit a node's app code or run/freeze a node's **own** CI — external/standalone nodes keep their own GitHub Actions (`FORK_FREEDOM`; the platform freeze applies only to the operator control plane).
- It cannot promote/secret a node it can't **resolve in that env's registry** (empty registry → `node_not_found`; seed it first — see the registry-reseed history).

## Canon (verify against these, don't restate them)

- [`node-baas-architecture.md`](../../../docs/spec/node-baas-architecture.md) — node-vs-operator ownership split, the substrate table
- [`cicd-platform-boundary.md`](../../../docs/spec/cicd-platform-boundary.md) — `OPERATOR_PLANE_CONTRACT`, the freeze, node sovereignty
- [`rbac-expert`](../rbac-expert/SKILL.md) — OpenFGA relations, the access-request → approve → grant loop
- [`/promote`](../promote/SKILL.md) · [`node-wizard-expert`](../node-wizard-expert/SKILL.md) · [`deploy-node`](../deploy-node/SKILL.md) — the DOERS
- `infra/catalog/*.yaml` · `nodes/operator/app/src/app/api/v1/nodes/route.ts` — live SSOT, verify claims against code
