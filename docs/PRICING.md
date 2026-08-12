# Pricing & Business Plan

*Originally prepared by Stacy for Adam Wehbi — July 2026.*

Relevant whenever a feature decision has a pricing or billing implication (usage caps, minimums, overage rates) — check here before hardcoding a rate anywhere. Priced on two architecture decisions (see [ARCHITECTURE.md](ARCHITECTURE.md)): voice runs on our own Vapi-based stack, and POS integration is direct per system, not through an aggregator.

## Competitive landscape (real pricing, not guesses)

The market hasn't settled on one model — flat subscription, per-order, and per-conversation all coexist.

| Competitor | Model | Price | Notes |
|---|---|---|---|
| Loman AI | Flat subscription | $199/mo + $149 setup; POS injection from $299/mo | No per-minute fees, no call caps |
| RingFoods | Flat subscription | $200/mo | 300–500 calls/mo, no contract, 30-min setup |
| Certus AI | Flat, tiered | ~$99–499/mo by volume | YC-backed, tight restaurant focus |
| Bite Buddy AI | Per completed order | $1.50/order | No monthly minimum, no setup fee — pure usage |
| BiteBerry | Flat + percentage | $149/mo + 5% of order value | 5% pitched against 20–30% delivery-app commissions |
| Revmo AI | Per conversation | $0.59/conversation | Reservations/FAQ-weighted, not full ordering+POS |

**Takeaway:** serious competitors land between **$199–$500/mo** for a single location. The per-order and per-conversation models (Bite Buddy, Revmo) are the exception, and they have a weakness worth exploiting in the pitch — under them, a restaurant's cost grows linearly with its own success, with no ceiling. A flat tier with a usage cap and a modest overage rate gives an owner a **predictable** bill, which is what most of them actually want.

## Unit economics — what this costs us to run

Removing the aggregator removes the ~$100/mo per-location fee that used to be the single biggest line item, at the cost of real upfront engineering (4–8 weeks per POS, three needed for Phase 0). That engineering cost is **founder/dev time, not a recurring cash line** — budget it separately; it doesn't appear in the monthly COGS below.

| Cost driver | Rate | Source |
|---|---|---|
| Voice — Vapi orchestration | ~$0.05/min | Vapi |
| Voice — STT (Deepgram Nova-3, streaming) | ~$0.0077/min | Deepgram 2026 |
| Voice — TTS (Cartesia Sonic) | ~$0.01–0.015/min of AI speech | Cartesia 2026 |
| Voice — LLM (cheap fast-tier, order extraction) | ~$0.02–0.03/min | Gemini Flash-Lite / DeepSeek-class 2026 |
| Voice — Twilio telephony | ~$0.015/min blended | Twilio |
| **Voice, all-in (optimized components)** | **~$0.10–0.12/min** | sum of above |
| SMS (Twilio, with carrier surcharge) | ~$0.013/segment effective | Twilio 2026 |
| Phone number | ~$1.15/mo | Twilio |
| POS integration (direct) | $0 recurring/location once built; 4–8 wks build + ongoing maintenance per POS | internal |
| Payment processing (Stripe) | 2.9% + $0.30/txn — **passed through** at checkout, not absorbed | Stripe 2026 |

Two things drive these numbers:

1. The voice minute only lands at **$0.10–0.12/min if components are chosen on purpose.** Default to a frontier LLM and ElevenLabs-grade TTS and the same stack runs **$0.15–0.40/min.**
2. Dropping the aggregator cuts **fixed cost per location from ~$101 to ~$1.15** (just the phone number). That's why every plan's margin looks better than earlier drafts, and why the minimums can come down too.

## The plan menu — a rate card, not three numbers

Dropping the aggregator makes it worth building an actual product menu: a **base capability tier** (what the AI is allowed to do on a call) crossed with **usage line items** (orders, FAQ/transfer calls, SMS), each priced on its own. That's how an owner thinks about a bill — "what am I getting, and what do I pay for more of it" — not a single blended rate.

**Three plans**, ordered by capability. Three is the conversion sweet spot (~41% of successful SaaS companies land there); an earlier four-plan draft split "Full Line" from "Full Line + Analytics," a distinction most owners wouldn't value enough to justify two line items.

### Order Line — order-taking only

The AI answers, takes the order over voice or SMS, collects payment before it hits the POS, pushes it in. Anything that isn't an order (a question, a request for a person) forwards straight to the restaurant's existing line — the AI doesn't attempt FAQ or transfer logic on this plan, it just stays out of the way of calls it isn't handling. Cheapest, simplest, closest match to what Bite Buddy sells.

- **$1.50 per completed order, $49/month minimum**
- Order-confirmation SMS (payment link + confirmation) included
- Optional pickup-ready text: $0.05/message if turned on

### Full Line — everything *(recommended for a single-location owner)*

FAQ answering, front-desk transfer, the full analytics dashboard (containment, payment conversion, AOV, busiest hours), self-serve menu/hours editing, multiple staff logins, and an optional SMS win-back add-on. Marked "recommended" on the offer page — it's genuinely the best fit for most single-location owners, not just the one that pays best.

- **$1.50 per completed order, $150/month minimum**
- 350 FAQ/transfer calls/month included, $0.30/call after
- Order-flow SMS included; pickup-ready text $0.04/message; SMS win-back/marketing $0.04/message as an add-on

### Multi-Location — Full Line, per location

Everything in Full Line, per location, with a **3-location minimum commitment.** Adds a multi-location roll-up dashboard, dedicated account support, and priority build-out if a location runs a POS we haven't integrated yet.

- **$1.25 per completed order per location, $139/month minimum per location**
- 250 FAQ/transfer calls/location/month, **pooled** across locations, $0.25/call after (pooled)
- SMS terms same as Full Line, pooled

