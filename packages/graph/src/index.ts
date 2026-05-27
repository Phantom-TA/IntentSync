export { getNeo4jDriver, verifyNeo4jConnection, closeNeo4jDriver } from './connection.js';
export { syncGraph } from './sync.js';
export { getCoChangedFiles } from './queries.js';
export type { CoChangeRelationship } from './queries.js';
export type { SyncInput } from './sync.js'; // Let's check if SyncInput is exported from sync.ts. Wait, sync.ts had interface SyncInput, we should export it there or make it available.
