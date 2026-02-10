---
id: todo-app-product-brief
phase: 1
agent: Analyst
status: approved
domain: productivity
created: 2025-01-16
upstream: todo-app-brief
---

# Product Brief: Todo CLI

## Product Overview

A CLI-first task management tool for individual developers. Stores tasks as plain markdown files, integrates with git workflows, and requires zero cloud infrastructure. Addresses the gap between heavyweight project management tools and minimal text-file approaches.

## User Personas

### Persona 1: Solo Developer (Primary)

**Name:** Alex  
**Role:** Full-stack developer working on personal and freelance projects  
**Goals:** Track tasks without leaving the terminal; commit task changes with code  
**Pain Points:** Existing tools require browser context-switches; cloud-based tools have data sovereignty concerns  
**Technical Comfort:** High (command-line native)

### Persona 2: Open Source Maintainer (Secondary)

**Name:** Jordan  
**Role:** Maintains 3-5 OSS projects with community contributions  
**Goals:** Track issues locally, triage quickly, export to GitHub Issues when needed  
**Pain Points:** GitHub Issues requires online access; local tracking is ad-hoc  
**Technical Comfort:** High

## User Journey Maps

### Journey 1: Daily Task Management (Alex)
1. Morning: `todo list` → see today's priorities
2. During work: `todo add "Fix auth middleware" --priority high` → capture as it comes
3. After completing: `todo done 3` → mark complete
4. End of day: `git add .tasks/ && git commit -m "Update tasks"` → persist with code

### Journey 2: Project Triage (Jordan)
1. Review backlog: `todo list --project=mylib --sort=priority`
2. Promote to GitHub: `todo export 5 --format=github-issue`
3. Archive completed: `todo archive --older-than=30d`

## MVP Scope

### In Scope
- CLI commands: add, list, done, remove, edit
- Markdown-based storage in `.tasks/` directory
- Priority levels (high, medium, low)
- Project tagging
- Git-friendly file format

### Out of Scope (Post-MVP)
- Web UI
- Cloud sync
- Team collaboration features
- Plugin system
- Mobile app

## Success Metrics

- Task creation to completion: < 5 seconds CLI interaction
- Zero external dependencies at runtime
- 100% offline functionality
- Task files readable without the tool installed

---

## Phase Gate Approval

- [x] At least 2 user personas defined
- [x] User journey maps present
- [x] MVP scope explicitly bounded
- [x] Success metrics defined

**Approved by:** Human Operator  
**Date:** 2025-01-16
