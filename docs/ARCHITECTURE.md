# Architecture — why this stack, layer by layer

This is the reasoning behind every choice in `CLAUDE.md`'s tech stack section. If a design question comes up that isn't answered here, that's a gap in this doc — resolve it, then update this file so the next session doesn't re-litigate it.

## Reality check

This space is not empty. Bite Buddy AI, Certus AI, BiteBerry, Orderly, ActiveMenus, Revmo, and PolyAI are all already selling "AI phone agent takes restaurant orders and pushes to POS" as a live product. The voice AI part is commodity — the differentiation is POS integration depth, reliability under real call volume, price, and the fact that we have a live pilot (our own stores) nobody else on that list has. The hard part of this build is not the voice agent. It's getting a structured, paid order out of a phone call or text thread and landing it inside a POS system reliably, in a format the kitchen actually acts on. Everything below is designed around that.

## The layers

| Layer | Job | Stack |
|---|---|---|
| Call routing | Decide, at answer, whether this call is an order, a front-desk request, or a question | Intent-routing logic in our own Vapi agent, first thing every call hits |
| Voice | Turn a phone call into a structured order | Vapi (orchestration) + Deepgram (STT) + Cartesia (TTS) + a cheap fast-tier LLM + Twilio Voice |
| SMS | Turn a text thread into a structured order | Twilio Programmable Messaging |
| Order engine | Validate against menu, pricing, modifiers, hours, allergens; hold conversation state | Our own service — LLM function-calling against a schema we define, never free-form |
| Payment | Collect payment and hold the order until it clears, before it reaches the kitchen | Stripe/Square via SMS payment link (primary) + Twilio Pay (voice-only fallback) |
| POS bridge | Get the paid, structured order into the restaurant's POS | Direct integrations per POS (Toast, Clover, Square first) behind a common adapter — no aggregator |
| Dashboard/analytics | Owner-facing visibility and multi-tenant config | Next.js + Postgres, config-driven per tenant |

### 1. Call routing — one number, three jobs

No second phone number. The AI-answered line opens every call with a triage step before committing to any flow: order, front-desk transfer, or FAQ. This is a router agent we build on Vapi with tool-calls available to it — `transferToFrontDesk`, `startOrder`, `answerFAQ` — one greeting, then a branch.

Transfer to front desk: a plain Twilio `<Dial>` to the store's existing landline/cell, with a timeout fallback (~15-20s) — if nobody picks up, the AI takes back over and offers to take a message or the order itself. Staff never touch a new number; the AI sits in front of the line they already answer.

FAQ answering: a small per-tenant knowledge base — hours, location, parking, allergen/ingredient notes, catering minimums — stored as structured Q&A pairs in the tenant config table. Keyword/embedding lookup over a few dozen entries is plenty at this scale; no vector DB, no full RAG pipeline until there's a real reason for one. If a question falls outside the knowledge base, the agent says so and offers the front-desk transfer rather than guessing.

Order-taking: the flow described below, entered as a branch rather than the only thing the number does.

### 2. Voice

Decision made: we're building our own stack on Vapi rather than buying a managed platform like Retell. Worth being honest about what that trade actually is, since it's easy to assume "build it ourselves" is automatically cheaper — it isn't, by default.

Vapi is an orchestration layer, not an all-in-one price. You pay Vapi's hosting fee (~$0.05/min) plus each component separately: STT, LLM, TTS, and telephony. Picked lazily (e.g. a frontier-tier LLM and ElevenLabs TTS), the real all-in cost runs $0.15-0.40/min — more expensive than Retell's managed price, not less, because you're paying full retail for every component and still owe Vapi's orchestration fee on top. The savings only show up if the components are chosen deliberately for cost:

- **STT:** Deepgram Nova-3, streaming — ~$0.0077/min.
- **LLM:** a cheap fast-tier model for the order-extraction function-calling job specifically — Gemini 2.5 Flash-Lite (~$0.10/$0.40 per million tokens) or DeepSeek V4 Flash class, not a frontier model. Extracting "two burgers, no onions, one large fries" out of a sentence does not need a frontier-tier reasoning model, and that's most of what this LLM is doing on every turn.
- **TTS:** Cartesia Sonic, ~$35/million characters (~40ms time-to-first-audio, currently the latency leader) — roughly $0.01-0.015/min of actual AI speech.
- **Telephony:** Twilio Voice, ~$0.015/min blended.

Add Vapi's $0.05/min on top of those and a realistic, deliberately-optimized all-in cost lands around $0.10-0.12/min — in the same neighborhood as Retell's managed price, not dramatically cheaper. The real payoff of building it ourselves isn't a guaranteed cost cut, it's control: no platform markup that compounds as we scale, no vendor lock-in, the ability to swap any single component (a cheaper LLM release, a faster STT) without touching the rest of the stack, and no dependency on a third party's roadmap or pricing changes. The cost of that control is real too — we now own uptime, latency tuning, and vendor swaps ourselves instead of a managed platform doing it for us. That's a fair trade given the engineering background here, but it's a trade, not a free win.

Telephony numbers and call routing/transfer: Twilio. One vendor covers both voice and SMS.

### 3. SMS

