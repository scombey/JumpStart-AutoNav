---
id: impl-plan-ecommerce
phase: 3
agent: Architect
status: Approved
created: 2026-02-09
updated: 2026-02-09
version: 1.0.0
approved_by: Jo Otey
approval_date: 2026-02-09
upstream_refs:
  - architecture-ecommerce
  - prd-ecommerce
---

# Implementation Plan — E-commerce Platform

## Milestone Overview

| Milestone | Focus | Duration | Stories |
|-----------|-------|----------|---------|
| M1 | Foundation & Auth | 1 week | E01-S01 |
| M2 | Store Setup | 1 week | E01-S02, E01-S03 |
| M3 | Product Management | 1 week | E02-S01, E02-S02, E02-S03 |
| M4 | Payments & Checkout | 1 week | E03-S01, E03-S02, E03-S03 |
| M5 | Order Management | 1 week | E04-S01, E04-S02 |

## Detailed Task Breakdown

### Milestone 1: Foundation & Auth

#### M1-T01: Project Scaffolding

**Story Ref:** E01-S01
**Estimate:** 4 hours
**Dependencies:** None

**Implementation Notes:**
- Initialize Next.js 14 with App Router
- Configure TypeScript strict mode
- Setup ESLint + Prettier
- Initialize Prisma with PostgreSQL

**Files to Create:**
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `prisma/schema.prisma`
- `.env.example`

**Acceptance:**
- [ ] Project runs with `npm run dev`
- [ ] TypeScript compiles without errors
- [ ] Database connection verified

#### M1-T02: Authentication System

**Story Ref:** E01-S01
**Estimate:** 8 hours
**Dependencies:** M1-T01

**Implementation Notes:**
- Implement NextAuth.js with credentials provider
- Create User model in Prisma
- Password hashing with bcrypt (cost 12)
- JWT session with 15-minute expiry

