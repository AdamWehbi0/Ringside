import type { OrderStatus } from './order.ts';

export type OrderEvent = 'send_to_payment' | 'payment_confirmed' | 'submit_accepted' | 'cancel';

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>> = {
  confirmed: { send_to_payment: 'pending_payment', cancel: 'cancelled' },
  pending_payment: { payment_confirmed: 'paid', cancel: 'cancelled' },
  paid: { submit_accepted: 'submitted' },
  submitted: {},
  cancelled: {},
};

export class IllegalTransitionError extends Error {
  constructor(status: OrderStatus, event: OrderEvent) {
    super(`Cannot apply '${event}' to an order in status '${status}'`);
    this.name = 'IllegalTransitionError';
  }
}

export class NotPaidError extends Error {
  constructor(status: OrderStatus) {
    super(`Order in status '${status}' cannot reach the POS bridge — payment must clear first`);
    this.name = 'NotPaidError';
  }
}

export function transition(status: OrderStatus, event: OrderEvent): OrderStatus {
  const next = TRANSITIONS[status][event];
  if (!next) throw new IllegalTransitionError(status, event);
  return next;
}

export function assertSubmittable(status: OrderStatus): void {
  if (status !== 'paid') throw new NotPaidError(status);
}
