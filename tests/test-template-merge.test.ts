/**
 * test-template-merge.test.ts — M11 batch 3 port coverage.
 *
 * Verifies the TS port at `src/lib/template-merge.ts` matches the
 * legacy ESM `bin/lib/template-merge.mjs` public surface:
 *   - parseSections handles frontmatter, preamble, H2-keyed sections
 *   - mergeTemplates project-wins strategy + stat counts
 *   - mergeTemplates base-wins strategy preserves base sections
 *   - mergeTemplateFiles handles missing files gracefully
 *   - Frontmatter + preamble inheritance
 *
 * @see src/lib/template-merge.ts
 * @see bin/lib/template-merge.mjs (legacy reference)
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeTemplateFiles, mergeTemplates, parseSections } from '../src/lib/template-merge.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'template-merge-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('template-merge — parseSections', () => {
  it('returns empty parse for empty input', () => {
    const r = parseSections('');
    expect(r.frontmatter).toBeNull();
    expect(r.sections.size).toBe(0);
  });

  it('extracts H2 sections keyed by header name', () => {
    const r = parseSections('## Section A\n\nbody A\n\n## Section B\n\nbody B');
    expect(r.sections.size).toBe(2);
    expect(r.sections.has('Section A')).toBe(true);
    expect(r.sections.has('Section B')).toBe(true);
    expect(r.sections.get('Section A')).toContain('body A');
  });

  it('captures frontmatter when present at line 0', () => {
    const content = '---\ntitle: Doc\n---\n\n## Hello\n\nworld';
    const r = parseSections(content);
    expect(r.frontmatter).toContain('title: Doc');
    expect(r.sections.has('Hello')).toBe(true);
  });

  it('preserves preamble (content before first H2)', () => {
    const r = parseSections('# Title\n\nintro paragraph\n\n## First Section\n\nbody');
    expect(r.preamble).toContain('# Title');
    expect(r.preamble).toContain('intro paragraph');
    expect(r.sections.has('First Section')).toBe(true);
  });

  it('does NOT treat a `---` after content as frontmatter', () => {
    const r = parseSections('Some intro.\n\n---\n\n## Section');
    expect(r.frontmatter).toBeNull();
  });

  it('handles documents with no H2 (single-section / preamble-only)', () => {
    const r = parseSections('Just some markdown\nwith no headers.');
    expect(r.sections.size).toBe(0);
    expect(r.preamble).toContain('Just some markdown');
  });
});

describe('template-merge — mergeTemplates', () => {
  it('uses project section over base when both present (default project-wins)', () => {
    const base = '## Intro\n\nbase intro';
    const project = '## Intro\n\nproject intro';
    const r = mergeTemplates(base, project);
    expect(r.merged).toContain('project intro');
    expect(r.merged).not.toContain('base intro');
    expect(r.stats.overridden).toBe(1);
    expect(r.stats.total).toBe(1);
  });

  it('keeps base section when not present in project', () => {
    const base = '## A\n\nbase A\n\n## B\n\nbase B';
    const project = '## A\n\nproject A';
    const r = mergeTemplates(base, project);
    expect(r.merged).toContain('project A');
    expect(r.merged).toContain('base B');
    expect(r.stats.overridden).toBe(1);
    expect(r.stats.base_only).toBe(1);
    expect(r.stats.total).toBe(2);
  });

  it('appends project-only sections', () => {
    const base = '## A\n\nbase A';
    const project = '## A\n\nproject A\n\n## C\n\nproject C';
    const r = mergeTemplates(base, project);
    expect(r.merged).toContain('## C');
    expect(r.stats.project_only).toBe(1);
    expect(r.stats.total).toBe(2);
  });

  it('honours base-wins strategy', () => {
    const base = '## A\n\nbase A';
    const project = '## A\n\nproject A';
    const r = mergeTemplates(base, project, { strategy: 'base-wins' });
    expect(r.merged).toContain('base A');
    expect(r.merged).not.toContain('project A');
    // base-wins doesn't increment `overridden`
    expect(r.stats.overridden).toBe(0);
  });

  it('preserves project frontmatter over base frontmatter', () => {
    const base = '---\nbasekey: base\n---\n\n## X\n\nbase';
    const project = '---\nprojectkey: project\n---\n\n## X\n\nproject';
    const r = mergeTemplates(base, project);
    expect(r.merged).toContain('projectkey');
    expect(r.merged).not.toContain('basekey');
  });

  it('falls back to base frontmatter when project has none', () => {
    const base = '---\nbasekey: base\n---\n\n## X\n\nbase';
    const project = '## X\n\nproject';
    const r = mergeTemplates(base, project);
    expect(r.merged).toContain('basekey');
  });

  it('counts overridden + base_only + project_only correctly', () => {
    const base = '## A\n\nb-A\n\n## B\n\nb-B\n\n## C\n\nb-C';
    const project = '## A\n\np-A\n\n## D\n\np-D';
    const r = mergeTemplates(base, project);
    // A: in both → overridden
    // B, C: base only
    // D: project only
    expect(r.stats.overridden).toBe(1);
    expect(r.stats.base_only).toBe(2);
    expect(r.stats.project_only).toBe(1);
    expect(r.stats.total).toBe(4);
  });
});

describe('template-merge — mergeTemplateFiles', () => {
  it('returns empty merge when neither file exists', () => {
    const r = mergeTemplateFiles(join(tmpDir, 'a.md'), join(tmpDir, 'b.md'));
    expect(r.merged).toBe('');
    expect(r.stats.total).toBe(0);
  });

  it('returns project content verbatim when base is missing', () => {
    const projectPath = join(tmpDir, 'project.md');
    writeFileSync(projectPath, '## Only\n\nproject only');
    const r = mergeTemplateFiles(join(tmpDir, 'missing.md'), projectPath);
    expect(r.merged).toContain('project only');
  });

  it('returns base content verbatim when project is missing', () => {
    const basePath = join(tmpDir, 'base.md');
    writeFileSync(basePath, '## Only\n\nbase only');
    const r = mergeTemplateFiles(basePath, join(tmpDir, 'missing.md'));
    expect(r.merged).toContain('base only');
  });

  it('merges both files when both exist (project-wins)', () => {
    const basePath = join(tmpDir, 'base.md');
    const projectPath = join(tmpDir, 'project.md');
    writeFileSync(basePath, '## A\n\nbase A\n\n## B\n\nbase B');
    writeFileSync(projectPath, '## A\n\nproject A\n\n## C\n\nproject C');
    const r = mergeTemplateFiles(basePath, projectPath);
    expect(r.merged).toContain('project A');
    expect(r.merged).toContain('base B');
    expect(r.merged).toContain('project C');
    expect(r.stats.total).toBe(3);
  });

  it('honours custom merge options through to mergeTemplates', () => {
    const basePath = join(tmpDir, 'base.md');
    const projectPath = join(tmpDir, 'project.md');
    writeFileSync(basePath, '## A\n\nbase A');
    writeFileSync(projectPath, '## A\n\nproject A');
    const r = mergeTemplateFiles(basePath, projectPath, { strategy: 'base-wins' });
    expect(r.merged).toContain('base A');
    expect(r.merged).not.toContain('project A');
  });
});
