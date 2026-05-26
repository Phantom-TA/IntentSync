# Phase 3: PostgreSQL + ChromaDB + Embeddings (Completed)

This document captures development details for **Phase 3: Persistence & Embedding Pipeline**.

---

## 📅 Completion Summary
* **Status**: Completed 100%
* **Date**: 2026-05-27
* **Verification**: All 8 packages build and typecheck. Sync pipeline with 3-step flow (ingest → persist → embed) works. Graceful degradation when services are offline.

---

## 🛠 Features Completed

### 1. PostgreSQL Persistence (`@intentsync/db`)

#### Prisma Schema
Complete relational model with 7 entities:

| Model | Key Features |
|---|---|
| `Repository` | owner/name unique constraint, source type, last sync timestamp |
| `Developer` | login + repoId unique, cascading deletes |
| `Commit` | sha + repoId unique, lazy `aiSummary` field, parent SHAs array |
| `PullRequest` | number + repoId unique, state enum, lazy `aiSummary` field |
| `Issue` | number + repoId unique, PR reference tracking |
| `File` | path + repoId unique, change frequency counter |
| `Embedding` | entityId + chunkIndex + repoId unique, ChromaDB reference |

#### Persistence Layer (`persistence.ts`)
* Takes `PersistIngestionInput` (same shape as `IngestionResult`)
* **Upserts all entities** — supports incremental re-syncs without duplicates
* Calculates file change frequency from diffs automatically
* Maps commit authors to developer records via login matching

### 2. Embedding Pipeline (`@intentsync/embeddings`)

#### Architecture
```
Commits/PRs/Issues
    → Chunker (entity-specific text fragments)
    → EmbeddingProvider (Gemini text-embedding-004)
    → ChromaStore (ChromaDB collections)
```

#### Components

| File | Purpose |
|---|---|
| `embedding-provider.ts` | `EmbeddingProvider` interface — abstraction for future model swaps |
| `gemini-embedding.ts` | `GeminiEmbeddingProvider` — batch embedding via `@google/generative-ai` |
| `chunker.ts` | Entity-specific chunking: commits (sha + message + files), PRs (title + body), issues |
| `chroma-store.ts` | ChromaDB wrapper with `store()` and `query()` methods |
| `embedding-pipeline.ts` | Orchestrator — chunks all entities, batches embeddings (50/batch), stores in ChromaDB |

#### Chunking Strategy
* **Commits**: `[sha] [author] [date]\n[message]\n[files changed]`
* **Pull Requests**: `[number] [title]\n[state] [author]\n[labels]\n[body]`
* **Issues**: `[number] [title]\n[state] [author]\n[labels]\n[body]`
* Chunks sized at ~512 tokens with 50-token overlap

### 3. Integrated 3-Step Sync Pipeline

The CLI `sync` command now runs 3 sequential steps:

```
Step 1/3 — Ingestion (extract raw metadata)
Step 2/3 — Persistence (upsert to PostgreSQL)
Step 3/3 — Embeddings (chunk → embed → store in ChromaDB)
```

#### Skip Flags
| Flag | Effect |
|---|---|
| `--skip-persist` | Skip PostgreSQL persistence |
| `--skip-embed` | Skip embedding generation |

Each step fails gracefully — if PostgreSQL is offline, the pipeline warns and continues to embeddings. If ChromaDB or Gemini fails, the pipeline warns and completes.

---

## 🧪 Phase 3 Verification

```bash
# Full sync with all steps skipped (no Docker needed)
$ intentsync sync --local "e:\IntentSync" --skip-persist --skip-embed
✓ Sync complete. (5 commits, 59 files)

# Graceful PostgreSQL failure
$ intentsync sync --local "e:\IntentSync" --skip-embed
⚠ Persistence failed: Can't reach database server at localhost:5432
⚠ Continuing without persistence.
✓ Sync complete.

# Build verification (8 packages)
$ pnpm build
packages/core build: Done
packages/logger build: Done
packages/db build: Done
packages/embeddings build: Done
packages/repository-provider build: Done
packages/github-sync build: Done
packages/ingestion build: Done
apps/cli build: Done
```
