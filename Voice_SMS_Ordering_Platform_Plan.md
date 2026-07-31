# Voice + SMS Ordering Platform for Restaurants — Technical & Product Plan

*Prepared by Stacy for Adam Wehbi — July 2026*

## Reality check first

Before the stack: this space is not empty. Bite Buddy AI, Certus AI, BiteBerry, Orderly, ActiveMenus, Revmo, and PolyAI are all already selling "AI phone agent takes restaurant orders and pushes to POS" as a live product in 2026, several claiming same-day onboarding and native Toast/Square/Clover/Skytab integration. That doesn't mean don't build it — it means the voice AI part is now commodity, and you won't win on "we have an AI that takes phone orders." You win on POS integration depth, reliability under real call volume, and price — or on a wedge (you already own three stores, so you have a live pilot and reference customer nobody else in this list has).

The hard, differentiating part of this build is not the voice agent. It's getting a structured order out of a phone call or text thread and landing it inside a POS system reliably, in a format the kitchen actually acts on. Plan around that truth.

## The layers

| Layer | Job | Recommended stack |
|---|---|---|
| Call routing | Decide, at answer, whether this call is an order, a front-desk request, or a question | Retell AI intent-routing node, first thing every call hits |
| Conversation | Turn a phone call or text thread into a structured order | Retell AI (voice) + Twilio Programmable Messaging (SMS) |
| Order engine | Validate against menu, pricing, modifiers, hours, allergens; hold conversation state | Your own service — Node/TypeScript, LLM function-calling with hard-coded menu/business rules as guardrails, not free-form generation |
| Payment | Collect payment and hold the order until it clears, before it ever reaches the kitchen | Stripe or Square via SMS payment link (primary) + Twilio Pay for voice-only callers (fallback) |
| POS bridge | Get the paid, structured order into the restaurant's POS | ItsaCheckmate Marketplace or Deliverect as the integration layer, not direct POS builds |
| Dashboard/analytics | Owner-facing visibility and multi-tenant config | Next.js + Postgres, one config-driven schema per tenant |

### 1. Call routing — one number, three jobs

You don't need a second phone number for this. The same AI-answered line should open every call with a lightweight triage step before it commits to any flow: is this person trying to place an order, trying to reach a human at the front desk, or asking a question (hours, location, "is this gluten-free," catering, etc.)? Retell (and Vapi) support this natively as a router agent with three tool-calls available to it — `transferToFrontDesk`, `startOrder`, and `answerFAQ` — so it's one greeting, then a branch, not three separate numbers to manage or advertise.

Transfer to front desk: a plain Twilio `<Dial>` to the store's existing landline/cell, with a timeout fallback (if nobody picks up in ~15-20 seconds, the AI takes back over and offers to take a message or the order itself instead). This also means the human staff never has to touch a new phone or number — the AI is a layer in front of the line they already answer.

FAQ answering: back this with a small per-tenant knowledge base — hours, location, parking, allergen/ingredient notes, catering minimums — stored as structured Q&A pairs in the tenant config table, not a full RAG/vector-store pipeline. At the scale of one restaurant's FAQ content, a keyword/embedding lookup over a few dozen entries is plenty; don't over-build this early. If a question falls outside the knowledge base, the agent should say so and offer the front-desk transfer rather than guessing.

Order-taking: this is the flow already described below, just entered as a branch rather than the only thing the number does.

### 2. Voice

Retell AI over Vapi or Bland for the voice leg. Retell's managed stack lands around 600ms latency at roughly $0.07–0.15/min all-in, which is the fastest path to production without you owning the STT/TTS/telephony pipeline yourself. Vapi gives more low-level control (you choose your own STT/TTS/LLM) if you later want to shave latency further or swap vendors, but that control costs you integration and ops time you don't have yet. Bland is cheapest per minute and strongest for outbound/pathway-style flows, less suited to the more open-ended inbound ordering conversation you need here.

If you outgrow the managed platforms: Cartesia Sonic (~40ms time-to-first-audio) for TTS and Deepgram for STT are the current latency leaders for a custom-built pipeline.

Telephony numbers and call routing: Twilio. Cheap, reliable, and you'll already be on Twilio for SMS, so one vendor covers both channels.

### 3. SMS

Twilio Programmable Messaging, full stop. Two things to lock down before you write a line of ordering logic:

A2P 10DLC registration is mandatory for any real volume of 2-way business SMS in the US, and carrier approval takes days to weeks — register this in week one, not the week you want to launch. Unregistered traffic gets filtered and costs 5x more per message.

