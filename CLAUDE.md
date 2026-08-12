# CLAUDE.md

This file is loaded into context at the start of every Claude Code session in this repo. Keep it accurate and keep it short — it is not the place for the full design rationale (that's `docs/ARCHITECTURE.md`) or the build sequence (that's `docs/ROADMAP.md`). Read this first, then read the roadmap to find out what phase we're in before writing any code.

## What this project is

A multi-tenant voice + SMS ordering platform for restaurants (and eventually any SMB that takes phone/text orders or bookings). A customer calls or texts a business's number; an AI agent either takes their order, transfers them to the front desk, or answers an FAQ. Confirmed orders are paid before they're ever sent to the kitchen, then pushed into the restaurant's POS. Built once, configured per tenant — no forked code per customer.

First customer and pilot: Adam's own stores (Canteen and Heights). Everyone else comes after that loop works end to end.

## Current phase

**Phase 0 — pilot on our own stores.** Check `docs/ROADMAP.md` for the live checklist and update it as items are completed. Do not start Phase 1 work until Phase 0 is checked off.

## Tech stack

- **Voice:** Vapi as the orchestration layer (not Retell — we're building our own stack, not buying a managed black box), Twilio Voice for the number and transfers. Component choices we control: Deepgram Nova-3 for STT, Cartesia Sonic for TTS, a cheap fast-tier LLM (Gemini 2.5 Flash-Lite or DeepSeek V4 Flash class, not a frontier model) for order-extraction function-calling. Swapping any one of these later is expected — that's the point of not being locked into a managed platform.
- **SMS:** Twilio Programmable Messaging, A2P 10DLC registered.
- **Payments:** Stripe (or Square, matching whatever the tenant's POS is under) via hosted payment link for SMS, Twilio Pay as the DTMF fallback for voice-only.
- **POS bridge:** Direct integrations, no aggregator. Toast, Clover, and Square first (Canteen and Heights run all three between them), each behind a common adapter interface. Every new POS system is real engineering + certification work (4-8 weeks each, OAuth partner registration), not a config change — factor that into any sales conversation with a restaurant on a POS we haven't built yet.
- **Backend services:** Node.js + TypeScript.
- **Database:** Postgres, shared schema, every table carries `tenant_id`, row-level security enforced at the DB layer.
- **Dashboard:** Next.js + TypeScript + Tailwind + shadcn/ui, Recharts for charts.
- **Auth:** Clerk (tenant/owner auth) — do not roll our own auth.
- **Hosting:** Vercel for the dashboard, Railway or Fly.io for backend services.
- **Package manager:** pnpm with workspaces (monorepo).

## Repo structure

```
/apps/dashboard          Next.js owner-facing dashboard
/services/order-engine   menu validation, order state, payment gating
/services/pos-bridge     submitOrder() adapter interface + one adapter per POS (Toast, Clover, Square)
/services/voice-webhook  Vapi webhook handlers, call router logic (order / transfer / FAQ)
/services/sms-webhook    Twilio SMS webhook handlers
/packages/shared         tenant config schema, shared types, order schema
/docs                    ARCHITECTURE.md, ROADMAP.md, PRICING.md — read these, don't duplicate them here
/marketing               offer-one-pager.html, landing-page-prompt.md — customer-facing collateral, not part of the app
```

If the `/apps`, `/services`, `/packages` structure doesn't exist yet, creating it is a Phase 1 task — check the roadmap before assuming it's missing by accident. `/docs` and `/marketing` should exist from day one since they're just files, not scaffolding.

## Development workflow

_Fill in real commands here as soon as the repo is scaffolded — an empty or wrong commands section is worse than no section, because Claude will otherwise guess and get it wrong._

- Install: `pnpm install`
- Dev (dashboard): `pnpm --filter dashboard dev`
- Test: `pnpm test`
- Lint: `pnpm lint`
- Typecheck: `pnpm typecheck`

## Hard rules — non-negotiable, not style preferences

1. **No order reaches the POS bridge unless `orderStatus === 'paid'`.** This is enforced in the order engine, not left to the AI agent's judgment.
2. **No payment card data ever touches our servers, our database, or an LLM transcript.** Card entry happens on Stripe/Square's hosted page or via Twilio Pay's DTMF capture. Never have the voice agent ask a caller to say their card number out loud, and never log call transcripts without confirming card-entry segments are redacted.
3. **Tenant differences live in config, not in code.** If you catch yourself writing `if (tenantId === 'canteen')`, stop — that value belongs in the tenant config table.
4. **POS integrations are built direct — Toast, Clover, Square first — each behind the same `submitOrder()` adapter interface** so the order engine never needs to know which POS a tenant is on. A restaurant can only be onboarded once its POS has a certified, working adapter; don't sell into a POS we haven't built yet.
5. **Every call starts at the router** (order / front-desk transfer / FAQ), never straight into order-taking. Don't hardcode a single-purpose flow for a "new" number — there's one number per tenant, not one per function.
6. **A2P 10DLC registration is a real dependency with a real lead time.** Don't assume SMS "just works" in any environment before this is confirmed registered for that tenant.

## Code standards

How code gets written here. These are defaults, not a checklist to satisfy for its own sake — the goal is code the next session (or the next engineer) understands in one read.

- **No over-engineering (YAGNI decides when to abstract).** Build for the requirement in front of you, not an imagined future one. One implementation gets a plain function, not an interface "in case." An abstraction has to earn its place by removing real, present duplication or coupling — the POS adapter earns it (three interchangeable POS systems, hard rule 4); a speculative "PaymentProviderFactory" for a second processor we don't have yet does not. When a later phase would need structure, flag it, don't pre-build it.
- **Self-documenting code, effectively no comments.** Names carry the intent; a comment that restates what the code already says is deleted. The only comment that survives explains a non-obvious *why* the code itself can't — a vendor quirk, a regulatory constraint (e.g. the PCI redaction path), a deliberate workaround. If you feel the urge to comment *what* a block does, extract it into a well-named function instead.
- **DRY, but don't force the wrong abstraction.** One source of truth for each rule, rate, and type — menu prices, plan rates, the order schema. But two things that merely look alike aren't the same thing: duplication is cheaper than the wrong shared abstraction, so wait until the pattern is real before unifying.
- **SRP — one reason to change per unit.** Each service owns one job (router routes, order-engine validates and holds state, pos-bridge submits, sms/voice webhooks translate transport). Functions do one thing at one level of abstraction. If a function both decides and does, split it.
- **Design patterns are tools, reached for only when they remove complexity.** The adapter (POS) is already load-bearing. A builder fits assembling the normalized order across multi-turn state; a strategy fits the SMS-link vs. Twilio-Pay payment paths. Use the named pattern when it makes the code simpler to reason about — never to add ceremony.
- **Parse at the boundaries, don't trust.** Every edge — webhook payloads, LLM function-call output, POS API responses — is validated against a schema (`/packages/shared`) before it flows inward. Ties directly to the hard rule that the LLM extracts but never freehands prices or availability. Keep side effects (DB, payment, POS calls) at the edges; keep the core logic pure and testable.
- **Fail loud on the money and POS paths.** Silent failure in payment gating or POS submission is the worst outcome in this system. No swallowed errors, no optimistic assumptions there — surface it, log it (redacted), and stop.

Style/formatting that a linter or formatter enforces is not documented here — run `pnpm lint` and match the surrounding code.

## Working style

- This is a solo-founder build, not a team with tribal knowledge to lean on — prefer boring, well-documented choices over clever ones. If a simpler tool does the job (see: FAQ lookup doesn't need a vector DB at this scale), use the simpler tool.
- Ask before making an architecture-level decision that isn't already settled in `docs/ARCHITECTURE.md` (e.g., swapping the POS aggregator, changing the payment provider, moving off shared-schema multi-tenancy). Don't ask before routine implementation choices inside an already-agreed layer.
- Don't build ahead of the current roadmap phase. If something in a later phase seems easy to knock out early, flag it instead of doing it — sequencing here exists on purpose (see Phase 0's whole point: prove the loop before scaling it).
- When a design question comes up that isn't answered in `docs/ARCHITECTURE.md`, treat that as a gap in the doc, not just a one-off decision — update the doc once it's resolved so the next session doesn't re-litigate it.

## Where to look for more detail

- `docs/ARCHITECTURE.md` — the full stack rationale, why each vendor was chosen, and the layer-by-layer design (voice, SMS, order engine, payment, POS bridge, multi-tenancy, dashboard).
- `docs/ROADMAP.md` — the phase-by-phase build sequence with checklists. This is the source of truth for "what do we build next."
- `docs/INTEGRATIONS.md` — the A-Z vendor map: what each service (Vapi, Twilio, Deepgram, Cartesia, Stripe, Toast/Square/Clover, Clerk) handles vs. what we build, the webhook endpoints we expose, credentials checklist, and which registrations are on the critical path.
- `docs/PRICING.md` — competitor pricing research, unit economics, and the three-plan pricing menu (Order Line / Full Line / Multi-Location). Relevant if a feature decision has a pricing or billing-logic implication (usage caps, minimums, overage rates) — check this before hardcoding a rate anywhere.
- `marketing/` — the customer-facing offer page and landing page design brief. Not read every session; only relevant when the pricing menu or plan copy changes, since it needs to stay in sync with `docs/PRICING.md`.
