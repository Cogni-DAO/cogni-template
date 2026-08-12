# Handoff: LangGraph ↔ knowledge-DAG memory gap (cross-analysis + queued submissions)

> Authored 2026-08-12 on branch `claude/langgraph-dolt-analysis-fvoqnn`, from a
> remote session whose egress policy **blocked cognidao.org and x.com** (CONNECT 403
> from the agent proxy). Agent registration and direct API submission were impossible,
> so the Dolt knowledge contribution and work items are queued here as ready-to-submit
> payloads. Run [`submit.sh`](./submit.sh) from any environment that can reach the node.

## Source material

The prompt pointed at `x.com/cyrilxbt/status/2087057424373182860` (posted ~2026-08-11
per snowflake timestamp). That exact status was unreachable (x.com + every mirror
egress-blocked; not yet search-indexed). The analysis is grounded in the same author's
two immediately-preceding threads in the same agent-memory series, whose full content
was recoverable via search:

- **[status/2082338580827873476](https://x.com/cyrilXBT/status/2082338580827873476)** — "graph
  engineering for multi-agentic systems": a knowledge graph makes agent memory permanent
  (vs dying with the context window). Pipeline: **extract → resolve → assemble → query →
  repeat** (extract entities/S-P-O triples; resolve/cluster aliases; assemble canonical
  nodes with typed edges + provenance; query = serialize a subgraph, answers cite edges).
  Used as _shared_ memory in multi-agent systems: workers write to it, evaluators
  fact-check against it, overnight loops persist with it. "The graph is the memory the
  context window pretends to be."
- **[status/2070091386482020852](https://x.com/cyrilXBT/status/2070091386482020852)** — the
  agent-memory loop: **Write → Consolidate → Recall → Apply**. Write: after every attempt
  record what was tried and what happened. Consolidate: distill attempts into reusable
  lessons, not transcripts. Recall: read lessons before the next task. Apply: skip
  known dead ends even on new problems.

If the target tweet materially differs from these, re-run the analysis before submitting.

## Cross-analysis: blueprint vs what we've built

Repo state verified at `3098f2a` (2026-08-12). Full stage-by-stage scorecard is in
[`knowledge-contribution.json`](./knowledge-contribution.json) (the durable artifact —
this section is the working narrative behind it).

**The headline: we already built the graph the blueprint says you need — and never
plugged our agents into it.** The repo is two disconnected halves:

1. **Data plane — ahead of the blueprint.** `knowledge` + `citations` is a real typed,
   directed graph (`packages/knowledge-base/src/schema.ts:142`): 9 edge types
   (`supports/contradicts/extends/supersedes/tracks` + EDO temporal edges), provenance
   and confidence on every row, Dolt-versioned with branch-based external contribution
   and per-commit principal attribution, plus a Temporal goal loop whose iteration
   history _is_ the citation chain. The tweet's "assemble" stage (canonical nodes,
   typed edges, provenance) is fully realized — with versioning the tweet doesn't even ask for.

2. **Agent runtime — "super primitive" is accurate, and unplugged.** 12 of 13 graphs
   in `packages/langgraph-graphs/src/graphs/` are a single `createReactAgent` call
   differing only in prompt + tool allowlist (the three `autoresearch-*` "multi-agent"
   graphs are the _same factory_ with different prompt strings — the Librarian/Judge/etc.
   structure is prose, not nodes). No checkpointer anywhere, no LangGraph `Store`,
   `stateKey` explicitly ignored InProc. Only `brain` + `autoresearch-*` (4/13) hold
   knowledge tools; **the `research` graph — our only real StateGraph and deepest
   reasoner — cannot read or write knowledge and discards everything at `final_report`.**
   RECALL*BEFORE_WRITE exists only as prompt text served to \_human-CLI* sessions via the
   cognition bundle (`_bundle.ts:35`); no graph enforces or executes it.

3. **The query seam is the thinnest.** Recall is flat text search
   (`core__knowledge_search` returns edge-less rows); the port offers only 1-hop
   `listCitationsBy*` (`knowledge-store.port.ts:209-214`); there is no multi-hop
   traversal, no subgraph serialization for agent reasoning, and the graph endpoint
   (`/api/v1/knowledge/graph`) returns 403 to Bearer agents. The DAG is written and
   rendered, never _traversed_ at recall time.

Mapping the blueprint's stages: **Assemble ✅ (ahead) · Write ~ (4/13 graphs, manual) ·
Recall ✗ (prompt-only, human plane) · Apply ✗ · Query/subgraph ✗ · Consolidate ✗
(skill discipline only) · Resolve/dedup ✗ (manual) · Extract — deliberately different
(curated atoms, not auto-triples; keep it that way, the syntropy bar is our moat).**

Strategic read: do **not** build a parallel memory system (no LangGraph Store, no
separate vector memory) — wire the graphs to the DAG we already have. That's the
cheapest path to the tweet's end state and it compounds the existing hub instead of
fragmenting memory across substrates.

## Queued submissions

| File                          | What                                                                                           | How to submit                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `knowledge-contribution.json` | 1 `scorecard` entry, domain `infrastructure`                                                   | `./submit.sh --submit` (handles create-vs-append per the one-open-contribution rule) |
| `work-item-0.story.json`      | **P0 story** — wire LangGraph agents into the knowledge DAG                                    | same script; story created first                                                     |
| `work-item-1.task.json`       | **P0 task** — recall step in the graph runtime (top-k merged atoms injected at run start)      | child of story (script sets `parentId`)                                              |
| `work-item-2.task.json`       | **P1 task** — research-graph write-back at `final_report`                                      | child of story                                                                       |
| `work-item-3.task.json`       | **P2 task** — edge-aware recall: citations on search results + bounded multi-hop subgraph read | child of story                                                                       |

`submit.sh` defaults to **dry-run** (registers/reuses one key, performs mandatory
RECALL — domains, hub search, open-contribution diff — and prints what it _would_
post). Re-run with `--submit` after eyeballing the recall output; if recall surfaces
an existing entry covering this ground, **refine that entry instead** (edit the
payload to an `op: update` with its `targetRowId`) per `contribute-knowledge-to-cogni`.

After the contribution merges to `main`, link the story with a `tracks` citation
(the script prints the exact command — `tracks` requires the knowledge id to be merged).

## Post-submit cleanup

This directory is a queue, not a durable home. Once the contribution + work items are
live, delete the directory (the knowledge entry and Doltgres rows are the durable
artifacts; this handoff can go to `work/handoffs/archive/` if the narrative is worth keeping).