## Pricing rationale & the margin trap to know about

Every minimum is sized so cost stays covered at **every** order volume — including the band right before per-order revenue overtakes the flat minimum. That specific band is the gap that can quietly make a mid-volume customer unprofitable while they still pay the "minimum."

- **Multi-Location's $139/location** clears that bar with room to spare.
- **Full Line's $150 doesn't quite.** The fully-safe number for its 350-call allowance is ~$155, so at $150 there's a narrow band — roughly **90–103 orders/month** — where margin dips a few dollars negative before per-order billing pulls it back positive. Small (under $4/month at the worst point) and easy to live with, but know it's there rather than assuming $150 closes the gap.

**Why $1.50/order sits on both Order Line and Full Line:** it's the number the market (Bite Buddy) already charges, so it's right wherever we compete head-on. The difference between the plans is **capability, not the per-order rate** — Full Line's higher minimum reflects the FAQ/transfer volume it absorbs, not a markup on orders.

**Worked example** — 4 locations on Order Line, 100 orders/mo each: 100 × $1.50 = $150/location, identical to Bite Buddy at that volume. We're not more expensive at all now that the aggregator fee is gone — full price parity on the plan built to compete with them directly, while Full Line is where the extra capability (and revenue) lives.

**Two models to skip:**

- **Percentage-of-order-value** (BiteBerry) — exposes our revenue to the restaurant's own menu pricing, and it's a harder number for an owner to justify to themselves when raising a burger's price means our cut goes up for no added work.
- **Setup fees, for now** — waive them for at least the first several customers (matches Bite Buddy's "$0 setup," easy differentiator vs. Loman's $149). No onboarding-friction cost worth charging for yet, and a case study matters more than an extra $150.

## Go-to-market

Phase 0 of the roadmap **is** the go-to-market plan: Canteen and Heights are the pilot. Once it runs clean for a few weeks, you have what almost no competitor can put in a sales conversation — real before/after numbers from an actual owner-operator, not a demo. *"We recovered X missed calls and $Y in incremental order revenue last month"* closes deals a feature list doesn't.

- **Cheapest customers to get** are closest to you: other independent owners in your local network, and — underused — **local POS resellers and installers.** The people who sell/install Toast/Clover/Square terminals already have a book of restaurant relationships and often work on referral commission; a warm intro is worth more than any ad spend at this stage.
- **Broader marketing** (local SEO, owner Facebook groups/forums) comes *after* 5–10 paying customers and a repeatable onboarding process, not before.
- **Don't chase enterprise/chain accounts early.** They move slowly, want custom contracts and SLAs we're not set up for, and often have vendors locked in. Independent and small multi-location (2–10 unit) operators are the target: they feel missed calls as lost revenue, make the buying decision themselves, and are the customer profile you already are.

## What actually limits growth — be honest

You're building this nights and weekends on top of a full-time platform engineering job and running three stores. **That's the real constraint, not the market or the tech.** Phase 2's "onboard 2–3 more restaurants manually" is fine at that scale; it stops being fine well before 15–20 customers, because config entry, support, and POS troubleshooting all need a human who isn't you — or a self-serve onboarding flow that doesn't exist until Phase 3. Budget for that honestly rather than assuming the product scales just because the architecture does.

Other real risks worth naming:

- **We own the voice stack.** Building on Vapi means we own uptime, latency tuning, and vendor swaps (STT/TTS/LLM outages or price changes) — no managed platform's SLA to fall back on.
- **We own three POS certifications up front** (Toast, Clover, Square) plus ongoing maintenance as each versions its API.
- **POS coverage is a hard sales constraint** — a restaurant on a POS we haven't built simply can't be onboarded, full stop.
- **Certus AI is YC-backed** and better capitalized — matters if this becomes a price war.
- **A2P 10DLC approval** has a real lead time that can stall a launch date if not started early.
- **A payment-redaction failure** (card data leaking into a transcript or recording) isn't a bug, it's a liability event — treat that code path with more paranoia than anything else in the system.

## Year-1 shape (a sanity check, not a forecast)

If Phase 0–2 land ~10 paying locations by month 6–9 (a mix of Order Line, Full Line, maybe one small multi-location deal), blended ARPU ~$280–300/mo/location → roughly **$2,800–3,000/mo revenue against ~$1,100/mo vendor cost** across those locations. A meaningfully healthier margin than the aggregator-based version, mostly because the ~$100/location fixed cost that used to dominate is gone. Lower blended revenue than earlier estimates, better margin percentage. **The point of year one isn't margin — it's proving the retention and support model holds** — but at least the unit economics stop being a source of anxiety while you do that.

## Sources

- [Loman AI Pricing](https://loman.ai/pricing)
- [RingFoods vs Top AI Phone Agents 2026](https://www.ringfoods.com/blog/ringfoods-vs-loman-slang-restohost-more-2026-ai-phone-agent-comparison)
- [Certus AI — Shyft](https://shyft.ai/tools/certus-ai)
- [Bite Buddy AI — Restaurant AI Cost & Pricing Guide 2026](https://bitebuddy.ai/blog/restaurant-ai-cost)
- [BiteBerry — 2026 Restaurant Revolution](https://biteberry.com/2025/12/25/the-2026-restaurant-revolution-how-biteberry-ai-voice-ordering-eliminates-200k-in-lost-revenue/)
- [Revmo AI — Restaurants](https://revmo.ai/restaurants/)
- [Twilio SMS API cost breakdown 2026](https://apidog.com/blog/twilio-sms-api-cost/)
- [Stripe fees explained 2026](https://checkoutpage.com/blog/stripe-processing-fees)