**Files to Create:**
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/lib/auth.ts`
- `src/components/auth/LoginForm.tsx`
- `src/components/auth/RegisterForm.tsx`

**Acceptance:**
- [ ] User can register with email/password
- [ ] User can login and receive session
- [ ] Protected routes redirect unauthenticated users

#### M1-T03: Database Schema Setup

**Story Ref:** E01-S01
**Estimate:** 4 hours
**Dependencies:** M1-T01

**Implementation Notes:**
- Define Store, Product, Order, OrderItem models
- Create migration files
- Setup seed data for development

**Files to Create:**
- `prisma/migrations/*`
- `prisma/seed.ts`

**Acceptance:**
- [ ] Migrations run successfully
- [ ] Seed data creates test store

### Milestone 2: Store Setup

#### M2-T01: Onboarding Wizard Component

**Story Ref:** E01-S02
**Estimate:** 8 hours
**Dependencies:** M1-T02

**Implementation Notes:**
- Multi-step form with React Hook Form
- Progress indicator component
- State persistence across steps
- Template preview panel

**Files to Create:**
- `src/components/onboarding/Wizard.tsx`
- `src/components/onboarding/StepIndicator.tsx`
- `src/components/onboarding/TemplateSelector.tsx`
- `src/app/(merchant)/onboarding/page.tsx`

**Acceptance:**
- [ ] Wizard navigates between steps
- [ ] Progress saved on step change
- [ ] Template preview updates in real-time

#### M2-T02: Template System

**Story Ref:** E01-S03
**Estimate:** 12 hours
**Dependencies:** M2-T01

**Implementation Notes:**
- Create 10 base templates with CSS variables
- Template configuration JSON schema
- Preview renderer component
- Mobile/desktop toggle

**Files to Create:**
- `src/templates/minimal/`
- `src/templates/modern/`
- `src/templates/classic/`
- `src/lib/template-engine.ts`

**Acceptance:**
- [ ] 10 templates available
- [ ] Templates render correctly
- [ ] Mobile preview works

### Milestone 3: Product Management

#### M3-T01: Product CRUD API

**Story Ref:** E02-S01
**Estimate:** 6 hours
**Dependencies:** M1-T03

**Implementation Notes:**
- REST endpoints for product operations
- Zod validation for inputs
- Image upload to Cloudflare R2
- Slug generation for URLs

**Files to Create:**
- `src/app/api/products/route.ts`
- `src/app/api/products/[id]/route.ts`
- `src/lib/products.ts`
- `src/lib/validators/product.ts`

**Acceptance:**
- [ ] Products can be created/read/updated/deleted
- [ ] Input validation rejects invalid data
- [ ] Images uploaded and URL stored

#### M3-T02: CSV Import

**Story Ref:** E02-S02
**Estimate:** 8 hours
**Dependencies:** M3-T01

**Implementation Notes:**
- CSV parser with Papa Parse
- Validation with detailed error reporting
- Progress tracking for large imports
- Template CSV generation

**Files to Create:**
- `src/lib/csv-importer.ts`
- `src/components/products/ImportModal.tsx`
- `src/app/api/products/import/route.ts`

**Acceptance:**
- [ ] CSV template downloadable
- [ ] Valid CSV imports products
- [ ] Invalid rows reported with line numbers

#### M3-T03: Inventory Management

**Story Ref:** E02-S03
**Estimate:** 6 hours
**Dependencies:** M3-T01

**Implementation Notes:**
- Inventory decrement on order
- Low stock alerts (threshold: 5)
- Out of stock badge component
- Inventory history logging

**Files to Create:**
- `src/lib/inventory.ts`
- `src/components/products/StockBadge.tsx`
- `src/components/alerts/LowStockAlert.tsx`

**Acceptance:**
- [ ] Inventory updates on order
- [ ] Low stock alert at threshold
- [ ] Out of stock badge displayed

### Milestone 4: Payments & Checkout

#### M4-T01: Stripe Integration

**Story Ref:** E03-S01
**Estimate:** 12 hours
**Dependencies:** M1-T02

**Implementation Notes:**
- Stripe Connect for merchant onboarding
- Payment Intent API for checkout
- Webhook handler for payment events
- Secure credential storage

**Files to Create:**
- `src/lib/stripe.ts`
- `src/app/api/payments/stripe/route.ts`
- `src/app/api/payments/stripe/webhook/route.ts`
- `src/components/checkout/StripeCheckout.tsx`

**Acceptance:**
- [ ] Merchant can connect Stripe account
- [ ] Customer can complete payment
- [ ] Webhook processes payment confirmation

#### M4-T02: PayPal Integration

**Story Ref:** E03-S02
**Estimate:** 8 hours
**Dependencies:** M4-T01

**Implementation Notes:**
- PayPal JavaScript SDK integration
- Server-side order capture
- Webhook for payment notifications

**Files to Create:**
- `src/lib/paypal.ts`
- `src/app/api/payments/paypal/route.ts`
- `src/components/checkout/PayPalButton.tsx`

**Acceptance:**
- [ ] PayPal checkout flow works
- [ ] Order captured on return
- [ ] Webhook updates order status

#### M4-T03: Checkout Flow

**Story Ref:** E03-S03
**Estimate:** 10 hours
**Dependencies:** M4-T01, M4-T02

**Implementation Notes:**
- Single-page checkout form
- Guest checkout option
- Address validation
- Order summary component

**Files to Create:**
- `src/app/(storefront)/checkout/page.tsx`
- `src/components/checkout/CheckoutForm.tsx`
- `src/components/checkout/OrderSummary.tsx`

**Acceptance:**
- [ ] Guest checkout available
- [ ] Order created on payment success
- [ ] Confirmation email sent

### Milestone 5: Order Management

#### M5-T01: Order Dashboard

**Story Ref:** E04-S01
**Estimate:** 8 hours
**Dependencies:** M4-T03

**Implementation Notes:**
- Order list with pagination
- Status filter and date range
- Order detail expansion
- Export functionality

**Files to Create:**
- `src/app/(merchant)/orders/page.tsx`
- `src/components/orders/OrderList.tsx`
- `src/components/orders/OrderDetail.tsx`
- `src/components/orders/OrderFilters.tsx`

**Acceptance:**
- [ ] Orders displayed in dashboard
- [ ] Filters work correctly
- [ ] Order details expandable

#### M5-T02: Fulfillment System

**Story Ref:** E04-S02
**Estimate:** 6 hours
**Dependencies:** M5-T01

**Implementation Notes:**
- Ship order action with tracking
- Customer notification on ship
- Partial fulfillment support
- Status history logging

**Files to Create:**
- `src/lib/fulfillment.ts`
- `src/components/orders/ShipModal.tsx`
- `src/app/api/orders/[id]/ship/route.ts`

**Acceptance:**
- [ ] Order can be marked shipped
- [ ] Customer notified with tracking
- [ ] Partial shipment supported

## Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Stripe API changes | High | Low | Pin SDK version, monitor changelog |
| Performance degradation | High | Medium | Load testing, performance budget |
| Security vulnerability | Critical | Low | Security review, dependency scanning |

## Phase Gate Approval

- [x] All tasks traced to PRD stories
- [x] Estimates reviewed and agreed
- [x] Dependencies identified
- [x] Risks documented with mitigations

**Approved by:** Jo Otey  
**Date:** 2026-02-09
