# Roadmap

The source of truth for **what we build next**. Work top to bottom. Don't start a phase until the one above it is checked off — each phase exists to derisk the one after it, mostly the POS integration and payment flow, which are the two ways this project actually fails.

Update checkboxes as work completes. If a task needs something not listed here, **add it** — don't silently do extra work outside this file.

---

## Phase 0 — Pilot on our own stores

**Goal:** prove voice + SMS + payment + POS actually works, on a business where mistakes are cheap to fix.

**Start these two first — they have external lead times measured in weeks and block go-live:**

- [ ] **Register as an OAuth/API partner with Toast, Clover, and Square** — immediately, in parallel. Canteen and Heights run all three between them, and certification takes 4–8 weeks *per POS*. This is the single biggest scope item in the phase; start it before anything else.
- [ ] **Register A2P 10DLC** for at least one pilot number. Real approval lead time — start it in parallel, don't wait on it.

**Then build the loop:**

- [ ] Build the `submitOrder(tenantId, normalizedOrder)` adapter interface, then one adapter per POS (Toast, Clover, Square) behind it.
- [ ] Set up Vapi + one Twilio number, wired for inbound voice. Wire the component stack deliberately: Deepgram (STT), Cartesia (TTS), a cheap fast-tier LLM for order extraction (Gemini Flash-Lite / DeepSeek-class, **not** frontier). The cost savings only materialize if these choices are made on purpose.
- [ ] Build the minimum order engine: hardcode one store's real menu, validate items/modifiers, hold conversation state for a multi-turn order.
- [ ] Wire payment: Stripe (or Square) hosted link sent via SMS on order confirmation; order held `pending payment` until the webhook confirms.
- [ ] Wire the POS bridge: submit a paid order through each certified adapter into the real POS, and **confirm it shows up correctly on the kitchen side, for all three.**
- [ ] Wire the call router: order / front-desk transfer / FAQ, using a first-pass FAQ list (hours, location, a handful of menu questions).

**Then validate it for real:**

- [ ] Run it live on one store for **at least 1–2 weeks of real call volume.** Track: containment rate, payment conversion, POS sync failures, any call that went sideways.

**Definition of done:** Do not proceed to Phase 1 until this has run clean — or the failure modes are understood and acceptable — for **real orders, not just test calls.**

## Phase 1 — Single-tenant MVP, productized

**Goal:** the same loop as Phase 0, but built as a real service instead of the fastest thing that worked. This is what Phase 2's multi-tenant layer gets built on top of.

- [ ] Scaffold the repo per the structure in `CLAUDE.md` (`/apps/dashboard`, `/services/*`, `/packages/shared`). Fill in the real dev/test/lint/typecheck commands in `CLAUDE.md` as you go.
- [ ] Move the hardcoded Phase 0 menu/config into a proper (still single-tenant) config schema — **this schema becomes the tenant config table in Phase 2, so get the shape right here.**
- [ ] Formalize the order engine as its own service with a clear API, not glue code.
- [ ] Formalize the POS bridge as an adapter (`submitOrder(tenantId, normalizedOrder)`), gated on `orderStatus === 'paid'`.
- [ ] Add the Twilio Pay fallback for voice-only callers who won't/can't receive the SMS payment link.
- [ ] Handle the messy cases explicitly: declined card, abandoned payment link (what happens to the order after N minutes unpaid?), front-desk transfer with no answer, FAQ question outside the knowledge base.
- [ ] No dashboard yet. Logs and direct DB queries are fine for visibility at this stage.

## Phase 2 — Multi-tenant config layer + basic dashboard

**Goal:** onboard a second and third restaurant without copy-pasting code.

- [ ] Build the tenant config table: menu, hours, POS type + credentials, front-desk number, FAQ entries, payment processor account, phone/SMS numbers.
- [ ] Confirm **zero business logic is tenant-specific in code** — everything branches off config.
- [ ] Basic owner dashboard: call logs, order history, POS sync status. No self-serve editing yet — that's Phase 3.
- [ ] Onboard 2–3 more restaurants manually (you do the config data entry, not them).
- [ ] Watch for the first real **cross-tenant bug** — something that only breaks because two tenants now share infrastructure. These are the bugs Phase 0–1 can't surface.

## Phase 3 — Self-serve configurability + full analytics

**Goal:** an owner can onboard and run this without you touching a database.

- [ ] Owner-editable menu, hours, FAQ entries through the dashboard.
- [ ] Full analytics: containment rate, payment conversion, missed/abandoned calls, front-desk transfer answer rate, average order value, POS sync reliability, busiest hours.
- [ ] Onboarding flow that doesn't require you personally in the loop for a new restaurant.
- [ ] Billing for the SaaS itself (usage pass-through plus flat fee, or whatever you land on — see `PRICING.md`).

## Phase 4 — Expand

**Goal:** only start once Phase 3 is running unattended for multiple tenants.

- [ ] Expand POS coverage — build and certify a new direct adapter whenever a real sales opportunity needs one, **not speculatively ahead of demand.**
- [ ] Outbound flows: reservation reminders, win-back SMS.
- [ ] Evaluate expanding the same core (router + order/booking engine + payment + config-driven tenants) beyond restaurants — salons, auto shops, anything with phone/text intake — using the same platform, not a rebuild.

## Open decisions to revisit

Not blocking, but unresolved and worth a deliberate answer rather than a default:

- Which POS to build next after Toast/Clover/Square, prioritized against actual sales demand rather than built speculatively.
- Whether the cheap-component Vapi stack (Deepgram/Cartesia/fast-tier LLM) holds up on quality and latency at real volume, or specific components need upgrading.
