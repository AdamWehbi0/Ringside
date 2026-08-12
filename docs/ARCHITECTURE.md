# Architecture

The reasoning behind every choice in `CLAUDE.md`'s tech stack section — the *why*, layer by layer, plus the contracts the build must honor. If a design question comes up that isn't answered here, that's a gap in this doc: resolve it, then update this file so the next session doesn't re-litigate it.

## Reality check

This space is not empty. Bite Buddy AI, Certus AI, BiteBerry, Orderly, ActiveMenus, Revmo, and PolyAI already sell "AI phone agent takes restaurant orders and pushes to POS" as a live product. **The voice AI part is commodity.** We don't win on "we have an AI that takes phone orders."

What we win on: POS integration depth, reliability under real call volume, price, and a live pilot (our own stores) nobody on that list has. The hard part of this build is **not** the voice agent — it's getting a structured, paid order out of a phone call or text thread and landing it inside a POS system reliably, in a format the kitchen actually acts on. Everything below is designed around that one truth.

## System at a glance

```
Inbound call/text
      │
      ▼
  ROUTER ──────────────► front-desk transfer (Twilio <Dial>, 15–20s timeout fallback)
   │  │
   │  └───────────────► FAQ (per-tenant structured Q&A from config)
   ▼
ORDER ENGINE  ── validate vs live menu/modifiers/hours/86'd items
   │              hold multi-turn state → one normalized order
   │              status: confirmed (unpaid)
   ▼
PAYMENT  ── hosted link over SMS (primary) | Twilio Pay DTMF (voice-only fallback)
   │         status flips to paid ONLY on a payment-provider webhook
   ▼  (hard gate: orderStatus === 'paid')
POS BRIDGE  submitOrder(tenantId, normalizedOrder) → ToastAdapter | CloverAdapter | SquareAdapter
```

Everything that varies per business (menu, hours, numbers, POS type/credentials, FAQ, payment account, branding) lives in **tenant config**, read by this same code path for every tenant.

## Layers

| Layer | Job | Stack |
|---|---|---|
| Call routing | At answer, decide: order, front-desk request, or question | Intent-routing logic in our own Vapi agent — first thing every call hits |
| Voice | Turn a phone call into a structured order | Vapi (orchestration) + Deepgram (STT) + Cartesia (TTS) + cheap fast-tier LLM + Twilio Voice |
| SMS | Turn a text thread into a structured order | Twilio Programmable Messaging |
| Order engine | Validate against menu/pricing/modifiers/hours/allergens; hold state | Our own service — LLM function-calling against a schema we define, never free-form |
| Payment | Collect payment and hold the order until it clears, before the kitchen | Stripe/Square hosted link (primary) + Twilio Pay DTMF (voice-only fallback) |
| POS bridge | Get the paid, structured order into the restaurant's POS | Direct integrations per POS (Toast, Clover, Square first) behind a common adapter — no aggregator |
| Dashboard | Owner-facing visibility + multi-tenant config | Next.js + Postgres, config-driven per tenant |

### 1. Call routing — one number, three jobs

No second phone number. The AI-answered line opens **every** call with a triage step before committing to any flow. This is a router agent we build on Vapi with tool-calls available to it — `transferToFrontDesk`, `startOrder`, `answerFAQ` — one greeting, then a branch.

- **Transfer to front desk:** a plain Twilio `<Dial>` to the store's existing landline/cell, with a timeout fallback (~15–20s). If nobody picks up, the AI takes back over and offers to take a message or the order itself. Staff never touch a new number; the AI sits in front of the line they already answer.
- **FAQ:** a small per-tenant knowledge base — hours, location, parking, allergen/ingredient notes, catering minimums — stored as structured Q&A pairs in tenant config. Keyword/embedding lookup over a few dozen entries is plenty at this scale; **no vector DB, no full RAG** until there's a real reason. Question outside the knowledge base → the agent says so and offers the front-desk transfer rather than guessing.
- **Order-taking:** the flow in §4, entered as a branch — not the only thing the number does.

### 2. Voice

**Decision made:** build our own stack on Vapi rather than buy a managed platform like Retell. Be honest about the trade — "build it ourselves" is *not* automatically cheaper.

