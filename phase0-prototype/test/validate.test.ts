import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder } from '../src/order/validate.ts';
import { sampleMenu } from '../src/menus/sample.ts';
import type { RequestedOrder } from '../src/order/order.ts';

const at = { now: new Date('2026-07-31T12:00:00Z') };

function order(items: RequestedOrder['items']): RequestedOrder {
  return { tenantId: 'pilot', channel: 'voice', items };
}

test('valid order normalizes with modifier-inclusive pricing', () => {
  const result = validateOrder(
    sampleMenu,
    order([
      { menuItemId: 'burger', quantity: 2, modifierOptionIds: ['temp_medium', 'add_bacon'] },
      { menuItemId: 'fries', quantity: 1, modifierOptionIds: ['size_large'] },
    ]),
    at,
  );

  assert.ok(result.ok);
  assert.equal(result.order.status, 'confirmed');
  assert.equal(result.order.items[0].unitPriceCents, 1450);
  assert.equal(result.order.items[0].lineTotalCents, 2900);
  assert.equal(result.order.items[1].unitPriceCents, 700);
  assert.equal(result.order.subtotalCents, 3600);
});

test('86’d item is rejected', () => {
  const result = validateOrder(sampleMenu, order([{ menuItemId: 'shake', quantity: 1, modifierOptionIds: [] }]));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.errors[0].code, 'ITEM_UNAVAILABLE');
});

test('unknown item is rejected', () => {
  const result = validateOrder(sampleMenu, order([{ menuItemId: 'pizza', quantity: 1, modifierOptionIds: [] }]));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.errors[0].code, 'UNKNOWN_ITEM');
});

test('missing required modifier selection is rejected', () => {
  const result = validateOrder(sampleMenu, order([{ menuItemId: 'burger', quantity: 1, modifierOptionIds: [] }]));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.errors[0].code, 'MODIFIER_CONSTRAINT');
});

test('modifier from the wrong item is rejected', () => {
  const result = validateOrder(
    sampleMenu,
    order([{ menuItemId: 'fries', quantity: 1, modifierOptionIds: ['size_small', 'add_bacon'] }]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.errors[0].code, 'UNKNOWN_MODIFIER');
});

test('quantity below one is rejected', () => {
  const result = validateOrder(
    sampleMenu,
    order([{ menuItemId: 'fries', quantity: 0, modifierOptionIds: ['size_small'] }]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.errors[0].code, 'INVALID_QUANTITY');
});
