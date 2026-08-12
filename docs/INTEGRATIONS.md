# Integrations — the A-Z of what we wire together

Every external service in the stack: **what it handles, what we build around it, what account/registration it needs, and how long that takes.** This is the reference for "who does what." Design rationale for *why* each vendor was chosen lives in [ARCHITECTURE.md](ARCHITECTURE.md); this doc is the operational map.

Rule of thumb for the whole table: **vendors handle transport and specialized ML; we own the order logic, the money gate, and the tenant config.** Nothing vendor-specific leaks into our core — every one of these sits behind an interface or a webhook handler we control.

## At a glance

| Layer | Vendor | Handles | We build | Account / lead time |
|---|---|---|---|---|
| Telephony (number, dial, transfer) | **Twilio Voice** | The phone number, call media, `<Dial>` transfer, `<Pay>` DTMF | Number provisioning per tenant, transfer target in config | Instant (self-serve) |
| Voice orchestration | **Vapi** | Turn-taking, barge-in, routing STT↔LLM↔TTS, tool-call dispatch | Assistant config, the webhook server (router + tools) | Instant (self-serve) |
| STT | **Deepgram Nova-3** | Speech → text, streaming | Nothing — configured inside Vapi (bring-your-own key) | Instant (API key) |
| TTS | **Cartesia Sonic** | Text → speech, low-latency | Nothing — configured inside Vapi (bring-your-own key) | Instant (API key) |
| LLM (order extraction) | **Fast-tier model** (Gemini Flash-Lite / DeepSeek-class) | Function-call extraction of order intent | The tool/function schema it calls against | Instant (API key) |
| SMS | **Twilio Programmable Messaging** | Send/receive texts, delivery | SMS webhook handler, the constrained order state machine | **A2P 10DLC: ~2 weeks** ⚠️ |
| Payments (primary) | **Stripe** | Hosted checkout page, card handling, payout | Per-order Checkout Session, the `checkout.session.completed` webhook | Instant; live keys after business verification |
| Payments (voice fallback) | **Twilio `<Pay>` + Pay Connector** | PCI DTMF card capture, redaction, hand-off to Stripe | `<Pay>` flow + connector config | Connector setup |
| POS (first) | **Toast** | Injecting the paid order into the kitchen | `ToastAdapter` behind `submitOrder()` | **Partner cert: 4–8 weeks** ⚠️ |
| POS (later) | **Square, Clover** | Same, per POS | `SquareAdapter`, `CloverAdapter` | 4–8 weeks each ⚠️ |
| Owner auth | **Clerk** | Login, orgs, roles, sessions | Map Clerk org → `tenant_id`, route guards | Instant |
| Database | **Postgres** | Storage | Schema, `tenant_id` on every table, RLS policies | Instant (Railway/Fly/Neon) |
| Hosting | **Vercel** (dashboard) · **Railway/Fly** (services) | Deploy/runtime | CI, env/secret management | Instant |

⚠️ = **on the critical path** — has real external lead time and blocks go-live. Start these before writing the code that depends on them.

## Critical path — start these first (they gate the pilot)

