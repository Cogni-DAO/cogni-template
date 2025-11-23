# Coding agents & AGENTS.md

Goal: keep one canonical set of rules (`AGENTS.md` per directory) and wire every agent to it without blowing the context window.

Reality:

- **Codex**: native AGENTS.md hierarchy (gold standard), dynamically loading subdirs.
- **Gemini CLI + Antigravity**: default to `GEMINI.md`, configurable to use `AGENTS.md`, but only bulk loads ALL files at boot.
- **Claude Code**: only uses `CLAUDE.md`, dynamically loading subdirs.
- **Cursor**: reads `AGENTS.md` natively and `.cursor/commands`.

## OpenAI Codex (CLI + IDE)

- Context: `AGENTS.md` (+ `AGENTS.override.md`).
- Load order:
  1. `~/.codex/AGENTS.md` (or `AGENTS.override.md`) – global.
  2. Repo root → current dir: nearest `AGENTS.override.md` else `AGENTS.md`.
- Config / MCP: `~/.codex/config.toml`.
  -Commands: `~/.codex/prompts/*.md`.

## Gemini CLI

- Settings: `~/.gemini/settings.json` (user), `.gemini/settings.json` (project).
- Set AGENTS as context:
  - `"contextFileName": "AGENTS.md"`.
  - Optional: `"context": { "discoveryMaxDirs": N }` to cap scans.
- Memory hierarchy: `~/.gemini/AGENTS.md` + project root + ancestor + selected subdirs.
- Slash commands: `.gemini/commands/*.toml` → `/command-name`.

## Antigravity IDE

- Project config directory: `.agent/` at repo root.
  - Context: `.agent/GEMINI.md` (can just say “@read AGENTS.md for rules”).
  - Workflows: `.agent/workflows/*.md` (YAML front-matter + markdown body).
  - Rules: `.agent/rules/*.md` for persistent traits that should always apply.

## Claude Code

- Context: `CLAUDE.md` in `~/.claude`, project root, and subdirs (hierarchical + on-demand).
- Bridge to AGENTS:
  - Root `CLAUDE.md`: `@./AGENTS.md` as the primary rules source.
  - Optional subdir `CLAUDE.md`: local notes + `@../AGENTS.md` or `@./AGENTS.md`.
- Commands: `.claude/commands/*.md` → `/command-name`.

## Cursor

- Context: AGENTS.md is supported directly; keep `AGENTS.md` per directory as the source of truth.
- Commands: `.cursor/commands/*.md` → `/command-name`.
- Keep any Cursor-specific rules minimal and point back to AGENTS.md instead of duplicating policy.

## How we should use them

- **Single source of truth**: `AGENTS.md` in each directory; no duplicated rules elsewhere.
- **Bridges only**:
  - Gemini: `contextFileName = "AGENTS.md"` + tuned `discoveryMaxDirs`.
  - Antigravity: `.agent/GEMINI.md` + workflows that explicitly reference AGENTS.md.
  - Claude / Cursor: CLAUDE.md and command files that _reference_ AGENTS.md, not copy it.
