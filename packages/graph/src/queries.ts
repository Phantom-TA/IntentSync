import { getNeo4jDriver } from './connection.js';

export interface CoChangeRelationship {
  sourcePath: string;
  targetPath: string;
  weight: number;
}

/**
 * Finds files that are logically coupled (frequently modified together) in commits.
 */
export async function getCoChangedFiles(
  repoId: string,
  filePaths: string[],
  minWeight: number = 1,
): Promise<CoChangeRelationship[]> {
  if (filePaths.length === 0) {
    return [];
  }

  const driver = getNeo4jDriver();
  const session = driver.session();

  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        `
        MATCH (f1:File {repoId: $repoId})-[r:CO_CHANGED]-(f2:File {repoId: $repoId})
        WHERE f1.path IN $filePaths AND r.weight >= $minWeight
        RETURN f1.path AS sourcePath, f2.path AS targetPath, toInteger(r.weight) AS weight
        ORDER BY weight DESC
        LIMIT 10
        `,
        { repoId, filePaths, minWeight },
      ),
    );

    return result.records.map((record) => ({
      sourcePath: record.get('sourcePath'),
      targetPath: record.get('targetPath'),
      weight: record.get('weight'),
    }));
  } finally {
    await session.close();
  }
}