1. **Toast partner registration + certification — 4–8 weeks.** Apply to the Toast Partner Integrations program, get sandbox credentials from their integrations team, build + test the adapter against sandbox, then schedule a **certification call** before production access is granted. This is the single longest pole. ([Toast partner overview](https://doc.toasttab.com/doc/devguide/apiPartnerIntegrationOverview.html), [integration process](https://doc.toasttab.com/doc/devguide/integrationDevProcess.html))
2. **Twilio A2P 10DLC — ~2 weeks.** Brand approval is usually minutes (up to 7 days if flagged for manual review); **campaign approval is currently running 10–15 days.** SMS gets filtered/blocked until this clears. ([Twilio A2P quickstart](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart))

Everything else is self-serve and can be stood up in an afternoon. These two can't.

---

## Voice path

### Twilio Voice — the line itself
Owns the phone number, the call audio, transfers, and DTMF. We buy one number per tenant and **import it into Vapi** (Vapi needs the Twilio Account SID + Auth Token). The front-desk transfer is a Twilio `<Dial>` to the store's existing line with a ~15–20s timeout fallback. ([Vapi: import Twilio number](https://docs.vapi.ai/phone-numbers/import-twilio))

### Vapi — the orchestrator (our main integration surface)
Vapi runs the real-time loop and calls **our server** via a configured **server URL** for every meaningful event. What we build against it:

- **Tools (function-calls)** — the router's branches are Vapi tools: `startOrder`, `answerFAQ`, `transferToFrontDesk`. When the assistant invokes one, Vapi POSTs our server a payload with a `toolCallId`; we respond with a matching `result`. Order extraction is the LLM calling our order tool with structured items → feeds `validateOrder`. ([Vapi custom tools](https://docs.vapi.ai/tools/custom-tools))
- **Default tools** Vapi provides out of the box: `transferCall`, `endCall`, `sms`, `dtmf`, `apiRequest`. ([default tools](https://docs.vapi.ai/tools/default-tools))
- **Server events** — transcripts, tool-calls, and the **end-of-call report** all arrive at our server URL. Priority: tool > assistant > phone-number > org URL. ([server events](https://docs.vapi.ai/server-url/events))
- **Latency budget** — the `assistant-request` webhook must resolve **within ~7.5s** (telephony enforces a ~15s cap). Our tool handlers (menu validation) run inside the call, so they must be fast — sub-second. ([server URL](https://docs.vapi.ai/server-url))
- **STT/TTS/LLM are Vapi config, not separate integrations for us** — we select Deepgram (transcriber), Cartesia (voice), and the fast-tier LLM in the assistant config with our own API keys. Swapping one is a config change, which is the whole point of building on Vapi. ([Deepgram × Vapi](https://deepgram.com/partners/vapi))

### Deepgram Nova-3 (STT) & Cartesia Sonic (TTS)
No direct integration work — they live inside the Vapi assistant config. We just supply API keys and pick the model/voice. Boost domain terms (menu item names) as Deepgram keywords to cut misrecognition.

## SMS path

### Twilio Programmable Messaging + A2P 10DLC
Handles inbound/outbound texts: the order-confirmation + **payment link**, pickup-ready texts, and (later) win-back campaigns. We build the **SMS webhook handler** and run SMS ordering as a **constrained state machine** (structured prompts, LLM only to parse free-text replies) — not free-form chat.

**A2P 10DLC** is mandatory and is the SMS critical-path item: Trust Hub customer profile → register a Brand → register a Campaign. Do this in week one. ([Twilio A2P registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/direct-standard-onboarding))

## Payment path

### Stripe — primary, both channels
The moment an order is confirmed, we create a **Checkout Session** (the 2026-recommended API over static Payment Links, because each order has a dynamic amount) and text the hosted URL. Card entry happens on Stripe's page — **SAQ A, card data never touches us.** ([Stripe 2026 guide](https://www.digitalapplied.com/blog/stripe-payment-integration-developer-guide-2026))

What we build — the **Stripe webhook**, and it's the linchpin of hard rule 1:
- Listen for **`checkout.session.completed`** → flip the order `pending_payment → paid` → trigger the POS bridge. ([webhook guide](https://www.magicbell.com/blog/stripe-webhooks-guide))
- **Verify the signature** on every event.
- **Idempotency, two layers** — a deterministic `Idempotency-Key` when we create the session, and a **unique constraint on `event.id`** on receipt. The event can fire more than once; without dedup you submit the same order to the POS twice. ([idempotency](https://dev.to/whoffagents/stripe-webhook-security-signature-verification-idempotency-and-local-testing-1lk3))
- Trust the **webhook, not the browser redirect** — the redirect can be lost if the caller's connection drops mid-call.

### Twilio `<Pay>` — voice-only fallback
For callers who won't/can't receive the text. `<Pay>` captures card digits via **DTMF in PCI mode with automatic redaction** (audio muted, digits stripped from recording/transcript) and hands them to Stripe through a **Twilio Pay Connector** — Stripe doesn't bridge to Twilio voice on its own. Same rule: the agent **never** asks the caller to say the number aloud. ([Twilio `<Pay>`](https://www.twilio.com/docs/voice/twiml/pay), [PCI agent-assisted pay](https://www.twilio.com/en-us/blog/voice-agent-assisted-pay))

## POS path — the actual hard part

One interface, `submitOrder(tenantId, normalizedOrder)`, gated on `orderStatus === 'paid'`. One adapter per POS; the order engine never knows which POS a tenant runs — the adapter registry resolves it from tenant config.

### Toast (first — Canteen/Heights + the pilot)
- **Auth:** client-credentials OAuth, GUID-scoped tokens issued per restaurant the customer shares with us.
- **Capability:** order injection + menu sync (we pull the live menu to seed/validate against, we push the paid order).
- **Process:** partner application → sandbox creds from Toast → build/test → certification call → production. ([how to build a Toast integration](https://doc.toasttab.com/doc/devguide/portalHowToBuildAToastIntegration.html))

### Square (later)
`POST /v2/orders` (Orders API) creates the order with line items and modifiers; **Square Payments pairs with Square POS**, so a Square tenant collects payment through Square, not Stripe. OAuth per seller. ([Square Orders API](https://developer.squareup.com/docs/orders-api/what-it-does))

### Clover (later)
Custom-orders API for injection; OAuth per merchant. ([Clover custom orders](https://docs.clover.com/dev/docs/creating-custom-orders))

Menu shapes, modifier models, and error semantics differ across all three — **normalizing them behind one `NormalizedOrder` is exactly the adapter's job.**

## Platform / cross-cutting

### Clerk — owner auth & tenancy
Owners log in via Clerk. A **Clerk Organization maps to a `tenant_id`**; members + roles give us per-store staff logins and RBAC with almost no custom UI. Note Clerk is a user-first model with orgs layered on — keep `tenant_id` as *our* canonical key in Postgres and treat Clerk as the identity source, not the tenancy source of truth. ([Clerk organizations](https://clerk.com/organizations))

### Postgres + Row-Level Security
Shared-schema multi-tenancy: every table carries `tenant_id`, RLS enforced at the DB layer so a query can't cross tenants even if app code slips. Set the tenant on the connection/session; write RLS policies before the second tenant exists, not after.

### Hosting & secrets
Dashboard on **Vercel**; webhook services (voice, SMS, Stripe, order engine) on **Railway or Fly.io** — they need to be always-on to answer webhooks inside the latency budget. All vendor keys (Vapi, Deepgram, Cartesia, LLM, Twilio, Stripe, Toast) live in per-environment secret storage, **never in the repo**, and POS/payment credentials are **per-tenant** rows, encrypted.

---

## End-to-end: a voice order, happy path

```
Caller → Twilio number → Vapi assistant
  Vapi → [our server URL] router tool → startOrder
  Caller speaks items → Deepgram STT → LLM function-call (extract items)
  Vapi → [our server URL] order tool → validateOrder(menu, requested)
       → normalized order, status=confirmed → read back total via Cartesia TTS
  Caller confirms → order engine: status=pending_payment
  → Stripe Checkout Session created → Twilio SMS sends hosted link
  Caller pays on Stripe page
  Stripe → [our Stripe webhook] checkout.session.completed (verified, deduped)
       → status=paid
  Order engine: assertSubmittable(paid) ✓ → submitOrder(tenantId, order)
  → ToastAdapter → order appears on the kitchen line
```

If the caller won't text: swap the Stripe-link step for Twilio `<Pay>` DTMF → Stripe via Pay Connector → same `paid` transition.

## Webhook endpoints we must expose (our surface area)

| Endpoint | Source | Job |
|---|---|---|
| `/vapi/events` | Vapi | Router + order/FAQ/transfer tool-calls, transcripts, end-of-call report. Respond < 7.5s. |
| `/sms/inbound` | Twilio Messaging | SMS ordering state machine + reply handling |
| `/stripe/webhook` | Stripe | `checkout.session.completed` → `paid` → POS. Signature-verified, idempotent. |
| `/twilio/pay-status` | Twilio `<Pay>` | Voice-payment result → `paid` |
| `/toast/*` (if used) | Toast | Order-status / menu-update callbacks |

## Accounts & credentials checklist

- [ ] Twilio account → 1 pilot number, Account SID + Auth Token (for Vapi import)
- [ ] Twilio Trust Hub → **A2P 10DLC** Brand + Campaign ⚠️
- [ ] Twilio Pay Connector → bridge to Stripe (voice fallback)
- [ ] Vapi account + API key; assistant configured with the three tools
- [ ] Deepgram API key (Nova-3)
- [ ] Cartesia API key (Sonic)
- [ ] Fast-tier LLM API key (Gemini Flash-Lite / DeepSeek-class)
- [ ] Stripe account (live keys after business verification) + webhook signing secret
- [ ] **Toast Partner Integrations** application → sandbox creds → certification ⚠️
- [ ] (later) Square + Clover partner/OAuth apps
- [ ] Clerk application (Organizations enabled)
- [ ] Postgres instance (Railway/Fly/Neon) with RLS
- [ ] Vercel project + Railway/Fly service(s)

## Open integration questions

- Which Toast APIs specifically for the live menu pull vs. order push, and their rate limits — pin down once sandbox creds are in hand.
- Whether Vapi's built-in `sms` tool is enough for the payment-link send, or we route SMS through our own Twilio handler for logging/idempotency (likely the latter, so the payment link is auditable).
- Twilio Pay Connector for Stripe: use Twilio's native Stripe connector vs. a custom connector — decide when we build the voice fallback (Phase 1).

## Sources

- Vapi: [server URLs](https://docs.vapi.ai/server-url), [server events](https://docs.vapi.ai/server-url/events), [custom tools](https://docs.vapi.ai/tools/custom-tools), [default tools](https://docs.vapi.ai/tools/default-tools), [import Twilio number](https://docs.vapi.ai/phone-numbers/import-twilio)
- Toast: [partner integration overview](https://doc.toasttab.com/doc/devguide/apiPartnerIntegrationOverview.html), [integration dev process](https://doc.toasttab.com/doc/devguide/integrationDevProcess.html)
- Twilio: [A2P 10DLC quickstart](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart), [`<Pay>` TwiML](https://www.twilio.com/docs/voice/twiml/pay), [agent-assisted pay](https://www.twilio.com/en-us/blog/voice-agent-assisted-pay)
- Stripe: [2026 integration guide](https://www.digitalapplied.com/blog/stripe-payment-integration-developer-guide-2026), [webhooks guide](https://www.magicbell.com/blog/stripe-webhooks-guide)
- Square: [Orders API](https://developer.squareup.com/docs/orders-api/what-it-does) · Clover: [custom orders](https://docs.clover.com/dev/docs/creating-custom-orders) · Clerk: [organizations](https://clerk.com/organizations)
