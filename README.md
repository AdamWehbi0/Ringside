# Ringside

A multi-tenant **voice + SMS ordering platform** for restaurants (and, later, any SMB that takes phone or text orders). A customer calls or texts a business's number; an AI agent takes their order, transfers them to the front desk, or answers a question. Every order is **paid before it ever reaches the kitchen**, then pushed into the restaurant's POS. Built once, configured per tenant — no forked code per customer.

**First pilot:** the founder's own stores, Canteen and Heights. Everyone else comes after that loop works end to end.

---

## Status

**Phase 0 — pilot on our own stores.** No application code exists yet; that's deliberate. Phase 0 proves the full loop (voice + SMS + payment + POS) on a business where mistakes are cheap. Repo scaffolding is a Phase 1 task. See [docs/ROADMAP.md](docs/ROADMAP.md) for the live checklist and always check which phase we're in before writing code.

## The core loop

```
                 ┌─────────────────────────────────────────────┐
   inbound call  │  ROUTER  →  order  |  front-desk  |  FAQ     │
   or text  ───► │  (every call/text starts here, never a      │
                 │   single-purpose flow)                      │
                 └───────────────┬─────────────────────────────┘
                                 │ order
                                 ▼
        ┌────────────────────────────────────────────────┐
        │ ORDER ENGINE                                    │
        │ validate against live menu / modifiers / hours  │
        │ hold multi-turn state → one normalized order    │
        │ status: confirmed (unpaid)                      │
        └───────────────┬────────────────────────────────┘
                        ▼
        ┌────────────────────────────────────────────────┐
        │ PAYMENT  (hosted link via SMS, Twilio Pay       │
        │ DTMF fallback) — no card data touches us        │
        │ status: paid  ◄── only a payment webhook flips  │
        └───────────────┬────────────────────────────────┘
                        │  gated on status === 'paid'
                        ▼
        ┌────────────────────────────────────────────────┐
        │ POS BRIDGE  submitOrder(tenantId, order)        │
        │ one adapter per POS: Toast · Clover · Square    │
        └────────────────────────────────────────────────┘
```

The voice AI is commodity. The hard, differentiating part is getting a **structured, paid order out of a phone call or text and landing it reliably inside a POS** in a form the kitchen acts on. Everything is designed around that.

## Repo structure

```
/docs                    ARCHITECTURE.md, ROADMAP.md, PRICING.md — read these, don't duplicate them
/marketing               offer-one-pager.html, landing-page-prompt.md — customer-facing collateral
CLAUDE.md                context loaded at the start of every Claude Code session
```

To be created in Phase 1 (see roadmap — absent by design, not by accident):

```
/apps/dashboard          Next.js owner-facing dashboard
/services/order-engine   menu validation, order state, payment gating
/services/pos-bridge     submitOrder() adapter + one adapter per POS
/services/voice-webhook  Vapi webhook handlers + call router
/services/sms-webhook    Twilio SMS webhook handlers
/packages/shared         tenant config schema, shared types, order schema
```

## Where to read what

Read in this order:

1. **[CLAUDE.md](CLAUDE.md)** — the short, always-loaded brief: what we're building, current phase, tech stack, and the non-negotiable rules.
2. **[docs/ROADMAP.md](docs/ROADMAP.md)** — the source of truth for *what we build next*. Phased, checklisted, top-to-bottom. Don't start a phase before the one above it is done.
3. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the *why*: layer-by-layer design, vendor rationale, the contracts and invariants the build must honor.
4. **[docs/INTEGRATIONS.md](docs/INTEGRATIONS.md)** — the A-Z vendor map: what each service handles vs. what we build, the webhook endpoints we expose, the credentials checklist, and the registrations on the critical path.
5. **[docs/PRICING.md](docs/PRICING.md)** — competitor pricing, unit economics, and the three-plan rate card. Check before hardcoding any rate, cap, or minimum.

## Tech stack (summary)

| Layer | Choice |
|---|---|
| Voice orchestration | Vapi (build-our-own components, not a managed black box) |
| STT / TTS / LLM | Deepgram Nova-3 · Cartesia Sonic · a cheap fast-tier LLM for order extraction |
| Telephony + SMS | Twilio Voice + Programmable Messaging (A2P 10DLC registered) |
| Payments | Stripe/Square hosted link (primary) + Twilio Pay DTMF (voice-only fallback) |
| POS | Direct integrations behind one `submitOrder()` adapter — Toast, Clover, Square first |
| Backend | Node.js + TypeScript |
| Database | Postgres, shared schema, `tenant_id` on every table, row-level security |
| Dashboard | Next.js + Tailwind + shadcn/ui + Recharts on Vercel |
| Auth | Clerk (don't roll our own) |
| Hosting | Vercel (dashboard) · Railway or Fly.io (services) |
| Monorepo | pnpm workspaces |

Full rationale for each choice is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## The hard rules (non-negotiable)

These are enforced in code, not left to the AI's judgment. Full list in [CLAUDE.md](CLAUDE.md).

1. **No order reaches the POS bridge unless `orderStatus === 'paid'`** — enforced in the order engine.
2. **No card data ever touches our servers, database, or an LLM transcript** — hosted payment pages and DTMF capture only.
3. **Tenant differences live in config, not code** — if you write `if (tenantId === 'canteen')`, stop.
4. **One `submitOrder()` interface, one adapter per POS** — the order engine never knows which POS a tenant runs.
5. **Every call starts at the router** — order / transfer / FAQ, never a hardcoded single-purpose flow.
6. **A2P 10DLC registration is a real dependency with real lead time** — SMS does not "just work" until it's registered for a tenant.

## Development

Commands are the intended targets once the repo is scaffolded in Phase 1 — they don't run yet:

```bash
pnpm install                      # install
pnpm --filter dashboard dev       # run the dashboard
pnpm test                         # test
pnpm lint                         # lint
pnpm typecheck                    # typecheck
```