SMS ordering should run on a constrained conversation state machine, not a free-form LLM chat. Text is asynchronous and low-context (customers won't re-read a full menu over SMS), so the flow should be closer to structured prompts ("Reply 1 for pickup, 2 for delivery") with LLM fallback for parsing free-text replies, not an open-ended chatbot. This is also what keeps you off the hook for hallucinated prices or menu items.

### 4. Order engine (the part you actually own)

This is the piece that makes this a real product instead of a wrapper around Retell. It needs to: pull the live menu and prices for that tenant, validate the order against what's actually available (86'd items, modifiers, allergens), hold multi-turn state ("add fries" / "no, make that a large"), and emit one normalized order object regardless of whether it came from voice or SMS.

Build this as your own service — Python (FastAPI) or Node (TypeScript), your call, but keep the LLM's job narrow: extract structured intent via function-calling against a schema you define, never let it freehand quantities or prices. An order coming out of this engine is "confirmed but unpaid" — it does not go to the POS yet. That gate is the payment layer below.

### 5. Payment — required before the order ever reaches the kitchen

You want payment collected before the order is placed, which is the right call — it kills no-shows on pickup and prevents the AI from sending unpaid orders into the kitchen queue. Two paths, because voice and SMS behave differently here:

Primary path, both channels: the moment the order is confirmed (items, total, pickup/delivery time), send a Stripe or Square hosted payment link over SMS — even for calls that started on voice, since almost everyone can receive a text mid-call or right after. The order sits in a "pending payment" state in your database; only a successful payment webhook flips it to "paid" and triggers the POS bridge to actually submit it. Nothing reaches the kitchen unpaid. This also keeps you almost entirely out of PCI scope, because the card number is entered on Stripe/Square's hosted page, never touching your servers, your database, or — critically — the voice transcript or call recording.

Fallback, voice-only callers who can't or won't receive a text: Twilio Pay. It's built exactly for this — it captures card digits via DTMF (keypad tones) directly to Stripe or another supported gateway, muting the audio and redacting the digits from the call recording and transcript automatically. That keeps your PCI burden at the lightest self-assessment tier (SAQ A) instead of full scope. Do not have the AI agent ask the caller to say their card number out loud — that puts card data straight into the transcript and the LLM context, which is the one thing to avoid entirely.

Either way: no payment, no POS submission. That rule lives in the order engine, not as a suggestion to the AI.

### 6. POS bridge — the actual hard part

Toast, Square, and Clover all have public order-injection APIs, but each requires separate OAuth partner registration, sandbox certification, and in some cases a formal partner approval process — that's easily 4-8 weeks per POS if you go direct, times however many POS systems you want to support. And that's just the big three; SpotOn, Revel, NCR Aloha, Skytab and others are less standardized and less documented.

Don't build direct integrations first. Use ItsaCheckmate's Marketplace (or Deliverect) — both already maintain one API that reads/writes to 50+ POS systems and tens of thousands of restaurant locations. You integrate once against their API and get Toast, Square, Clover, and most of the long tail for free. This also happens to solve your "build once, configurable for any business" requirement almost automatically, since the aggregator has already normalized the POS differences for you.

