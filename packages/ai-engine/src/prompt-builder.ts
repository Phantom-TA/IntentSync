import type { RankedContext, HydratedCommit, HydratedPR, HydratedIssue } from '@intentsync/retrieval';

const MAX_COMMIT_BODY_CHARS = 300;
const MAX_PR_BODY_CHARS = 500;
const MAX_ISSUE_BODY_CHARS = 400;
const MAX_COMMITS_IN_PROMPT = 8;
const MAX_PRS_IN_PROMPT = 5;
const MAX_ISSUES_IN_PROMPT = 5;

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function formatCommit(c: HydratedCommit): string {
  const date = c.timestamp.toISOString().slice(0, 10);
  const sha = c.sha.slice(0, 8);
  const files =
    c.filesChanged.length > 0
      ? `  Files: ${c.filesChanged.slice(0, 6).join(', ')}${c.filesChanged.length > 6 ? ` (+${c.filesChanged.length - 6} more)` : ''}`
      : '';
  const summary = c.aiSummary
    ? `  AI Summary: ${c.aiSummary}`
    : `  Message: ${truncate(c.message, MAX_COMMIT_BODY_CHARS)}`;
  return [`[${sha}] ${date} by @${c.authorLogin} (+${c.additions}/-${c.deletions})`, summary, files]
    .filter(Boolean)
    .join('\n');
}

function formatPR(pr: HydratedPR): string {
  const date = pr.createdAt.toISOString().slice(0, 10);
  const mergedNote = pr.mergedAt ? ` → merged ${pr.mergedAt.toISOString().slice(0, 10)}` : '';
  const labels = pr.labels.length > 0 ? `  Labels: ${pr.labels.join(', ')}` : '';
  const body = pr.aiSummary
    ? `  AI Summary: ${pr.aiSummary}`
    : pr.body
      ? `  Description: ${truncate(pr.body, MAX_PR_BODY_CHARS)}`
      : '';
  return [
    `PR #${pr.number}: "${pr.title}" [${pr.state}${mergedNote}] by @${pr.authorLogin} (${date})`,
    labels,
    body,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatIssue(issue: HydratedIssue): string {
  const date = issue.createdAt.toISOString().slice(0, 10);
  const closedNote = issue.closedAt
    ? ` → closed ${issue.closedAt.toISOString().slice(0, 10)}`
    : '';
  const labels = issue.labels.length > 0 ? `  Labels: ${issue.labels.join(', ')}` : '';
  const body = issue.body ? `  Description: ${truncate(issue.body, MAX_ISSUE_BODY_CHARS)}` : '';
  return [
    `Issue #${issue.number}: "${issue.title}" [${issue.state}${closedNote}] by @${issue.authorLogin} (${date})`,
    labels,
    body,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Builds a structured Gemini prompt from the ranked retrieval context.
 *
 * The prompt is designed to:
 *  - Provide authoritative repo history as grounding context
 *  - Instruct the model to cite specific commits, PRs, and issues
 *  - Avoid hallucinating information not present in the context
 */
export function buildPrompt(question: string, context: RankedContext): string {
  const sections: string[] = [];

  sections.push(`You are an expert software engineering analyst with deep knowledge of version control history, code review processes, and software architecture.

Your role is to answer questions about a specific code repository using ONLY the evidence provided below.
- Cite specific commits (by SHA), pull requests (by #number), and issues (by #number) to support your answer.
- If the evidence is insufficient to answer confidently, say so clearly — do NOT invent information.
- Be concise but thorough. Focus on the "why" and "what changed", not just the "what".
- Format your answer in plain text. Use bullet points sparingly, only when listing multiple distinct items.`);

  sections.push(`━━━ QUESTION ━━━\n${question}`);

  if (context.commits.length > 0) {
    const commits = context.commits.slice(0, MAX_COMMITS_IN_PROMPT);
    sections.push(
      `━━━ RELEVANT COMMITS (${commits.length} of ${context.commits.length}) ━━━\n` +
        commits.map(formatCommit).join('\n\n'),
    );
  }

  if (context.pullRequests.length > 0) {
    const prs = context.pullRequests.slice(0, MAX_PRS_IN_PROMPT);
    sections.push(
      `━━━ RELEVANT PULL REQUESTS (${prs.length} of ${context.pullRequests.length}) ━━━\n` +
        prs.map(formatPR).join('\n\n'),
    );
  }

  if (context.issues.length > 0) {
    const issues = context.issues.slice(0, MAX_ISSUES_IN_PROMPT);
    sections.push(
      `━━━ RELEVANT ISSUES (${issues.length} of ${context.issues.length}) ━━━\n` +
        issues.map(formatIssue).join('\n\n'),
    );
  }

  if (context.coChanges && context.coChanges.length > 0) {
    const coChangesStr = context.coChanges
      .map(
        (c) =>
          `- File "${c.sourcePath}" and "${c.targetPath}" are highly coupled (modified together in ${c.weight} commits). If one is changed, the other frequently needs modifications.`,
      )
      .join('\n');
    sections.push(`━━━ STRUCTURAL CO-CHANGE COUPLING (NEO4J GRAPH) ━━━\n${coChangesStr}`);
  }

  // If only raw chunks available (no hydrated entities), include chunk text as fallback
  if (
    context.commits.length === 0 &&
    context.pullRequests.length === 0 &&
    context.issues.length === 0 &&
    context.chunks.length > 0
  ) {
    const topChunks = context.chunks.slice(0, 10);
    sections.push(
      `━━━ RELEVANT CONTEXT SNIPPETS ━━━\n` +
        topChunks.map((c, i) => `[${i + 1}] (${c.entityType}) ${c.chunkText}`).join('\n\n'),
    );
  }

  sections.push(`━━━ YOUR ANSWER ━━━`);

  return sections.join('\n\n');
}
