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

---

## 🚀 Future Documentation
As implementation moves forward, subsequent documentation will detail:
* **Phase 3 Persistence (Postgres & ChromaDB adapter details)**
* **Phase 4 Retrieval & prompt caching interfaces**
* **Phase 5 Code analysis algorithms & scoring definitions**
* **Phase 6 GraphRAG expansion & Cypher integrations**
* **Phase 7 Distributed BullMQ processing schemas**
