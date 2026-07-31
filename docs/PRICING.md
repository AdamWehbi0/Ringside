# Pricing & Business Plan — Voice + SMS Ordering Platform

*Prepared by Stacy for Adam Wehbi — July 2026*

## Competitive landscape (actual pricing, not guesses)

I pulled real pricing where I could find it. It's a mixed bag of models — flat subscription, per-order, per-conversation — which tells you the market hasn't settled on one answer yet.

| Competitor | Pricing model | Actual price | Notes |
|---|---|---|---|
| Loman AI | Flat subscription | $199/mo + $149 one-time setup; POS order injection from $299/mo | No per-minute fees, no call caps |
| RingFoods | Flat subscription | $200/mo | 300-500 calls/mo, no contract, 30-min setup |
| Certus AI | Flat subscription, tiered | Reported $99-499/mo depending on volume | YC-backed, tight restaurant focus |
| Bite Buddy AI | Per completed order | $1.50/order | No monthly minimum, no setup fee — pure usage |
| BiteBerry | Flat + percentage | $149/mo + 5% of order value | 5% pitched against 20-30% delivery-app commissions |
| Revmo AI | Per conversation | $0.59/conversation | Reservations/FAQ-weighted, not full ordering+POS |

Takeaway: most serious competitors land between $199-$500/mo for a single location. The per-order and per-conversation models (Bite Buddy, Revmo) are the exception, not the norm, and they have a real weakness worth exploiting in your sales pitch — a restaurant owner's cost grows linearly with their own success under those models, with no ceiling. A flat tier with a usage cap and a modest overage rate gives an owner a bill they can predict, which is what most of them actually want.

## Unit economics — what this actually costs you to run

This is priced on two decisions: voice runs on our own Vapi-based stack, not a managed platform like Retell (see `docs/ARCHITECTURE.md`), and POS integration is direct per POS system, not through an aggregator like ItsaCheckmate — which removes the ~$100/mo per-location fee that was previously the single biggest line item in this table, at the cost of real upfront engineering time to build and certify each POS integration (4-8 weeks per system, three of them — Toast, Clover, Square — needed just for Phase 0). That engineering cost is real but it's not a recurring cash line, so it doesn't show up in the monthly COGS table below the way the aggregator fee did — budget for it separately as founder/dev time, not vendor spend.

| Cost driver | Rate | Source |
|---|---|---|
| Voice — Vapi orchestration | ~$0.05/min | Vapi pricing |
| Voice — STT (Deepgram Nova-3, streaming) | ~$0.0077/min | Deepgram 2026 pricing |
| Voice — TTS (Cartesia Sonic) | ~$0.01-0.015/min of actual AI speech | Cartesia 2026 pricing |
| Voice — LLM (cheap fast-tier model for order extraction) | ~$0.02-0.03/min, if we deliberately pick a cheap model | Gemini Flash-Lite / DeepSeek-class 2026 pricing |
| Voice — Twilio telephony | ~$0.015/min blended | Twilio pricing |
| **Voice, all-in (optimized components)** | **~$0.10-0.12/min** | sum of the above |
| SMS (Twilio, with carrier surcharge) | ~$0.013/segment effective | Twilio 2026 pricing |
| Phone number | ~$1.15/mo | Twilio |
| POS integration (direct) | $0 recurring per location once built; 4-8 weeks of build/certification time per POS system, plus ongoing maintenance as each POS versions its API | internal estimate |
| Payment processing (Stripe) | 2.9% + $0.30/transaction — passed through to the customer at checkout, not absorbed | Stripe 2026 pricing |

That voice number only lands at $0.10-0.12/min if the components are chosen on purpose — default to a frontier-tier LLM and ElevenLabs-grade TTS instead, and the same stack runs $0.15-0.40/min. Removing the aggregator fee is the bigger structural change here: fixed monthly cost per location drops from roughly $101 to about $1.15 (just the phone number), which is why every plan's margin below looks meaningfully better than earlier versions of this doc, and why the minimums needed to protect against a slow month can come down too.

## The plan menu — think of it as a rate card, not just three numbers

