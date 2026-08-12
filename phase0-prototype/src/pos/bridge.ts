import type { NormalizedOrder } from '../order/order.ts';
import { assertSubmittable } from '../order/status.ts';
import type { SubmitResult, TenantPosConfig } from './adapter.ts';
import type { PosRegistry } from './registry.ts';

export interface PosBridgeDeps {
  getTenantPosConfig(tenantId: string): TenantPosConfig | undefined;
  registry: PosRegistry;
}

export async function submitOrder(
  tenantId: string,
  order: NormalizedOrder,
  deps: PosBridgeDeps,
): Promise<SubmitResult> {
  assertSubmittable(order.status);

  const config = deps.getTenantPosConfig(tenantId);
  if (!config) {
    return { ok: false, error: { code: 'POS_UNAVAILABLE', message: `No POS config for tenant '${tenantId}'`, retryable: false } };
  }

  const adapter = deps.registry.resolve(config);
  if (!adapter) {
    return { ok: false, error: { code: 'POS_UNAVAILABLE', message: `No adapter registered for posType '${config.posType}'`, retryable: false } };
  }

  return adapter.submit(order);
}
