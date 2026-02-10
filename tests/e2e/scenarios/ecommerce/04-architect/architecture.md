---
id: architecture-ecommerce
phase: 3
agent: Architect
status: Approved
created: 2026-02-09
updated: 2026-02-09
version: 1.0.0
approved_by: Jo Otey
approval_date: 2026-02-09
upstream_refs:
  - challenger-brief-ecommerce
  - product-brief-ecommerce
  - prd-ecommerce
---

# Architecture Document — E-commerce Platform

## Executive Summary

A modern, cloud-native e-commerce platform built with Next.js and Node.js, utilizing serverless architecture for cost-effective scaling. The system prioritizes developer experience, security, and sub-2-second page loads.

## Technology Stack

### Runtime & Framework

| Layer | Technology | Version | Justification |
|-------|------------|---------|---------------|
| Frontend | Next.js | 14.x | SSR/SSG for SEO, React ecosystem, Vercel optimization |
| Backend | Node.js | 20 LTS | JavaScript consistency, npm ecosystem |
| Database | PostgreSQL | 16.x | ACID compliance, JSON support, cost-effective |
| Cache | Redis | 7.x | Session storage, cart caching, rate limiting |
| Search | Meilisearch | 1.x | Fast product search, typo tolerance |

### Infrastructure

| Component | Service | Rationale |
|-----------|---------|-----------|
| Hosting | Vercel | Optimized for Next.js, edge functions |
| Database | Supabase | Managed PostgreSQL, auth, realtime |
| File Storage | Cloudflare R2 | Cost-effective, S3-compatible |
| Email | Resend | Developer-friendly transactional email |
| Payments | Stripe + PayPal | Industry standards, wide adoption |

## System Architecture

### C4 Context Diagram

```mermaid
C4Context
    title E-commerce Platform - System Context
    
    Person(merchant, "Merchant", "Store owner managing products and orders")
    Person(customer, "Customer", "End user shopping on storefront")
    
    System(ecommerce, "E-commerce Platform", "Enables SMBs to sell online")
    
    System_Ext(stripe, "Stripe", "Payment processing")
    System_Ext(paypal, "PayPal", "Alternative payments")
    System_Ext(email, "Resend", "Transactional email")
    System_Ext(storage, "Cloudflare R2", "Image storage")
    
    Rel(merchant, ecommerce, "Manages store")
    Rel(customer, ecommerce, "Shops")
    Rel(ecommerce, stripe, "Processes payments")
    Rel(ecommerce, paypal, "Processes payments")
    Rel(ecommerce, email, "Sends notifications")
    Rel(ecommerce, storage, "Stores images")
```

### C4 Container Diagram

```mermaid
C4Container
    title E-commerce Platform - Container View
    
    Person(merchant, "Merchant")
    Person(customer, "Customer")
    
    Container_Boundary(platform, "E-commerce Platform") {
        Container(storefront, "Storefront App", "Next.js", "Customer-facing store")
        Container(admin, "Admin Dashboard", "Next.js", "Merchant management")
        Container(api, "API Server", "Node.js", "Business logic")
        ContainerDb(db, "Database", "PostgreSQL", "Persistent storage")
        ContainerDb(cache, "Cache", "Redis", "Session & cart")
    }
    
    Rel(customer, storefront, "HTTPS")
    Rel(merchant, admin, "HTTPS")
    Rel(storefront, api, "REST/GraphQL")
    Rel(admin, api, "REST/GraphQL")
    Rel(api, db, "SQL")
    Rel(api, cache, "Redis Protocol")
```

## Data Model

### Entity Relationship Diagram

```mermaid
erDiagram
    STORE ||--o{ PRODUCT : contains
    STORE ||--o{ ORDER : receives
    STORE {
        uuid id PK
        string name
        string subdomain UK
        jsonb settings
        timestamp created_at
    }
    
    PRODUCT ||--o{ ORDER_ITEM : "ordered in"
    PRODUCT {
        uuid id PK
        uuid store_id FK
        string name
        decimal price
        integer inventory
        jsonb attributes
        string[] images
    }
    
    ORDER ||--o{ ORDER_ITEM : contains
    ORDER {
        uuid id PK
        uuid store_id FK
        string customer_email
        string status
        decimal total
        jsonb shipping_address
        timestamp created_at
    }
    
    ORDER_ITEM {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        integer quantity
        decimal unit_price
    }
```

## API Design

### REST Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/stores | Create store | Owner |
| GET | /api/stores/:id | Get store | Public |
| POST | /api/products | Add product | Owner |
| GET | /api/products | List products | Public |
| POST | /api/orders | Create order | Customer |
| GET | /api/orders | List orders | Owner |
| POST | /api/payments/stripe/webhook | Stripe webhook | Webhook |

### Authentication Flow

```mermaid
sequenceDiagram
    participant M as Merchant
    participant A as Admin App
    participant API as API Server
    participant DB as Database
    
    M->>A: Enter credentials
    A->>API: POST /auth/login
    API->>DB: Verify credentials
    DB-->>API: User record
    API-->>A: JWT + Refresh token
    A->>A: Store in httpOnly cookie
    A-->>M: Redirect to dashboard
```

## Security Considerations

> **Contribution by Jump Start: Security**
> 
> The following security measures are recommended based on OWASP Top 10 and PCI-DSS requirements:
> 
> 1. **Authentication:** Use bcrypt with cost factor 12 for password hashing
> 2. **Session Management:** JWT with 15-minute expiry, httpOnly secure cookies
> 3. **Input Validation:** Zod schemas for all API inputs
> 4. **CSRF Protection:** Double-submit cookie pattern
> 5. **Rate Limiting:** 100 requests/minute per IP, 10 failed logins trigger lockout
> 6. **Payment Security:** Never store card numbers; delegate to Stripe
> 7. **SQL Injection:** Use parameterized queries via Prisma ORM
> 8. **XSS Prevention:** React auto-escaping + CSP headers

### Threat Model Summary

| Threat | Mitigation | Status |
|--------|------------|--------|
| Credential stuffing | Rate limiting + CAPTCHA | Planned |
| Session hijacking | Secure cookies + rotation | Implemented |
| Payment fraud | Stripe Radar integration | Planned |
| Data breach | Encryption at rest | Implemented |

## Performance Considerations

> **Contribution by Jump Start: Performance**
> 
> Performance architecture recommendations:
> 
> 1. **Static Generation:** Pre-render product pages at build time (ISR)
> 2. **Image Optimization:** Next.js Image component with blur placeholders
> 3. **Database Indexing:** Composite indexes on (store_id, created_at) for orders
> 4. **Connection Pooling:** PgBouncer for database connections
> 5. **CDN Caching:** Vercel Edge for static assets
> 6. **Cart Caching:** Redis with 24-hour TTL for abandoned carts

### Performance Budget

| Metric | Target | Measurement |
|--------|--------|-------------|
| LCP | < 2.5s | Lighthouse |
| FID | < 100ms | Web Vitals |
| CLS | < 0.1 | Web Vitals |
| TTFB | < 200ms | Server logs |

## Phase Gate Approval

- [x] Technology stack justified with ADRs
- [x] Data model supports all PRD stories
- [x] API design covers all endpoints
- [x] Security reviewer approved (Jump Start: Security)
- [x] Performance plan documented

**Approved by:** Jo Otey  
**Date:** 2026-02-09