Dropping the aggregator changes the economics enough that it's worth building this like an actual product menu instead of one abstract per-order number: a base capability tier (what the AI is allowed to do on a call) crossed with usage-based line items (orders, FAQ/transfer calls, SMS) that are each priced on their own. That's how a restaurant owner actually thinks about a bill — "what am I getting, and what do I pay for more of it" — not a single blended rate.

Three plans, ordered by capability — collapsed from an earlier four-plan draft down to three after checking the research on tier structure: three is the actual conversion sweet spot (roughly 41% of successful SaaS companies land there), and the earlier split between "Full Line" and "Full Line + Analytics" was a distinction most owners wouldn't have valued enough to justify two separate line items.

**Order Line** — order-taking only. The AI answers, takes the order over voice or SMS, collects payment before it hits the POS, pushes it in. Anything that isn't an order (a question, a request for a person) gets forwarded straight to the restaurant's existing line — the AI doesn't attempt FAQ or transfer logic on this plan, it just doesn't get in the way of calls it's not handling. Cheapest, simplest, closest direct match to what Bite Buddy sells.

- $1.50 per completed order, $49/month minimum
- Order-confirmation SMS (payment link + confirmation) included
- Optional pickup-ready text: $0.05/message if turned on

**Full Line** — everything: FAQ answering, front-desk transfer, the full analytics dashboard (containment rate, payment conversion, average order value, busiest hours), self-serve menu/hours editing, multiple staff logins, and an optional SMS win-back campaign add-on. This is the recommended plan for a single-location owner, and it's marked that way on the offer page — it's genuinely the best fit for most of them, not just the one that pays best.

- $1.50 per completed order, $150/month minimum
- 350 FAQ/transfer calls/month included, $0.30/call after
- Order-flow SMS included; pickup-ready text $0.04/message; SMS win-back/marketing campaigns $0.04/message as an add-on

**Multi-Location** — everything in Full Line, per location, with a 3-location minimum commitment. Adds a multi-location roll-up dashboard, dedicated account support, and priority build-out if a location runs a POS we haven't integrated yet.

- $1.25 per completed order per location, $139/month minimum per location
- 250 FAQ/transfer calls/location/month, pooled across locations, $0.25/call after (pooled rate)
- SMS terms same as Full Line, pooled

Every minimum is meant to be sized so cost stays covered at every order volume, including the specific band right before the per-order rate overtakes the flat minimum — that's the exact gap that let a mid-volume customer quietly lose you money even while paying the "minimum" earlier in this doc. Multi-Location's $139/location clears that bar with room to spare. Full Line's $150 doesn't quite — the fully-safe number for its 350-call allowance is closer to $155, so at $150 there's a narrow band, roughly 90-103 orders/month, where margin dips a few dollars negative before per-order billing pulls it back positive. It's small (under $4/month at the worst point) and easy to live with, but worth knowing it's there rather than assuming $150 closes the gap the way the earlier $169 and $219 numbers were built to.

$1.50/order sits on both Order Line and Full Line, which isn't an accident: it's the number that already matches what the market (Bite Buddy) charges, so it's the right price wherever we're competing head-on for a customer's attention. The difference between the two plans is capability, not the per-order rate — Full Line's higher minimum reflects the FAQ/transfer call volume it absorbs, not a markup on orders themselves.

Worked example — 4 locations on Order Line, 100 orders/month each: 100 × $1.50 = $150/location, identical to Bite Buddy's own rate at that volume. We're not more expensive here at all now that the aggregator fee is gone — full price parity on the plan built to compete with them directly, while Full Line is where the extra capability (and revenue) lives for owners who want more than bare-bones ordering.

Skip a straight percentage-of-order-value model (what BiteBerry does) — it exposes your revenue to the restaurant's own menu pricing in a way a per-order flat fee doesn't, and it's a harder number for an owner to explain to themselves when they raise the price of a burger and your cut goes up for no added work on your end.

Waive the setup fee for at least the first several customers (matches Bite Buddy's "$0 setup" positioning and is an easy differentiator against Loman's $149 setup fee) — you don't have onboarding friction costs worth charging for yet, and a case study matters more right now than an extra $150.

## Go-to-market

