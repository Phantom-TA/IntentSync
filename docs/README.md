# IntentSync Documentation Hub

Welcome to the **IntentSync** engineering memory and architecture documentation directory. This folder houses live, progressive documents detailing our system design, design choices, database layouts, and execution phase completions.

---

## 📚 Table of Contents

### 1. [System Architecture](./system-architecture.md)
* High-level system topology.
* Retrieval-first → Graph-enhanced workflow principles.
* Data Flow, Entity Relationships, and Database Schemas.
* Abstract Providers (`RepositoryProvider`) details.

### 2. [Phase 1: Foundation (Completed)](./phase-1-foundation.md)
* Monorepo directory setup (apps/cli + packages).
* Unified core library configurations and environment validation schemas.
* Custom, structured Pinot-based logger wrappers.
* Dynamic CLI commands via Commander.js.
* Workspace compile targets and dev paths integration.

### 3. [Phase 2: Ingestion Pipeline (Completed)](./phase-2-ingestion.md)
* Sequential 7-step ingestion pipeline extracting raw repository metadata.
* Commit + diff extraction with configurable limits.
* GitHub-specific metadata sync (PRs, issues, contributors).
* Live CLI `sync` command wired to real pipeline.

### 4. [Phase 3: PostgreSQL + ChromaDB + Embeddings (Completed)](./phase-3-persistence-embeddings.md)
* Prisma schema with 7 domain models and upsert-based persistence.
* Gemini embedding provider with batch generation.
* ChromaDB vector storage with entity-specific chunking.
* Integrated 3-step sync: ingest → persist → embed.
* Graceful degradation when services are offline.

### 5. [Phase 4: Retrieval + AI Query Engine (Completed)](./phase-4-retrieval-query.md)
* Semantic similarity searches across parallel ChromaDB collections.
* Relational entity hydration from PostgreSQL database.
* Repository-aware ranking with recency and merge status boosts.
* Evidence-grounded Gemini-2.5-flash reasoning with explicit source citations.
* Lazy, fire-and-forget summary caching.

### 6. [Phase 5: Repository-Level Intelligence & Diagnostics (Completed)](./phase-5-inspect.md)
* File Instability and recency-weighted change scoring.
* Developer ownership, commit shares, and line churn shares calculations.
* Recursive module directories aggregation, active contributor indexing, and folder health metrics.

---

## 🚀 Future Documentation
As implementation moves forward, subsequent documentation will detail:
* **Phase 6 GraphRAG expansion & Cypher integrations**
* **Phase 7 Distributed BullMQ processing schemas**