Twilio Programmable Messaging. Two things to lock down early:

A2P 10DLC registration is mandatory for real-volume 2-way business SMS in the US, and carrier approval takes days to weeks — register in week one, not launch week. Unregistered traffic gets filtered and costs more per message.

SMS ordering runs on a constrained conversation state machine, not a free-form LLM chat — text is asynchronous and low-context, so the flow should be closer to structured prompts with LLM fallback for parsing free-text replies. This also keeps us off the hook for hallucinated prices or menu items.

### 4. Order engine

The piece that makes this a real product instead of a wrapper around Retell. Pulls the live menu/prices for a tenant, validates the order against what's actually available (86'd items, modifiers, allergens), holds multi-turn state, and emits one normalized order object regardless of channel. Keep the LLM's job narrow: extract structured intent via function-calling against a schema, never let it freehand quantities or prices. An order out of this engine is "confirmed but unpaid" until the payment layer clears it.

### 5. Payment — required before the order reaches the kitchen

Two paths, because voice and SMS behave differently:

Primary, both channels: the moment an order is confirmed (items, total, pickup/delivery time), send a Stripe or Square hosted payment link over SMS — even for calls that started on voice, since almost everyone can receive a text mid-call or right after. The order sits "pending payment" in the database; only a successful payment webhook flips it to "paid" and triggers the POS bridge. This keeps us almost entirely out of PCI scope — card data is entered on Stripe/Square's hosted page, never touching our servers, our database, or the voice transcript.

Fallback, voice-only callers who won't/can't text: Twilio Pay. Captures card digits via DTMF directly to the payment gateway, muting the audio and redacting the digits from the call recording/transcript automatically — keeps PCI burden at the lightest tier (SAQ A). Never have the agent ask a caller to say their card number out loud — that puts card data straight into the transcript and the LLM context.

No payment, no POS submission. This rule lives in the order engine, not as a suggestion to the AI.

### 6. POS bridge — the actual hard part

Decision made: direct POS integrations, no aggregator (ItsaCheckmate/Deliverect are off the table). Worth being clear-eyed about what this actually costs, since it's calendar time, not a monthly bill.

Toast, Square, and Clover all have public order-injection APIs, but each requires separate OAuth partner registration and sandbox certification, and often a formal partner approval step — realistically 4-8 weeks per POS, and that's before accounting for however many of them need to run in parallel. Canteen and Heights alone span all three of these, which means Phase 0 isn't "build one integration," it's building and certifying three simultaneously before the pilot can even go live end to end. SpotOn, Revel, NCR Aloha, Skytab and others are less standardized still, and each new POS a future customer runs on is its own multi-week build, not a config change.

The internal design is unchanged in shape even though the vendor relationship isn't: a `submitOrder(tenantId, normalizedOrder)` adapter interface, one implementation per POS (`ToastAdapter`, `CloverAdapter`, `SquareAdapter`), all behind the same call signature so the order engine never needs to know which POS a tenant is on — gated on `orderStatus === 'paid'`. A restaurant can only be onboarded once its specific POS has a working, certified adapter; POS coverage is now a direct constraint on which customers we can sign, not just an engineering nice-to-have, so new POS support should be prioritized around actual sales demand, not built speculatively ahead of it.

The trade against the aggregator: no recurring ~$100/month per-location fee once an integration is built, which meaningfully improves margin (see `Pricing_and_Business_Plan.md`), but the ongoing maintenance burden — POS vendors version and change their APIs over time — now sits with us instead of being absorbed by a middleman. That's a real, ongoing cost even after the initial build, budget for it rather than treating each integration as a one-and-done task.

## Multi-tenant architecture

Shared-schema multi-tenancy: one Postgres database, every table carries `tenant_id`, row-level security enforced at the DB layer. Cheap, and it's what almost every SaaS uses until enterprise customers demand hard data-isolation guarantees — nowhere near that yet, and database-per-tenant now would just slow things down.

Everything that varies by business — menu, modifiers, hours, phone/SMS numbers, front-desk transfer number, FAQ knowledge base entries, POS credentials and POS type, payment processor account and payout details, escalation rules, dashboard branding — lives in tenant config tables, not in code. Adding a new restaurant means writing rows, not shipping a deploy.

Because the config layer doesn't actually care whether the "menu" is food, services, or appointment slots, this same core (router + order/booking engine + payment + POS/booking bridge + config-driven tenant model) generalizes to salons, auto shops, or any SMB taking phone/text orders or bookings. Restaurants are the wedge market and the one with a built-in pilot (our own stores).

## Dashboard & analytics

Next.js + Tailwind + shadcn/ui, Recharts for charts, deployed on Vercel. Clerk for tenant/owner auth — don't build our own. Backend/workers on Railway or Fly.io to start; migrate to AWS only when there's a concrete reason to.

Metrics that matter to a restaurant owner, in priority order: orders completed by AI without human handoff (containment rate), payment conversion rate (confirmed vs. actually paid — abandoned payment links are silent revenue leak), missed/abandoned calls, front-desk transfer volume and answer rate, average order value and upsell rate, POS sync success/failure rate (this one's for us as much as them — it's the reliability SLA), busiest hours. Skip vanity metrics.
