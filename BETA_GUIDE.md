# 🧪 IntentSync Beta Tester Setup & Usage Guide

Thank you for helping test **IntentSync**! This guide will walk you through setting up the local databases, installing the CLI, and running your first repository queries.

---

## 📋 Prerequisites

Before you start, make sure you have the following installed on your machine:
* **Node.js** (v18 or higher)
* **Docker & Docker Compose** (e.g., Docker Desktop)

---

## 🛠️ Step 1: Spin Up the Local Databases

IntentSync stores repository metadata, vector embeddings, and graph relationships locally on your machine for 100% data privacy.

1. Create a folder on your computer (e.g., `intentsync-test`) and download this `docker-compose.yml` file into it:
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: postgres:15-alpine
       ports:
         - "5432:5432"
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: postgres
         POSTGRES_DB: intentsync
       volumes:
         - postgres_data:/var/lib/postgresql/data

     chromadb:
       image: chromadb/chroma:0.4.15
       ports:
         - "8010:8000"
       volumes:
         - chroma_data:/chroma/data

     neo4j:
       image: neo4j:5-community
       ports:
         - "7474:7474"
         - "7687:7687"
       environment:
         NEO4J_AUTH: neo4j/intentsyncpass
       volumes:
         - neo4j_data:/data

     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"
       volumes:
         - redis_data:/data

   volumes:
     postgres_data:
     chroma_data:
     neo4j_data:
     redis_data:
   ```

2. Open your terminal in that folder and run:
   ```bash
   docker compose up -d
   ```
   *This starts PostgreSQL, ChromaDB, Neo4j, and Redis in the background.*

---

## 📦 Step 2: Install the IntentSync CLI

Install the CLI globally on your system using npm:

```bash
npm install -g intentsync
```

---

## 🔑 Step 3: Configure Environment Variables

Create a file named `.env` in your working folder (or set these as global environment variables in your terminal):

```ini
# Your personal GitHub token (needs 'repo' read scope for private repos)
GITHUB_TOKEN=ghp_yourGithubTokenHere

# Your Gemini API Key (free-tier keys work perfectly!)
GEMINI_API_KEY=AIzaSy_yourGeminiKeyHere
```

---

## 🚀 Step 4: Start the Background Queue Worker

IntentSync uses BullMQ and Redis to handle repository syncing asynchronously. In one terminal window, run the background worker:

```bash
intentsync worker
```
*Keep this terminal window open so it can process incoming sync tasks.*

---

## 🔄 Step 5: Index a Repository

In a **second terminal window**, tell the CLI to sync the repository you want to query. 

```bash
# Sync a public or private GitHub repository
intentsync sync --repo owner/repository --async
```

The CLI will submit the job to the queue, and you will see the background worker terminal spring to life, downloading commits, extracting code diffs, generating vector embeddings, and mapping relations to Neo4j.

---

## 💬 Step 6: Ask Questions!

Once the indexing job completes (usually takes ~30 seconds for small-to-medium repos), you can query your codebase:

```bash
intentsync ask "who introduced the auth middleware and what changed?" --repo owner/repository
```

### 🔒 Visual Confidence Scores
Every response will display an objective **Confidence Assessment Score** calculating retrieval relevance and citations to ensure the answer is fully grounded in your actual repository history:

```text
Confidence Assessment:
  Rating:        ■■■■■ 86% (HIGH)
  Justification: The title and description of PR #7, along with the AI summaries of related commits, explicitly and directly state its purpose.
  Retrieval:     MEDIUM (similarity: 0.66)
```

---

## 🧹 Cleaning Up / Stopping Databases

When you are done testing, you can stop the local containers:
```bash
docker compose down
```
If you want to wipe all indexed data and start fresh, run:
```bash
docker compose down -v
```