Phase 0 of the build roadmap already is the go-to-market plan: Canteen and Heights are the pilot. Once that's running clean for a few weeks, you have something almost none of your competitors can put in a sales conversation — real before/after numbers from an actual owner-operator, not a demo. "We recovered X missed calls and Y dollars in incremental order revenue last month" closes deals that a feature list doesn't.

From there, the cheapest customers to get are the ones closest to you: other independent restaurant owners in your local network, and — an underused channel worth taking seriously — local POS resellers and installers. The people who sell and install Toast/Clover/Square terminals for a living already have a book of restaurant relationships and often work on referral commission; a warm intro from someone who already has the owner's trust is worth more than any ad spend at this stage. Broader marketing (local SEO, restaurant owner Facebook groups and forums) comes after you have 5-10 paying customers and a repeatable onboarding process, not before.

Don't chase enterprise/chain accounts early. They move slowly, want custom contracts and SLAs you're not set up to offer yet, and often already have vendor relationships locked in. Independent and small multi-location (2-10 unit) operators are the right target: they feel missed calls as real lost revenue, they make the buying decision themselves, and they're the customer profile you already are.

## What actually limits growth here — be honest about it

You're building this nights and weekends on top of a full-time platform engineering job and running three stores. That's the real constraint, not the market or the tech. Phase 2's "onboard 2-3 more restaurants manually" is fine at that scale; it stops being fine well before 15-20 customers, because config entry, support requests, and POS troubleshooting all require a human who isn't you, or a self-serve onboarding flow that doesn't exist until Phase 3. Budget for that honestly in your own timeline rather than assuming the product scales just because the architecture does.

Other real risks worth naming rather than glossing over: building the voice stack ourselves on Vapi means we own uptime, latency tuning, and vendor swaps (STT/TTS/LLM outages or price changes) ourselves — a managed platform's SLA doesn't exist to fall back on; building POS integrations direct means we own three separate certification processes up front (Toast, Clover, Square) and ongoing maintenance as each vendor versions their API, instead of an aggregator absorbing that; POS coverage is now a hard constraint on who we can sell to — a restaurant on a POS we haven't built yet simply can't be onboarded, full stop; Certus AI is YC-backed and better capitalized than you, which matters if this becomes a price war; A2P 10DLC approval has a real lead time that can stall a launch date if it's not started early; and a payment-redaction failure (card data leaking into a transcript or recording) isn't just a bug, it's a liability event — treat that code path with more paranoia than anything else in the system.

## Year-1 shape, roughly

Not a forecast, a sanity check: if Phase 0-2 land 10 paying locations by month 6-9 (a mix across Order Line, Full Line, plus maybe one small multi-location deal), blended average revenue per location around $280-300/mo, that's roughly $2,800-3,000/mo in revenue against maybe $1,100/mo in vendor cost across those locations — a meaningfully healthier margin than the aggregator-based version of this plan, mostly because the ~$100/location fixed cost that used to dominate every calculation here is gone. Lower blended revenue than the earlier estimate, better margin percentage — the point of year one still isn't margin, it's proving the retention and support model holds, but at least the unit economics stop being a source of anxiety while you do that.

Sources:
- [Loman AI Pricing](https://loman.ai/pricing)
- [RingFoods vs Top AI Phone Agents 2026](https://www.ringfoods.com/blog/ringfoods-vs-loman-slang-restohost-more-2026-ai-phone-agent-comparison)
- [Certus AI — Shyft](https://shyft.ai/tools/certus-ai)
- [Bite Buddy AI — Restaurant AI Cost & Pricing Guide 2026](https://bitebuddy.ai/blog/restaurant-ai-cost)
- [BiteBerry — 2026 Restaurant Revolution](https://biteberry.com/2025/12/25/the-2026-restaurant-revolution-how-biteberry-ai-voice-ordering-eliminates-200k-in-lost-revenue/)
- [Revmo AI — Restaurants](https://revmo.ai/restaurants/)
- [Twilio SMS API cost breakdown 2026](https://apidog.com/blog/twilio-sms-api-cost/)
- [Stripe fees explained 2026](https://checkoutpage.com/blog/stripe-processing-fees)
