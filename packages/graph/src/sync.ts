import { getNeo4jDriver } from './connection.js';
import { createLogger } from '@intentsync/logger';

const logger = createLogger('graph:sync');

export interface SyncInput {
  repoId: string;
  owner: string;
  name: string;
  developers: Array<{ id: string; login: string }>;
  files: Array<{ id: string; path: string }>;
  commits: Array<{
    id: string;
    sha: string;
    message: string;
    timestamp: Date;
    authorLogin: string;
    filesChanged: string[];
  }>;
}

/**
 * Pushes historical database entities to Neo4j, establishes relationships,
 * and calculates co-change file coupling weights.
 */
export async function syncGraph(input: SyncInput): Promise<void> {
  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    logger.info(`Starting graph database sync for repository: ${input.owner}/${input.name}`);

    // 1. Merge Repository Node
    await session.executeWrite((tx) =>
      tx.run(
        `
        MERGE (r:Repository {id: $repoId})
        SET r.owner = $owner, r.name = $name
        RETURN r
        `,
        { repoId: input.repoId, owner: input.owner, name: input.name },
      ),
    );

    // 2. Merge Developer Nodes and Link to Repository
    for (const dev of input.developers) {
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (r:Repository {id: $repoId})
          MERGE (d:Developer {id: $devId})
          SET d.login = $login, d.repoId = $repoId
          MERGE (r)-[:HAS_DEVELOPER]->(d)
          `,
          { repoId: input.repoId, devId: dev.id, login: dev.login },
        ),
      );
    }

    // 3. Merge File Nodes and Link to Repository
    for (const file of input.files) {
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (r:Repository {id: $repoId})
          MERGE (f:File {id: $fileId})
          SET f.path = $path, f.repoId = $repoId
          MERGE (r)-[:HAS_FILE]->(f)
          `,
          { repoId: input.repoId, fileId: file.id, path: file.path },
        ),
      );
    }

    // 4. Merge Commit Nodes, Author mappings, and File Modification Links
    for (const commit of input.commits) {
      // Create Commit and Author link
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (r:Repository {id: $repoId})
          MATCH (d:Developer {login: $authorLogin, repoId: $repoId})
          MERGE (c:Commit {id: $commitId})
          SET c.sha = $sha, c.message = $message, c.timestamp = $timestamp, c.repoId = $repoId
          MERGE (r)-[:HAS_COMMIT]->(c)
          MERGE (d)-[:AUTHORED]->(c)
          `,
          {
            repoId: input.repoId,
            commitId: commit.id,
            sha: commit.sha,
            message: commit.message,
            timestamp: commit.timestamp.toISOString(),
            authorLogin: commit.authorLogin,
          },
        ),
      );

      // Create Modification relationships
      for (const filePath of commit.filesChanged) {
        await session.executeWrite((tx) =>
          tx.run(
            `
            MATCH (c:Commit {id: $commitId, repoId: $repoId})
            MATCH (f:File {path: $filePath, repoId: $repoId})
            MERGE (c)-[m:MODIFIED]->(f)
            `,
            { repoId: input.repoId, commitId: commit.id, filePath },
          ),
        );
      }
    }

    // 5. Recompute Co-Change logical coupling weights
    logger.info('Calculating co-change structural file weights...');

    // Clear old weights to prevent double-counting
    await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (f1:File {repoId: $repoId})-[r:CO_CHANGED]-(f2:File)
        DELETE r
        `,
        { repoId: input.repoId },
      ),
    );

    // Compute active co-changes recursively
    await session.executeWrite((tx) =>
      tx.run(
        `
        MATCH (c:Commit {repoId: $repoId})-[:MODIFIED]->(f1:File {repoId: $repoId})
        MATCH (c)-[:MODIFIED]->(f2:File {repoId: $repoId})
        WHERE f1.path < f2.path
        MERGE (f1)-[r:CO_CHANGED {repoId: $repoId}]-(f2)
        SET r.weight = coalesce(r.weight, 0) + 1
        `,
        { repoId: input.repoId },
      ),
    );

    logger.info('Graph database sync completed successfully.');
  } catch (err) {
    logger.error(`Error executing Neo4j graph sync: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    await session.close();
  }
}
