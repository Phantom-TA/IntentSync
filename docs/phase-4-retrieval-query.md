# Phase 4: Retrieval + AI Query Engine (Completed)

This document captures development details for **Phase 4: Retrieval & AI Query Engine**.

---

## 📅 Completion Summary
* **Status**: Completed 100%
* **Date**: 2026-05-27
* **Verification**: All 10 packages build and typecheck. E2E retrieval and Q&A loop validated against local PostgreSQL and ChromaDB. Question-answering pipeline using `gemini-embedding-2` and `gemini-2.5-flash` successfully citations-backed.

---

## 🛠 Features Completed

### 1. Semantic Retrieval Engine (`@intentsync/retrieval`)

Provides repository-aware semantic context mapping vectors to clean entities.

#### Architecture
```
User Query ➔ Embeddings Client (gemini-embedding-2) 
           ➔ Parallel ChromaDB Search (commits, prs, issues)
           ➔ PostgreSQL Entity Hydration (Prisma Client)
           ➔ Context Ranker (recency + merge boost) ➔ RankedContext
```

#### Components

| File | Purpose |
|---|---|
| `semantic-search.ts` | Parallel execution of semantic similarity queries across ChromaDB collections. Filters dynamically by resolved database `repoId`. |
| `entity-hydrator.ts` | Hydrates exact records (Commit, PullRequest, Issue) from PostgreSQL using Prisma Client to supply rich context. |
| `context-ranker.ts` | Applies repository intelligence: recency boosts for recent changes (30-90 days), PR merge status boost, and size signals. |
| `retrieval-engine.ts` | `RetrievalEngine` orchestrator mapping queries to clean contextual data. |

---

### 2. AI Reasoning Engine (`@intentsync/ai-engine`)

Generates accurate, citation-backed answers grounded solely in fetched evidence.

#### Components

| File | Purpose |
|---|---|
| `prompt-builder.ts` | Constructs rigorous instruction prompts mapping commits (SHA, author, additions/deletions, message/AI summary) and PRs/issues to the LLM. |
| `gemini-chat.ts` | Client wrapping `gemini-2.5-flash` for high-performance single-turn chat completion. |
| `summary-cache.ts` | Lazy cache system writing distilled intelligence summaries back to `Commit.aiSummary` and `PullRequest.aiSummary` records for instant future reuse. |
| `ai-engine.ts` | Top-level `AiEngine` executor managing prompting, completing, and caching. |

---

### 3. Integrated Natural Language Query Command

We implemented the CLI `ask` command to serve as the unified code intelligence portal:

```bash
intentsync ask "<question>" --repo <owner/repo> [--local <path>] [--depth <number>] [--format json]
```

#### Key Capabilities
* **Dynamic DB Resolution**: Dynamically maps owner/name or directory paths to the underlying database `repoId`.
* **Robust Graceful Degradation**: If PostgreSQL database is offline, retrieval degrades gracefully to pure ChromaDB vector search.
* **Citation Generation**: Outputs beautiful, citation-backed markers showing exact commits, PRs, and issues cited by the answer.
* **JSON Format**: Supports `--format json` output flag for scripting and external tooling consumption.

---

## 🧪 Phase 4 E2E Verification

### 1. Local Monorepo Indexing (Sync)
```bash
$ intentsync sync --local e:\IntentSync --max-commits 5
```
**Output**:
```
ℹ Step 1/3 — Ingestion Complete
ℹ Step 2/3 — Data persisted to PostgreSQL.
ℹ Step 3/3 — Embeddings stored in ChromaDB (using gemini-embedding-2).
✓ Sync complete.
```

### 2. Natural Language Query (Ask)
```bash
$ intentsync ask "Why did we add Prisma persistence?" --local e:\IntentSync
```
**Output**:
```
IntentSync — Repository Query
────────────────────────────────────────────────────────────
  Question             Why did we add Prisma persistence?
  Repository           e:\IntentSync
  Depth                10
  
ℹ Searching repository history...
✓ Query complete.

Answer:
Prisma persistence was introduced in commit f0f3d2b2 (feat: add Prisma persistence, 
Gemini embeddings & ChromaDB storage) as part of Phase 3 of the project's architecture. 
It was added to provide structured persistence for repository metadata...

Sources:
  ◆ commit f0f3d2b2 — "feat: add Prisma persistence, Gemini embeddings & ChromaDB storage"
```
