export interface FileIntelligence {
  filePath: string;
  totalCommits: number;
  totalChurn: number;
  additions: number;
  deletions: number;
  lastModifiedAt: Date;
  daysSinceLastModification: number;
  instabilityScore: number;
  rating: 'Stable' | 'Moderate' | 'Active' | 'Highly Volatile';
  topContributors: Array<{
    login: string;
    commitCount: number;
    ownershipPercent: number;
  }>;
}

export interface DeveloperIntelligence {
  login: string;
  totalCommits: number;
  commitSharePercent: number;
  totalChurn: number;
  churnSharePercent: number;
  overallOwnershipPercent: number;
  topOwnedFiles: Array<{
    filePath: string;
    authorSharePercent: number;
  }>;
}

export interface ModuleIntelligence {
  modulePath: string;
  totalFiles: number;
  totalCommits: number;
  totalChurn: number;
  activeContributorsCount: number;
  averageInstabilityScore: number;
  moduleHealth: 'Healthy' | 'Needs Review' | 'Critical Volatility';
  topOwners: Array<{
    login: string;
    ownershipPercent: number;
  }>;
}
