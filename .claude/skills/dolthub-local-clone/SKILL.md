---
name: dolthub-local-clone
description: Clone a Cogni knowledge repo from DoltHub and read it locally, WITHOUT the operator/node being live. Use when you need to recover, audit, diff, or read a node's knowledge hub straight from its DoltHub mirror (`cogni-dao/<slug>`) — e.g. operator is down, you're validating a `dolt_push` landed, bootstrapping a fork, or doing offline knowledge archaeology. Triggers: "clone our dolthub", "read the knowledge repo locally", "recover the hub", "verify the push", "dolt clone fails with 'table has unknown fields'", "doltgres clone".
---

# dolthub-local-clone

Read any Cogni knowledge hub directly from its DoltHub mirror, independent of any running node. Our hubs are **Doltgres** (Postgres-wire Dolt), so the plain `dolt` CLI cannot read them — use the `doltgresql` engine.

## The one rule that trips everyone

Our knowledge repos are stored in **Doltgres format**. The classic `dolt` CLI clone downloads the chunks fine, then fails:

```
could not find root value: main; table has unknown fields
```

**This is NOT corruption** — it is the Dolt engine being unable to walk a Doltgres root. (The *same* message from DoltHub's **web-SQL runner** DOES mean a corrupted repo — the signal differs by tool. A **healthy** repo's web-SQL returns `doltgres data is not supported`.) To actually read the data, clone with **Doltgres**, not Dolt.

## Recipe (proven, copy-paste)

Prereq: Docker. For a **public** repo, no creds needed to read. For **private** or to push, you need a DoltHub cred keypair registered on DoltHub and mounted (`~/.dolt/creds/<keyid>.jwk` + `~/.dolt/config_global.json` with `user.creds`).

```bash
REPO=cogni-dao/operator          # <owner>/<slug> — the derived mirror name (no "knowledge-" prefix)

# 1. Start a throwaway Doltgres engine (same image the nodes run). Mount ~/.dolt only if you need creds.
docker run -d --name hub-read -p 5433:5432 \
  -e DOLTGRES_PASSWORD=readpw \
  -v "$HOME/.dolt:/root/.dolt:ro" \
  dolthub/doltgresql:0.57.3
sleep 8

# helper: run SQL against a db in that engine (uses a postgres client container)
Q(){ docker run --rm --link hub-read -e PGPASSWORD=readpw postgres:16 \
       psql -w "postgresql://doltgres@hub-read:5432/$1?sslmode=disable" -tAc "$2"; }

# 2. Clone — SELECT, not CALL (Doltgres runs stored procedures via SELECT).
Q doltgres "SELECT DOLT_CLONE('$REPO');"        # creates a db named after the repo (e.g. "operator")

# 3. Read it. The knowledge tables: knowledge, domains, citations, work_items, sources,
#    knowledge_contributions, knowledge_contribution_commits.
Q operator "SELECT id, title FROM knowledge ORDER BY updated_at DESC LIMIT 20;"
Q operator "SELECT content FROM knowledge WHERE id='operator-agent-orientation';"
Q operator "SELECT LEFT(commit_hash,10), message FROM dolt_log ORDER BY date DESC LIMIT 10;"

# 4. Clean up
docker rm -f hub-read
```

## Health / triage in one call (no clone needed)

```bash
curl -s "https://www.dolthub.com/api/v1alpha1/cogni-dao/operator/main" | jq -r .query_execution_message
```

| Response | Meaning |
| --- | --- |
| `doltgres data is not supported` | ✅ **Healthy** — valid Doltgres data is present; clone it with the recipe above |
| `table has unknown fields` (from **web-SQL**) | 🔴 **Corrupted** repo — a chunk is missing/unwalkable |
| `branch not found` / `no such repository` | Empty or nonexistent repo — nothing pushed yet |

Note the asymmetry: `table has unknown fields` from the **`dolt` CLI clone** = healthy-but-wrong-tool; from **web-SQL** = corrupted. Same string, opposite meaning.

## Notes

- **Repo naming.** The mirror is `<owner>/<slug>` — derived from `DOLTHUB_OWNER` + the node slug (no `knowledge-` prefix). Prod owner is `cogni-dao`; non-prod envs use a non-prod org. So operator's prod hub is `cogni-dao/operator`, poly's is `cogni-dao/poly`, etc.
- **Independent of the node.** This reads straight from DoltHub — the operator/node app does not need to be running. That is the point: the DoltHub mirror is the recoverable copy.
- **Version.** Pin the engine to the version the fleet runs (`dolthub/doltgresql:0.57.3` today; check `infra/compose/runtime/docker-compose.yml`). A newer engine reads older data; avoid an older engine on newer data.
- **Push-back / write** is a separate, credentialed operation and is intentionally out of scope here — this skill is read/recover only.
