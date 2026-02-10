---
id: design-system
phase: "3"
agent: Architect
status: draft
created: "[DATE]"
updated: "[DATE]"
version: "1.0.0"
approved_by: null
approval_date: null
upstream_refs:
  - "specs/architecture.md"
  - "specs/product-brief.md"
dependencies: []
risk_level: low
owners: []
sha256: null
---

# Design System Reference

> **Project:** [PROJECT_NAME]
> **Design System:** [NAME / URL]
> **Version:** [VERSION]

---

## Component Library

| Component | Library Source | Version | Usage Notes |
|-----------|--------------|---------|-------------|
| [Button] | [e.g., MUI, Tailwind, Shadcn] | [version] | [notes] |
| [Form Input] | [library] | [version] | [notes] |
| [Navigation] | [library] | [version] | [notes] |
| [Modal/Dialog] | [library] | [version] | [notes] |
| [Data Table] | [library] | [version] | [notes] |

---

## Design Tokens

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | [hex] | Primary actions, links |
| `--color-secondary` | [hex] | Secondary elements |
| `--color-error` | [hex] | Error states |
| `--color-success` | [hex] | Success states |

### Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--font-family-base` | [font] | Body text |
| `--font-family-heading` | [font] | Headings |
| `--font-size-base` | [size] | Default text size |

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-xs` | [value] | Tight spacing |
| `--spacing-sm` | [value] | Small gaps |
| `--spacing-md` | [value] | Standard spacing |
| `--spacing-lg` | [value] | Section gaps |

---

## Layout Patterns

### Grid System

- **Type:** [CSS Grid / Flexbox / Framework grid]
- **Columns:** [12-column / custom]
- **Breakpoints:**
  - Mobile: `< [px]`
  - Tablet: `[px] - [px]`
  - Desktop: `>= [px]`

### Page Templates

| Template | Description | Components Used |
|----------|-------------|-----------------|
| [Dashboard] | [description] | [list] |
| [Detail View] | [description] | [list] |
| [Form Page] | [description] | [list] |

---

## Accessibility Standards

- **WCAG Level:** [AA / AAA]
- **Required:** ARIA labels, keyboard navigation, focus management
- **Contrast Ratio:** Minimum [4.5:1 / 3:1] for [text / large text]

---

## Icon System

- **Library:** [e.g., Lucide, Heroicons, Material Icons]
- **Format:** [SVG / Icon font]
- **Size Scale:** [16px, 20px, 24px]

---

## Integration Notes

- **Import Method:** [npm package / CDN / local copy]
- **SSR Compatibility:** [Yes / No / Partial]
- **Bundle Impact:** [estimated KB]

---

## Phase Gate Approval

- [ ] Component library identified and version pinned
- [ ] Design tokens documented
- [ ] Accessibility standards defined
- [ ] Architecture references this design system

**Approved by:** Pending
**Approval date:** Pending
