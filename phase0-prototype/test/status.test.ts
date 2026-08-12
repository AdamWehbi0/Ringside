import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSubmittable,
  IllegalTransitionError,
  NotPaidError,
  transition,
} from '../src/order/status.ts';
import type { OrderStatus } from '../src/order/order.ts';

test('happy path runs confirmed -> pending_payment -> paid -> submitted', () => {
  let status: OrderStatus = 'confirmed';
  status = transition(status, 'send_to_payment');
  assert.equal(status, 'pending_payment');
  status = transition(status, 'payment_confirmed');
  assert.equal(status, 'paid');
  status = transition(status, 'submit_accepted');
  assert.equal(status, 'submitted');
});

test('an unpaid order cannot jump straight to submitted', () => {
  assert.throws(() => transition('confirmed', 'submit_accepted'), IllegalTransitionError);
});

test('assertSubmittable only passes for a paid order', () => {
  assert.doesNotThrow(() => assertSubmittable('paid'));
  for (const status of ['confirmed', 'pending_payment', 'submitted', 'cancelled'] as OrderStatus[]) {
    assert.throws(() => assertSubmittable(status), NotPaidError);
  }
});

test('orders can be cancelled before payment clears', () => {
  assert.equal(transition('confirmed', 'cancel'), 'cancelled');
  assert.equal(transition('pending_payment', 'cancel'), 'cancelled');
});

test('a paid order can no longer be cancelled', () => {
  assert.throws(() => transition('paid', 'cancel'), IllegalTransitionError);
});
