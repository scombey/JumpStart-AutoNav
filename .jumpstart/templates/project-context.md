---
id: project-context
phase: advisory
agent: system
status: draft
created: ""
updated: ""
version: "1.0.0"
approved_by: "N/A"
approval_date: ""
upstream_refs: []
dependencies: []
risk_level: low
owners: []
sha256: ""
---

# Project Context

> **Auto-generated project scan — updated by `/jumpstart.scan`**

## Scan Metadata

| Field | Value |
|---|---|
| Scanned At | {{ISO datetime}} |
| Scanner Version | {{version}} |
| Root Directory | {{project root}} |
| Files Scanned | {{N}} |
| Directories Scanned | {{N}} |

---

## 1. Technology Stack Detection

| Layer | Detected | Version | Source |
|---|---|---|---|
| Language | {{e.g., TypeScript}} | {{e.g., 5.3}} | {{tsconfig.json}} |
| Runtime | {{e.g., Node.js}} | {{e.g., 20.x}} | {{package.json engines}} |
| Framework | {{e.g., Next.js}} | {{e.g., 14.x}} | {{package.json}} |
| Database | {{e.g., PostgreSQL}} | {{e.g., 16}} | {{connection string / prisma schema}} |
| Package Manager | {{e.g., npm}} | {{e.g., 10.x}} | {{lock file}} |
| Test Framework | {{e.g., Vitest}} | {{e.g., 1.6.x}} | {{package.json}} |

---

## 2. Project Structure

```
{{directory tree}}
```

### Key Directories

| Directory | Purpose | File Count |
|---|---|---|
| {{src/}} | {{Source code}} | {{N}} |
| {{tests/}} | {{Test files}} | {{N}} |

---

## 3. Dependencies

### Production Dependencies

| Package | Version | Purpose | Health |
|---|---|---|---|
| {{package}} | {{version}} | {{What it does}} | ✅ / ⚠️ / ❌ |

### Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| {{package}} | {{version}} | {{What it does}} |

### Outdated Dependencies

| Package | Current | Latest | Severity |
|---|---|---|---|
| {{package}} | {{current}} | {{latest}} | Patch / Minor / Major |

---

## 4. Code Patterns

### Architecture Pattern

{{Detected architecture pattern — e.g., MVC, Clean Architecture, Monolith, Microservices}}

### Module Structure

| Module | Responsibility | Dependencies | Coupling |
|---|---|---|---|
| {{module}} | {{What it does}} | {{What it imports}} | Low / Medium / High |

### Code Conventions

| Convention | Observed | Example |
|---|---|---|
| Naming | {{camelCase / snake_case / PascalCase}} | {{example}} |
| File structure | {{one-class-per-file / barrel exports / etc.}} | {{example}} |
| Error handling | {{try-catch / Result type / middleware}} | {{example}} |
| Logging | {{console / structured / library}} | {{example}} |

---

## 5. Configuration

### Environment Variables

| Variable | Purpose | Source |
|---|---|---|
| {{VAR_NAME}} | {{What it controls}} | {{.env / .env.example}} |

### Config Files

| File | Purpose |
|---|---|
| {{tsconfig.json}} | {{TypeScript configuration}} |

---

## 6. Risks and Observations

| Risk | Severity | Description | Recommendation |
|---|---|---|---|
| {{e.g., No test coverage}} | High / Medium / Low | {{Details}} | {{What to do}} |

### Technical Debt Markers

| Marker | Count | Top Files |
|---|---|---|
| TODO | {{N}} | {{file1, file2}} |
| FIXME | {{N}} | {{file1}} |
| HACK | {{N}} | {{file1}} |

---

## 7. Build and Run

### Build Commands

| Command | Purpose |
|---|---|
| {{npm run build}} | {{Compile/bundle}} |
| {{npm test}} | {{Run tests}} |

### Entry Points

| Entry Point | File | Type |
|---|---|---|
| {{Main}} | {{src/index.ts}} | Application |
| {{CLI}} | {{bin/cli.js}} | Command Line |
| {{Tests}} | {{tests/}} | Test Suite |