Vapi is an orchestration layer, not an all-in price. You pay Vapi's hosting fee (~$0.05/min) **plus** each component separately: STT, LLM, TTS, telephony. Picked lazily (frontier LLM, ElevenLabs TTS), the real all-in cost runs **$0.15–0.40/min — more expensive than Retell's managed price, not less.** The savings only appear if components are chosen deliberately for cost:

- **STT:** Deepgram Nova-3, streaming — ~$0.0077/min.
- **LLM:** a cheap fast-tier model for the order-extraction function-calling job specifically — Gemini 2.5 Flash-Lite (~$0.10/$0.40 per M tokens) or DeepSeek V4 Flash class, **not** a frontier model. Extracting "two burgers, no onions, one large fries" out of a sentence does not need frontier reasoning, and that's most of what this LLM does every turn.
- **TTS:** Cartesia Sonic, ~$35/M characters (~40ms time-to-first-audio, currently the latency leader) — roughly $0.01–0.015/min of actual AI speech.
- **Telephony:** Twilio Voice, ~$0.015/min blended.

Add Vapi's $0.05/min and a deliberately-optimized all-in cost lands around **$0.10–0.12/min** — the same neighborhood as Retell's managed price, not dramatically cheaper. **The payoff of building it ourselves isn't a cost cut — it's control:** no platform markup that compounds as we scale, no lock-in, the ability to swap any single component (a cheaper LLM, a faster STT) without touching the rest, and no dependency on a third party's roadmap or pricing. The cost of that control is real too — we own uptime, latency tuning, and vendor swaps ourselves. A fair trade given the engineering background here, but a trade, not a free win.

One vendor (Twilio) covers both voice numbers/transfer and SMS.

### 3. SMS

Twilio Programmable Messaging. Two things to lock down early:

- **A2P 10DLC registration is mandatory** for real-volume 2-way business SMS in the US, and carrier approval takes days to weeks. Register in week one, not launch week. Unregistered traffic gets filtered and costs more per message.
- **SMS ordering runs on a constrained conversation state machine, not free-form LLM chat.** Text is asynchronous and low-context, so the flow is structured prompts with LLM fallback for parsing free-text replies. This also keeps us off the hook for hallucinated prices or menu items.

### 4. Order engine

The piece that makes this a real product instead of a wrapper around Retell. It:

- pulls the live menu/prices for a tenant,
- validates the order against what's actually available (86'd items, modifiers, allergens),
- holds multi-turn state, and
- emits **one normalized order object regardless of channel**.

Keep the LLM's job narrow: extract structured intent via function-calling against a schema, **never** let it freehand quantities or prices. An order out of this engine is `confirmed` (unpaid) until the payment layer clears it.

### 5. Payment — required before the order reaches the kitchen

Two paths, because voice and SMS behave differently:

- **Primary, both channels:** the moment an order is confirmed (items, total, pickup/delivery time), send a Stripe or Square **hosted payment link over SMS** — even for calls that started on voice, since almost everyone can receive a text mid-call or right after. The order sits `pending payment`; only a successful **payment webhook** flips it to `paid` and triggers the POS bridge. This keeps us almost entirely out of PCI scope — card data is entered on the provider's hosted page, never touching our servers, database, or the voice transcript.
- **Fallback, voice-only callers who won't/can't text:** Twilio Pay. Captures card digits via DTMF directly to the payment gateway, muting the audio and redacting the digits from the recording/transcript automatically — keeps PCI burden at the lightest tier (SAQ A).

**Never have the agent ask a caller to say their card number out loud** — that puts card data straight into the transcript and the LLM context. No payment, no POS submission — and that rule lives in the order engine, not as a suggestion to the AI.

### 6. POS bridge — the actual hard part

**Decision made:** direct POS integrations, no aggregator (ItsaCheckmate/Deliverect are off the table). Be clear-eyed about what this costs — it's calendar time, not a monthly bill.

Toast, Square, and Clover all have public order-injection APIs, but each requires separate **OAuth partner registration and sandbox certification**, often a formal partner approval step — realistically **4–8 weeks per POS**, before accounting for running several in parallel. Canteen and Heights alone span all three, so Phase 0 isn't "build one integration," it's building and certifying three simultaneously before the pilot can go live end to end. SpotOn, Revel, NCR Aloha, Skytab and others are less standardized still, and each new POS a future customer runs on is its own multi-week build — not a config change.

