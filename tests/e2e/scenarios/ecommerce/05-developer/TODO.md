# Developer TODO — E-commerce Platform

## Milestone 1: Foundation & Auth

### M1-T01: Project Scaffolding
- [ ] Initialize Next.js 14 with App Router
- [ ] Configure TypeScript strict mode
- [ ] Setup ESLint + Prettier
- [ ] Initialize Prisma with PostgreSQL
- [ ] Create `.env.example` with required variables

### M1-T02: Authentication System
- [ ] Install and configure NextAuth.js
- [ ] Create User model in Prisma schema
- [ ] Implement bcrypt password hashing
- [ ] Create LoginForm component
- [ ] Create RegisterForm component
- [ ] Add protected route middleware

### M1-T03: Database Schema Setup
- [ ] Define Store model
- [ ] Define Product model
- [ ] Define Order model
- [ ] Define OrderItem model
- [ ] Create initial migration
- [ ] Write seed script for dev data

## Milestone 2: Store Setup

### M2-T01: Onboarding Wizard
- [ ] Create multi-step wizard component
- [ ] Implement step indicator UI
- [ ] Add state persistence across steps
- [ ] Create template selector component
- [ ] Build preview panel

### M2-T02: Template System
- [ ] Create minimal template
- [ ] Create modern template
- [ ] Create classic template
- [ ] Build template configuration schema
- [ ] Implement preview renderer
- [ ] Add mobile/desktop toggle

## Milestone 3: Product Management

### M3-T01: Product CRUD API
- [ ] POST /api/products endpoint
- [ ] GET /api/products endpoint
- [ ] GET /api/products/[id] endpoint
- [ ] PUT /api/products/[id] endpoint
- [ ] DELETE /api/products/[id] endpoint
- [ ] Implement Zod validation
- [ ] Add image upload to R2

### M3-T02: CSV Import
- [ ] Install Papa Parse
- [ ] Create import modal component
- [ ] Implement validation with error reporting
- [ ] Add progress tracking
- [ ] Create template CSV download

### M3-T03: Inventory Management
- [ ] Implement inventory decrement logic
- [ ] Create LowStockAlert component
- [ ] Create StockBadge component
- [ ] Add inventory history logging

## Milestone 4: Payments & Checkout

### M4-T01: Stripe Integration
- [ ] Install Stripe SDK
- [ ] Implement Stripe Connect flow
- [ ] Create Payment Intent endpoint
- [ ] Build webhook handler
- [ ] Create StripeCheckout component

### M4-T02: PayPal Integration
- [ ] Install PayPal SDK
- [ ] Create PayPal configuration
- [ ] Implement order capture endpoint
- [ ] Build PayPalButton component
- [ ] Add webhook handler

### M4-T03: Checkout Flow
- [ ] Create checkout page
- [ ] Build CheckoutForm component
- [ ] Implement guest checkout option
- [ ] Add address validation
- [ ] Create OrderSummary component

## Milestone 5: Order Management

### M5-T01: Order Dashboard
- [ ] Create orders page layout
- [ ] Build OrderList component
- [ ] Implement pagination
- [ ] Add OrderFilters component
- [ ] Create OrderDetail expansion

### M5-T02: Fulfillment System
- [ ] Create ship order endpoint
- [ ] Build ShipModal component
- [ ] Implement customer notification
- [ ] Add partial fulfillment support
- [ ] Create status history logging

---

## Phase Gate Approval

- [x] All tasks from implementation plan included
- [x] Tasks organized by milestone
- [x] Actionable checklist format

**Approved by:** Jo Otey  
**Date:** 2026-02-09
