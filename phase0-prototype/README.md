# phase0-prototype

Scrappy Phase 0 proof of the **order engine core** — the spine every other layer plugs into. Deliberately *not* the Phase 1 `/services/order-engine` structure; this exists to prove the loop, and gets formalized in Phase 1 (see [../docs/ROADMAP.md](../docs/ROADMAP.md)).

Zero dependencies — runs on Node's native TypeScript support and built-in test runner (Node 22.6+).

## What's here

| File | Responsibility |
|---|---|
| `src/order/menu.ts` | Menu / modifier types — the config a tenant's menu is expressed in |
| `src/order/order.ts` | Requested vs. normalized order types, `OrderStatus`, validation-error types |
| `src/order/validate.ts` | `validateOrder(menu, requested)` → normalized order or typed errors (86'd items, unknown items, modifier min/max, quantity, modifier-inclusive pricing in integer cents) |
| `src/order/status.ts` | The order state machine + the paid-before-POS gate (`assertSubmittable`) |
| `src/pos/adapter.ts` | `PosAdapter` interface + `submit` result/error types + `TenantPosConfig` |
| `src/pos/registry.ts` | `posType` → adapter factory; resolves a tenant's adapter from config |
| `src/pos/bridge.ts` | `submitOrder(tenantId, order)` — the single door to any POS, gated on paid |
| `src/pos/fakeAdapter.ts` | In-memory adapter that records submissions (tests/local) |
| `src/pos/toastAdapter.ts` | Toast adapter **skeleton** — returns `NOT_IMPLEMENTED` until sandbox creds land |
| `src/menus/sample.ts` | Placeholder menu — **replace with the real pilot (Toast) store menu** |

## The invariants this locks down

1. **`confirmed → pending_payment → paid → submitted`** — the only legal path. `transition()` throws on anything else; the jump straight to `submitted` is impossible.
2. **`submitOrder()` is the single door to any POS, and it fails closed** — it calls `assertSubmittable()` first (only `paid` passes), then resolves the adapter from tenant config. An unpaid order, an unconfigured tenant, or an unknown POS type never reaches an adapter. Hard rules 1 and 4, in code.

## Run

```bash
node --test        # all tests
```

## Zero-build constraint

We run TypeScript natively via Node's strip-only mode (no compiler). That means **no TS features that require code generation** — no `enum`, no `namespace`, no constructor **parameter properties** (`constructor(private x)`). Declare class fields explicitly. Type-check separately with `tsc --noEmit` once a toolchain is added.

## Not done yet (next in Phase 0)

- Swap `sample.ts` for the real Toast-store menu.
- Multi-turn conversation state (accumulate/modify an order across turns) on top of these pure primitives.
- The LLM function-call schema whose output feeds `validateOrder` (the boundary parse).