The internal design is unchanged in shape even though the vendor relationship isn't: a `submitOrder(tenantId, normalizedOrder)` adapter interface, one implementation per POS (`ToastAdapter`, `CloverAdapter`, `SquareAdapter`), all behind the same call signature so the order engine never needs to know which POS a tenant is on — gated on `orderStatus === 'paid'`.

**POS coverage is a direct constraint on which customers we can sign,** not just an engineering nice-to-have. A restaurant can only be onboarded once its specific POS has a working, certified adapter. New POS support should be prioritized around actual sales demand, not built speculatively.

The trade against the aggregator: no recurring ~$100/month per-location fee once an integration is built, which meaningfully improves margin (see [PRICING.md](PRICING.md)), but the ongoing maintenance burden — POS vendors version and change their APIs over time — now sits with us instead of a middleman. That's a real, ongoing cost even after the initial build; budget for it rather than treating each integration as one-and-done.

## Multi-tenant architecture

**Shared-schema multi-tenancy:** one Postgres database, every table carries `tenant_id`, row-level security enforced at the DB layer. Cheap, and what almost every SaaS uses until enterprise customers demand hard data-isolation guarantees — nowhere near that yet, and database-per-tenant now would just slow things down.

Everything that varies by business — menu, modifiers, hours, phone/SMS numbers, front-desk transfer number, FAQ entries, POS credentials and type, payment processor account and payout details, escalation rules, dashboard branding — lives in **tenant config tables, not in code**. Adding a restaurant means writing rows, not shipping a deploy.

Because the config layer doesn't care whether the "menu" is food, services, or appointment slots, this same core (router + order/booking engine + payment + POS/booking bridge + config-driven tenant model) generalizes to salons, auto shops, or any SMB taking phone/text orders or bookings. Restaurants are the wedge market and the one with a built-in pilot.

## Dashboard & analytics

Next.js + Tailwind + shadcn/ui, Recharts for charts, on Vercel. **Clerk** for tenant/owner auth — don't build our own. Backend/workers on Railway or Fly.io to start; migrate to AWS only when there's a concrete reason.

Metrics that matter to an owner, in priority order — skip vanity metrics:

1. **Containment rate** — orders completed by AI without human handoff.
2. **Payment conversion** — confirmed vs. actually paid (abandoned links are silent revenue leak).
3. Missed/abandoned calls.
4. Front-desk transfer volume and answer rate.
5. Average order value and upsell rate.
6. **POS sync success/failure rate** — this one's the reliability SLA, for us as much as them.
7. Busiest hours.

## Core contracts & invariants

The settled decisions the build must not violate. These are enforced in code, never left to the AI's judgment. (Concrete schemas — order object shape, tenant config shape — are defined during the Phase 0/1 build; this section fixes their *rules*, not their field lists.)

1. **The order state machine is linear and gated.** `confirmed` (unpaid) → `pending payment` → `paid` → `submitted to POS`. The transition to `paid` happens **only** on a payment-provider webhook. The transition to the POS bridge happens **only** when `orderStatus === 'paid'`.
2. **`submitOrder(tenantId, normalizedOrder)` is the one and only door into a POS.** Every POS is an adapter behind this exact signature. The order engine never branches on POS type; the adapter registry resolves it from tenant config.
3. **No card data crosses our boundary.** Not our servers, not our database, not a call transcript, not the LLM context. Hosted payment pages and DTMF-to-gateway capture only. The redaction path is the highest-paranoia code in the system — a leak here is a liability event, not a bug.
4. **The LLM extracts, it never decides prices or availability.** Function-calling against a schema we define. Quantities, prices, modifiers, and menu validity come from tenant config + the order engine, never freehanded by the model.
5. **Tenant behavior is data, not branches.** No `if (tenantId === …)` anywhere. If two tenants behave differently, the difference is a config value.
6. **Every inbound contact starts at the router.** One number per tenant, three jobs. Never a hardcoded single-purpose flow.

## Open architecture questions

Not blocking, but unresolved — give them a deliberate answer rather than a default, and record the answer back into this doc when settled:

- Which POS to build after Toast/Clover/Square, prioritized against real sales demand rather than built speculatively.
- Whether the cheap-component Vapi stack (Deepgram/Cartesia/fast-tier LLM) holds up on quality and latency at real volume, or specific components need upgrading.
- The exact field-level shape of the normalized order object and the tenant config schema — to be pinned down in Phase 0 and formalized in Phase 1 (`/packages/shared`).