Design your own POS bridge as an adapter interface internally regardless (`submitOrder(tenantId, normalizedOrder)` → routes to aggregator or, later, a direct integration if you ever need one the aggregator doesn't cover), and gate that call on `orderStatus === 'paid'`. That keeps you from being locked into one vendor and keeps unpaid orders out of the kitchen.

## Multi-tenant architecture (build once, sell to anyone)

Start with shared-schema multi-tenancy: one Postgres database, every table carries a `tenant_id`, row-level security enforced at the DB layer. This is cheap and it's what almost every SaaS uses until they have enterprise customers demanding data isolation guarantees — you're nowhere near that yet, and database-per-tenant now would just slow you down.

Everything that varies by business — menu, modifiers, hours, phone/SMS numbers, front-desk transfer number, FAQ knowledge base entries, POS credentials and POS type, payment processor account (Stripe/Square) and payout details, escalation rules ("transfer to a human if X"), branding for the dashboard — lives in tenant config tables, not in code. Adding a new restaurant should mean writing rows, not shipping a deploy. That's what makes "build once, configure for anyone" literally true instead of aspirational.

Because the config layer doesn't actually care whether the "menu" is food, services, or appointment slots, this same core (conversation engine + order engine + config-driven tenant model) generalizes to salons, auto shops, or any SMB that takes phone/text orders or bookings — restaurants are just the wedge market, and the one you can pilot on your own stores.

## Dashboard & analytics

Next.js + Tailwind + shadcn/ui for the frontend, Recharts for charts, deployed on Vercel. Clerk or Auth0 for tenant auth (don't build your own auth). Backend/workers on Railway or Fly.io to start — cheap, fast to iterate, migrate to AWS only when you have a reason to.

Metrics that actually matter to a restaurant owner, in priority order: orders completed by AI without human handoff (containment rate), payment conversion rate (orders confirmed vs. actually paid — abandoned payment links are revenue leaking out silently), missed/abandoned calls, front-desk transfer volume and answer rate, average order value and upsell rate, POS sync success/failure rate (this one's for you as much as them — it's your reliability SLA), and busiest hours. Skip vanity metrics. A restaurant owner checking this dashboard between shifts wants to know "did we lose any calls" and "did orders actually hit the POS," not a wall of charts.

## Phased build order

Phase 0 — Pilot on your own stores. Canteen and Heights are your test tenant. You already know their POS, their menu, their call volume. Get one voice number and one SMS number live end-to-end into their real POS before you sell this to anyone else. This derisks the POS bridge before it's someone else's business on the line.

Phase 1 — Single-tenant MVP. One number (Retell + Twilio) with the three-way router live — order, front-desk transfer, FAQ — order engine validating against a real menu, payment collected and confirmed before anything reaches the POS, orders landing in the POS via the aggregator. No dashboard yet, no other tenants. Prove the loop works under real order volume for a few weeks, including the messy cases: declined cards, abandoned payment links, front-desk transfers nobody answers.

Phase 2 — Multi-tenant config layer + basic owner dashboard. Tenant table, config-driven menu/hours/POS credentials, call logs and order history in a simple dashboard. Onboard 2-3 more restaurants manually.

Phase 3 — Self-serve configurability and analytics. Owners can edit their own menu/hours without you touching a database. Full analytics dashboard. This is the point where it's a real product, not a service you're running by hand.

Phase 4 — Scale POS coverage, add outbound (reservation reminders, win-back SMS), consider expanding beyond restaurants using the same core.

## What to decide before writing code

Three open questions worth answering now rather than mid-build: what's the pricing model (per-minute/per-message pass-through plus a flat SaaS fee is the common pattern in this space), whether you're comfortable depending on an aggregator's uptime and pricing for the POS layer long-term versus owning direct integrations eventually, and whether your own stores' current POS is even on ItsaCheckmate/Deliverect's supported list — worth checking before Phase 0 kicks off.

Sources:
- [Vapi vs Retell vs Bland in 2026: The True Cost Per Minute](https://medium.com/@automation.labs/vapi-vs-retell-vs-bland-in-2026-the-true-cost-per-minute-578f38af3523)
- [8 Best Voice AI Platforms for 2026 — Retell AI](https://www.retellai.com/blog/best-voice-ai-providers)
- [Toast Orders API overview](https://doc.toasttab.com/doc/devguide/portalOrdersApiOverview.html)
- [Toast API change log](https://doc.toasttab.com/doc/relnotes/devPortalApiChangeLog.html)
- [Square Orders API](https://developer.squareup.com/docs/orders-api/what-it-does)
- [Clover Orders FAQs](https://docs.clover.com/dev/docs/orders-faqs)
- [Clover REST API guide](https://docs.clover.com/dev/docs/making-rest-api-calls)
- [ItsaCheckmate Marketplace launch](https://markets.financialcontent.com/observerreporter/article/gnwcq-2022-11-15-itsacheckmate-launches-marketplace-a-next-generation-open-api-platform)
- [Deliverect integrations](https://www.deliverect.com/en-us/integrations)
- [Twilio A2P 10DLC](https://www.twilio.com/en-us/phone-numbers/a2p-10dlc)
- [Twilio Programmable Messaging & A2P 10DLC compliance](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- [Best Text-to-Speech APIs 2026: ElevenLabs, Cartesia, Deepgram](https://futureagi.com/blog/best-text-to-speech-providers-2026/)
- [Best STT Providers 2026 — Coval](https://www.coval.ai/blog/best-speech-to-text-providers-in-2026-independent-benchmarks-and-how-to-choose/)
- [AI Voice Ordering for Restaurants: The Complete 2026 Guide](https://biteberry.com/2026/03/06/ai-voice-ordering-for-restaurants-the-complete-2026-guide/)
- [Restaurant Voice AI Agent — Certus AI](https://www.certus-ai.com/)
- [Multi-tenant SaaS Architecture — AWS best practices](https://aws.amazon.com/isv/resources/5-multi-tenant-saas-architecture/)
- [Designing Multi-tenant SaaS Architecture on AWS 2026](https://www.clickittech.com/software-development/multi-tenant-architecture/)
