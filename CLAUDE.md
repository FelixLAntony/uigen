# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# First-time setup
npm run setup          # npm install + prisma generate + prisma migrate dev

# Development
npm run dev            # Next.js with Turbopack (uses node-compat.cjs polyfill)

# Build & production
npm run build
npm start

# Database
npx prisma generate    # Regenerate client after schema changes
npx prisma migrate dev # Apply new migrations
npm run db:reset       # Drop and recreate database (destructive)

# Lint & test
npm run lint           # next lint
npm test               # vitest (watch mode)
npx vitest run         # single test pass
npx vitest run src/path/to/file.test.ts  # single file
```

**Environment variables** (`.env`):
- `ANTHROPIC_API_KEY` — if absent, falls back to a mock provider that generates static components
- `JWT_SECRET` — defaults to `"development-secret-key"`; must be set for production

## Architecture

### Data flow

```
User types → ChatContext.handleSubmit
           → POST /api/chat  (streams Claude response)
           → Claude returns text + tool calls
           → FileSystemContext.handleToolCall mutates virtual FS
           → PreviewFrame re-renders: JSX → Babel transform → iframe
           → If authenticated: history + FS persisted to SQLite via Prisma
```

### Core contexts

Two providers wrap the whole app (`main-content.tsx`):

- **`FileSystemContext`** (`src/lib/contexts/FileSystemContext.tsx`) — in-memory virtual file system with create/read/update/delete/rename. Serialized to JSON for database persistence. Exposes `handleToolCall` so AI tool results mutate it directly.
- **`ChatContext`** (`src/lib/contexts/ChatContext.tsx`) — thin wrapper around Vercel AI SDK's `useChat`, wires up the file system state so it's included in each request.

### AI integration (`src/app/api/chat/route.ts`)

- Uses `@ai-sdk/anthropic` with **claude-haiku-4-5**
- Prompt caching enabled via `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }`
- Two tools Claude may call:
  - `str_replace_editor` — create/edit/insert content in virtual files
  - `file_manager` — rename or delete virtual files
- Falls back to `MockLanguageModel` when no API key is set

### Preview pipeline (`src/lib/transforms/`)

Files stay in-memory (never written to disk). On each change:
1. Babel.js compiles JSX/TypeScript to JavaScript in the browser
2. An import map resolves bare imports to `esm.sh` CDN URLs or local blob URLs
3. The result is injected into a sandboxed `<iframe>` (`PreviewFrame`)

### Database (Prisma + SQLite)

- Schema: `prisma/schema.prisma`, client generated to `src/generated/prisma`
- Two models: `User` (email + bcrypt password) and `Project` (messages + file-system data stored as JSON strings; `userId` is optional to support anonymous projects)
- Anonymous projects are migrated to the authenticated user on sign-in (tracked via `localStorage`)
- The database schema is defined in the @prisma/schema.prisma file. Reference it anytime you need to understand the structure of data stored in the database.

### Authentication (`src/lib/auth/`)

- JWT sessions stored in httpOnly cookies (7-day expiry)
- `verifySession` is called server-side in page and API route handlers
- bcrypt cost factor 10 for password hashing

### UI layout

Three-panel resizable layout in `main-content.tsx`:
- **Left (35%)**: `ChatInterface` → `MessageList` + `MessageInput`
- **Right (65%)**: tab-switched between `PreviewFrame` (iframe) and a Code view (`FileTree` + Monaco `CodeEditor`)

## Key file locations

| Concern | Path |
|---|---|
| Chat API route | `src/app/api/chat/route.ts` |
| AI tools definition | `src/lib/tools/` |
| System prompt | `src/lib/prompts/` |
| Virtual file system | `src/lib/FileSystem.ts` |
| JSX → JS transform | `src/lib/transforms/` |
| Auth utilities | `src/lib/auth/` |
| Server actions | `src/actions/` |
| shadcn/ui components | `src/components/ui/` |

## Code style

Use comments sparingly. Only add them for complex code where the intent isn't obvious from the code itself.

## Testing

Vitest with jsdom + React Testing Library. Test files live in `__tests__/` directories colocated with source. No global setup file; each test imports its own mocks.
