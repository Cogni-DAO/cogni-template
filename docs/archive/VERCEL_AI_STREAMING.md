# AI SDK Streaming Migration

## Current State

- Custom SSE streaming implementation in `src/app/api/v1/ai/chat/route.ts`
- Custom client SSE reader in `ChatRuntimeProvider.client.tsx`
- Already using assistant-ui for chat UI components

## Future Migration (Post-MVP)

Replace custom streaming with AI SDK v5 stream protocol for better reliability.

### Changes

**Server (API Route)**

- Emit AI SDK-compatible SSE format instead of custom protocol
- Use AI SDK stream helpers for keepalive/reconnect

**Client**

- Use `@assistant-ui/react-ai-sdk` integration
- Remove manual SSE reader and delta accumulation

**Unchanged**

- Ports/features/facades: `completionStream()` stays internal
- LiteLLM adapter: Provider routing, virtual keys, cost extraction
- Billing logic: Atomic cost tracking unchanged

### Constraints

- AI SDK is transport layer only
- No domain refactoring around AI SDK
- No AI SDK 6 beta during MVP

### Resources

- [ai-sdk.dev](https://ai-sdk.dev)
- [assistant-ui AI SDK integration](https://docs.assistant-ui.com)
