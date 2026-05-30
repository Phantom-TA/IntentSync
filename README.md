# 🚀 IntentSync

**IntentSync** is an AI-powered repository intelligence engine and engineering memory tool. It indexes your codebase history, commits, pull requests, issues, and code relationships into a local GraphRAG knowledge base, allowing you to query your repository history with natural language.

Every response is backed by objective **Answer Confidence Scores (in %)**, ensuring you know exactly how much the answer is grounded in real commits, pull requests, and file structural coupling.

---

## 💡 What Problem Does It Solve?

As codebases grow, understanding the *why* behind historical decisions, regressions, and API shifts becomes difficult. General-purpose LLMs lack real-time knowledge of your git history, and sending whole repositories to context windows is slow and expensive.

**IntentSync solves this by:**
1. **Structuring Git History**: Ingesting repository metadata, commit histories, PR discussions, issue descriptions, and exact file trees.
2. **Graph-based Coupling Analysis (Neo4j)**: Constructing structural graphs to track co-change weights (which files are frequently modified together).
3. **Retrieval-Augmented Generation (GraphRAG)**: Searching across PostgreSQL (metadata), ChromaDB (semantic vectors), and Neo4j (coupling) to provide a rich context prompt for Gemini.
4. **Answer Grounding Verification**: Instructing Gemini to self-assess its answers against retrieved data, and combining this with exact vector similarity calculations to output a **Confidence Percentage** (e.g., `86% (HIGH)`).

---

## 🏗️ Technical Architecture

IntentSync is built as a TypeScript monorepo structured with isolated, reusable packages:

```text
               ┌───────────────────────┐
               │    intentsync CLI     │
               └───────────┬───────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼ (BullMQ Queue submission) ▼
     ┌───────────────┐           ┌───────────────┐
     │ Redis Queue   │           │ Background    │◄─── (Processing Jobs)
     └───────┬───────┘           │ Worker        │
             │                   └───────┬───────┘
             │                           │ (Performs indexing flow)
             │                           ▼
             │         ┌─────────────────────────────────┐
             │         │ 1. Ingest Commit/PR/Issue metadata│
             │         │ 2. Save relational tables (Pg)  │
             │         │ 3. Generate Gemini Embeddings    │
             │         │ 4. Build Neo4j File Graph       │
             │         └─────────────────────────────────┘
             │
             ▼ (Ask / Retrieval Command)
   ┌──────────────────┐
   │ Retrieval Engine ├──────► ChromaDB (Vector Index)
   └─────────┬────────┘
             ├───────────────► PostgreSQL (Hydrated metadata)
             └───────────────► Neo4j (Graph Co-change weight maps)
```

* **`packages/ingestion`**: Fetches git commits, author profiles, full PRs, and issues using Octokit or Git CLI.
* **`packages/embeddings`**: Splits code files and metadata into semantic chunks, generating vector representations via the Gemini API.
* **`packages/graph`**: Synchronizes files and commits to Neo4j database, calculating co-change structural couplings.
* **`packages/queue`**: Uses BullMQ and Redis to execute time-consuming ingestion and embedding tasks in isolated background workers with automatic rate-limit backoffs.
* **`packages/retrieval`**: Combines vector searches and Neo4j graph outputs to ranks context.
* **`packages/ai-engine`**: Connects to Gemini 2.5 Flash to synthesize answers and generate self-assessment metrics.

---

## 🚀 Quick Start Setup (Local Beta Testing)

We suggest running local database engines inside Docker. This ensures 100% data privacy and runs completely free of cost.

See our dedicated **[Beta Tester Setup Guide (BETA_GUIDE.md)](./BETA_GUIDE.md)** for a complete step-by-step walkthrough.

### Quick Commands:

```bash
# 1. Build and install CLI globally from local clone
pnpm install
pnpm build
npm install -g ./apps/cli

# 2. Run local databases via Docker
docker compose up -d

# 3. Configure keys in terminal (or .env file)
export GITHUB_TOKEN=your_token
export GEMINI_API_KEY=your_key

# 4. Start background processing worker queue
intentsync worker

# 5. In a separate terminal, sync a repository
intentsync sync --repo owner/repository --async

# 6. Ask questions about your code!
intentsync ask "what commits are related to the queue package?" --repo owner/repository
```

---

## 🛠️ CLI Reference

### `intentsync sync`
Synchronizes repository data.
```bash
# Run synchronously (blocking)
intentsync sync --repo owner/repository

# Run asynchronously in background queues (recommended)
intentsync sync --repo owner/repository --async
```

### `intentsync worker`
Launches background workers to process BullMQ tasks. Keep this running in a separate terminal.

### `intentsync ask <question>`
Retrieves context, constructs answer, parses confidence rating, and lists citations.
```bash
intentsync ask "Summarize the PRs related to GraphRAG" --repo owner/repository
```

### `intentsync status`
Validates environment variable configuration, checks local database health, and displays Redis queue size logs.
