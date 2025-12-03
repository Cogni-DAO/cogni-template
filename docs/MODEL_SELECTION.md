# Model Selection

## Overview

Users can select their preferred AI model via a dropdown in the chat composer. The selection persists in localStorage and is validated server-side on every request.

## Core Workflow

1. **Client**: Fetches available models from `GET /api/v1/ai/models` (auth-required, cached)
2. **UI**: Displays ModelPicker dialog with search, icons, and free/paid labels
3. **Persistence**: Saves selection to localStorage (`cogni.chat.preferredModelId`)
4. **Request**: Chat sends `model` field (REQUIRED) as `selectedModel ?? defaultModelId`
5. **Validation**: Server checks model against cached allowlist (5min TTL)
6. **Fallback**: Invalid model returns 409 + defaultModelId, client auto-retries once

## Key Files

**API Layer**:

- `src/contracts/ai.models.v1.contract.ts` - Models list contract (includes `isFree`, `defaultModelId`)
- `src/app/api/v1/ai/models/route.ts` - Models endpoint (auth-protected)
- `src/app/_lib/models-cache.ts` - Server cache with SWR (currently hardcoded, TODO: fetch from LiteLLM)
- `src/contracts/ai.chat.v1.contract.ts:58` - Chat contract with REQUIRED `model` field

**UI Layer**:

- `src/features/ai/public.ts` - Feature barrel (stable import surface)
- `src/features/ai/components/ModelPicker.tsx` - Dialog+ScrollArea picker UI
- `src/features/ai/components/ChatComposerExtras.tsx` - Composer toolbar integration
- `src/components/kit/chat/Thread.tsx` - Slot-based wrapper (`composerLeft` prop)
- `src/app/(app)/chat/page.tsx:59-89` - State management

## Endpoints

- `GET /api/v1/ai/models` → `{ models: Model[], defaultModelId: string }`
- `POST /api/v1/ai/chat` → Accepts `model: string` (required), returns 409 if invalid
