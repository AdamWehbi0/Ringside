import type { NormalizedOrder } from '../order/order.ts';
import type { PosAdapter, SubmitResult } from './adapter.ts';

export class FakeAdapter implements PosAdapter {
  readonly posType = 'fake';
  readonly submitted: NormalizedOrder[] = [];

  async submit(order: NormalizedOrder): Promise<SubmitResult> {
    this.submitted.push(order);
    return { ok: true, submission: { posOrderId: `fake_${this.submitted.length}` } };
  }
}
