import neo4j, { Driver } from 'neo4j-driver';
import { createLogger } from '@intentsync/logger';

const logger = createLogger('graph:connection');

let driver: Driver | null = null;

/**
 * Resolves configuration and returns a Neo4j driver singleton.
 */
export function getNeo4jDriver(): Driver {
  if (driver) {
    return driver;
  }

  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';

  logger.debug(`Initializing Neo4j connection at: ${uri}`);
  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return driver;
}

/**
 * Checks if Neo4j is online and fully responsive.
 */
export async function verifyNeo4jConnection(): Promise<boolean> {
  const currentDriver = getNeo4jDriver();
  try {
    await currentDriver.verifyConnectivity();
    logger.debug('Neo4j connection verified successfully.');
    return true;
  } catch (err) {
    logger.warn(`Failed to connect to Neo4j database: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Gracefully closes the active Neo4j driver instance.
 */
export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    logger.debug('Closing Neo4j Bolt driver.');
    await driver.close();
    driver = null;
  }
}
