import type { NormalizedOrder } from '../order/order.ts';

export interface TenantPosConfig {
  tenantId: string;
  posType: string;
  credentials: Record<string, string>;
}

export interface PosSubmission {
  posOrderId: string;
}

export interface PosError {
  code: 'POS_REJECTED' | 'POS_UNAVAILABLE' | 'NOT_IMPLEMENTED';
  message: string;
  retryable: boolean;
}

export type SubmitResult =
  | { ok: true; submission: PosSubmission }
  | { ok: false; error: PosError };

export interface PosAdapter {
  readonly posType: string;
  submit(order: NormalizedOrder): Promise<SubmitResult>;
}

export type PosAdapterFactory = (config: TenantPosConfig) => PosAdapter;
