/**
 * sharder.ts — Atomic Artifacts (Sharding) for large PRDs and specs (Item 8).
 *
 * Breaks large PRDs into smaller shards to avoid context saturation.
 * Each shard covers a domain or epic; a parent index maintains cross-links.
 *
 * M3 hardening: no JSON state — pure text processing.
 * ADR-009: no user-supplied path gating needed (pure text in/out).
 * ADR-006: no process.exit.
 */

export interface Epic {
  id: string;
  name: string;
  content: string;
  storyCount: number;
}

export interface ShardThresholds {
  maxEpics?: number | undefined;
  maxStories?: number | undefined;
  maxLines?: number | undefined;
}

export interface ShardDecision {
  shouldShard: boolean;
  reason: string;
  epicCount: number;
  storyCount: number;
  lineCount: number;
}

export interface ShardDescriptor {
  index: number;
  epicIds: string[];
  filePath: string;
}

/**
 * Extract epics from a PRD file.
 */
export function extractEpics(content: string): Epic[] {
  const epicPattern =
    /### Epic (E\d+):\s*(.+)[\s\S]*?(?=### Epic E\d+:|## Non-Functional|---\s*\n## |$)/g;
  const epics: Epic[] = [];
  for (;;) {
    const match = epicPattern.exec(content);
    if (match === null) break;
    const epicContent = match[0];
    const storyMatches = epicContent.match(/#### Story E\d+-S\d+/g);
    epics.push({
      id: match[1] ?? '',
      name: (match[2] ?? '').trim(),
      content: epicContent,
      storyCount: storyMatches ? storyMatches.length : 0,
    });
  }

  return epics;
}

/**
 * Determine if a PRD should be sharded based on size heuristics.
 */
export function shouldShard(content: string, thresholds: ShardThresholds = {}): ShardDecision {
  const { maxEpics = 5, maxStories = 15, maxLines = 800 } = thresholds;

  const epics = extractEpics(content);
  const totalStories = epics.reduce((sum, e) => sum + e.storyCount, 0);
  const lineCount = content.split('\n').length;

  const reasons: string[] = [];
  if (epics.length > maxEpics) reasons.push(`${epics.length} epics (max ${maxEpics})`);
  if (totalStories > maxStories) reasons.push(`${totalStories} stories (max ${maxStories})`);
  if (lineCount > maxLines) reasons.push(`${lineCount} lines (max ${maxLines})`);

  return {
    shouldShard: reasons.length > 0,
    reason: reasons.length > 0 ? reasons.join('; ') : 'Within limits',
    epicCount: epics.length,
    storyCount: totalStories,
    lineCount,
  };
}

/**
 * Generate a PRD shard for a specific epic or group of epics.
 */
export function generateShard(
  parentPrdContent: string,
  epicIds: string[],
  shardIndex: number
): string {
  const epics = extractEpics(parentPrdContent);
  const shardEpics = epics.filter((e) => epicIds.includes(e.id));

  if (shardEpics.length === 0) return '';

  const epicTitles = shardEpics.map((e) => `${e.id} - ${e.name}`).join(', ');
  const header = [
    `# PRD Shard ${shardIndex}: ${epicTitles}`,
    '',
    `> **Parent Document:** [specs/prd.md](../prd.md)`,
    `> **Shard:** ${shardIndex} of N`,
    `> **Epics:** ${epicIds.join(', ')}`,
    `> **Status:** Draft`,
    '',
    '---',
    '',
  ].join('\n');

  const body = shardEpics.map((e) => e.content).join('\n\n---\n\n');

  return header + body;
}

/**
 * Generate a PRD index that links all shards.
 */
export function generateIndex(shards: ShardDescriptor[], projectName?: string | undefined): string {
  const lines = [
    `# PRD Index - ${projectName ?? 'Project'}`,
    '',
    `> **Purpose:** Master index for sharded PRD documents.`,
    `> **Total Shards:** ${shards.length}`,
    '',
    '---',
    '',
    '## Shard Map',
    '',
    '| Shard | Epics | File | Status |',
    '|-------|-------|------|--------|',
  ];

  for (const shard of shards) {
    const epicList = shard.epicIds.join(', ');
    lines.push(`| ${shard.index} | ${epicList} | [${shard.filePath}](${shard.filePath}) | Draft |`);
  }

  lines.push(
    '',
    '---',
    '',
    '## Cross-References',
    '',
    '<!-- Auto-generated cross-reference links between shards -->',
    ''
  );

  return lines.join('\n');
}
