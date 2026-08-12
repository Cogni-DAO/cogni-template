#!/usr/bin/env bash
# Submit the langgraph-knowledge-memory-gap knowledge contribution + work items.
#
# Authored 2026-08-12 from an egress-blocked remote session (cognidao.org
# unreachable — CONNECT 403). Run this from any environment that can reach the
# node. Follows the contribute-knowledge-to-cogni contract: one principal, one
# open contribution (create once, append via /commits), RECALL before write.
#
# Usage:
#   ./submit.sh              # dry run: bootstrap key + RECALL only, print plan
#   ./submit.sh --submit     # actually post contribution + work items
set -euo pipefail

BASE="${COGNI_BASE:-https://cognidao.org}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR/../../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.cogni"
MODE="${1:---dry-run}"

need() { command -v "$1" >/dev/null || { echo "missing dependency: $1" >&2; exit 1; }; }
need curl; need jq

# ── 1. One principal: reuse saved key, register only if absent ────────────────
KEY="$(grep -E '^COGNI_NODE_API_KEY=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)"
if [ -z "$KEY" ]; then
  echo "no COGNI_NODE_API_KEY in $ENV_FILE — registering one agent principal..."
  KEY="$(curl -fsS -X POST "$BASE/api/v1/agent/register" \
    -H 'content-type: application/json' \
    -d '{"name":"langgraph-dolt-analysis-agent"}' | jq -r .apiKey)"
  [ -n "$KEY" ] && [ "$KEY" != "null" ] || { echo "registration failed" >&2; exit 1; }
  printf 'COGNI_NODE_API_KEY=%s\n' "$KEY" >> "$ENV_FILE"
  echo "registered and saved to $ENV_FILE"
fi
AUTH=(-H "Authorization: Bearer $KEY")

api() { curl -fsS "${AUTH[@]}" "$@"; }

# ── 2. RECALL (mandatory) — merged plane + own open branch ───────────────────
echo "── domains ──"
api "$BASE/api/v1/knowledge/domains" | jq -r '.domains[]?.id // .[]?.id // empty' || true

echo "── merged-plane recall: existing entries near this claim ──"
for q in "langgraph memory" "agent memory" "knowledge recall" "graph gap"; do
  echo "· search: $q"
  api "$BASE/api/v1/knowledge?mode=browse&text=$(jq -rn --arg q "$q" '$q|@uri')" \
    | jq -r '.entries[]? | "  \(.id): \(.title)"' || true
done

echo "── own open contribution branch ──"
CID="$(api "$BASE/api/v1/knowledge/contributions?state=open&limit=20" \
  | jq -r '.contributions[0].contributionId // empty')"
if [ -n "$CID" ]; then
  echo "open contribution: $CID — entries already on its branch:"
  api "$BASE/api/v1/knowledge/contributions/$CID/diff" \
    | jq -r '.entries[]? | "  \(.rowId): \((.after // .before).title)"' || true
else
  echo "none open — first write will create the branch"
fi

if [ "$MODE" != "--submit" ]; then
  cat <<EOF

DRY RUN — nothing posted. Review the recall output above:
 * If an existing entry already covers this ground, EDIT
   knowledge-contribution.json to an {op:"update", targetRowId:...} refinement
   instead of the insert (refine-over-fork).
 * If the 'infrastructure' domain is missing above, pick the closest existing
   domain (fallback: meta) in knowledge-contribution.json.
Then re-run: $0 --submit
EOF
  exit 0
fi

# ── 3. Knowledge contribution: create ONCE or append via /commits ────────────
if [ -n "$CID" ]; then
  echo "appending to open contribution $CID via /commits (never re-POST /contributions)"
  api -X POST "$BASE/api/v1/knowledge/contributions/$CID/commits" \
    -H 'content-type: application/json' \
    --data-binary @"$DIR/knowledge-contribution.json" | jq .
else
  CID="$(api -X POST "$BASE/api/v1/knowledge/contributions" \
    -H 'content-type: application/json' \
    --data-binary @"$DIR/knowledge-contribution.json" | jq -r .contributionId)"
  echo "created contribution: $CID"
fi

# ── 4. Work items: story first, then children with parentId ──────────────────
STORY_ID="$(api -X POST "$BASE/api/v1/work/items" \
  -H 'content-type: application/json' \
  --data-binary @"$DIR/work-item-0.story.json" | jq -r .id)"
echo "created story: $STORY_ID"

for f in "$DIR"/work-item-[123].task.json; do
  TID="$(jq --arg p "$STORY_ID" '. + {parentId: $p}' "$f" \
    | api -X POST "$BASE/api/v1/work/items" \
        -H 'content-type: application/json' --data-binary @- | jq -r .id)"
  echo "created task: $TID (parent $STORY_ID) ← $(basename "$f")"
done

# ── 5. Follow-up: tracks edge needs the knowledge id MERGED to main ──────────
cat <<EOF

SUBMITTED. After contribution $CID merges to main, link story↔knowledge:

  curl -sS -X POST "$BASE/api/v1/knowledge/contributions/\$OPEN_CID/commits" \\
    -H "Authorization: Bearer \$KEY" -H "content-type: application/json" \\
    -d '{"message":"link $STORY_ID to gap scorecard",
         "edits":[{"op":"cite","citingId":"'"$STORY_ID"'",
                   "citedId":"langgraph-knowledge-memory-gap",
                   "citationType":"tracks",
                   "context":"story implements the runtime wiring this scorecard identifies"}]}'

Then delete this handoff directory (the Doltgres rows are the durable artifacts).
EOF
