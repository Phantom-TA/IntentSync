export type NodeLabel =
  | 'Repository'
  | 'Commit'
  | 'PullRequest'
  | 'Issue'
  | 'File'
  | 'Developer'
  | 'Module';

export type RelationshipType =
  | 'COMMIT_MODIFIED_FILE'
  | 'FILE_CO_CHANGED'
  | 'PR_CONTAINS_COMMIT'
  | 'DEVELOPER_MODIFIED_FILE'
  | 'ISSUE_REFERENCES_PR'
  | 'MODULE_CONNECTED_TO_MODULE';

export interface GraphNode {
  id: string;
  label: NodeLabel;
  properties: Record<string, unknown>;
}

export interface GraphRelationship {
  type: RelationshipType;
  fromId: string;
  toId: string;
  properties?: Record<string, unknown>;
}
