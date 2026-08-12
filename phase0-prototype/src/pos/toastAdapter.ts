import type { NormalizedOrder } from '../order/order.ts';
import type { PosAdapter, SubmitResult, TenantPosConfig } from './adapter.ts';

// Skeleton only. The real flow (client-credentials OAuth → GUID-scoped token →
// POST the mapped order) is blocked on Toast sandbox credentials.
// See docs/INTEGRATIONS.md → "POS path → Toast" for the certification steps.
export class ToastAdapter implements PosAdapter {
  readonly posType = 'toast';
  private readonly config: TenantPosConfig;

  constructor(config: TenantPosConfig) {
    this.config = config;
  }

  async submit(_order: NormalizedOrder): Promise<SubmitResult> {
    return {
      ok: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: `ToastAdapter for tenant '${this.config.tenantId}' awaits sandbox credentials`,
        retryable: false,
      },
    };
  }
}
