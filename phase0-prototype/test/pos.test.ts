import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder } from '../src/order/validate.ts';
import { sampleMenu } from '../src/menus/sample.ts';
import { NotPaidError } from '../src/order/status.ts';
import { PosRegistry } from '../src/pos/registry.ts';
import { FakeAdapter } from '../src/pos/fakeAdapter.ts';
import { ToastAdapter } from '../src/pos/toastAdapter.ts';
import { submitOrder, type PosBridgeDeps } from '../src/pos/bridge.ts';
import type { NormalizedOrder } from '../src/order/order.ts';
import type { TenantPosConfig } from '../src/pos/adapter.ts';

function paidOrder(): NormalizedOrder {
  const result = validateOrder(
    sampleMenu,
    {
      tenantId: 'pilot',
      channel: 'voice',
      items: [{ menuItemId: 'fries', quantity: 1, modifierOptionIds: ['size_small'] }],
    },
    { now: new Date('2026-07-31T12:00:00Z') },
  );
  assert.ok(result.ok);
  return { ...result.order, status: 'paid' };
}

function depsWith(config: TenantPosConfig | undefined, registry: PosRegistry): PosBridgeDeps {
  return { getTenantPosConfig: () => config, registry };
}

test('a paid order flows through the bridge to the resolved adapter', async () => {
  const fake = new FakeAdapter();
  const registry = new PosRegistry().register('fake', () => fake);
  const config: TenantPosConfig = { tenantId: 'pilot', posType: 'fake', credentials: {} };

  const result = await submitOrder('pilot', paidOrder(), depsWith(config, registry));

  assert.ok(result.ok);
  assert.match(result.submission.posOrderId, /^fake_/);
  assert.equal(fake.submitted.length, 1);
  assert.equal(fake.submitted[0].subtotalCents, 500);
});

test('an unpaid order never reaches an adapter', async () => {
  const fake = new FakeAdapter();
  const registry = new PosRegistry().register('fake', () => fake);
  const config: TenantPosConfig = { tenantId: 'pilot', posType: 'fake', credentials: {} };
  const unpaid: NormalizedOrder = { ...paidOrder(), status: 'confirmed' };

  await assert.rejects(() => submitOrder('pilot', unpaid, depsWith(config, registry)), NotPaidError);
  assert.equal(fake.submitted.length, 0);
});

test('a tenant with no POS config fails closed', async () => {
  const registry = new PosRegistry().register('fake', () => new FakeAdapter());
  const result = await submitOrder('pilot', paidOrder(), depsWith(undefined, registry));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, 'POS_UNAVAILABLE');
});

test('an unregistered posType fails closed', async () => {
  const registry = new PosRegistry();
  const config: TenantPosConfig = { tenantId: 'pilot', posType: 'toast', credentials: {} };
  const result = await submitOrder('pilot', paidOrder(), depsWith(config, registry));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, 'POS_UNAVAILABLE');
});

test('the Toast adapter skeleton reports NOT_IMPLEMENTED until sandbox creds land', async () => {
  const registry = new PosRegistry().register('toast', (config) => new ToastAdapter(config));
  const config: TenantPosConfig = { tenantId: 'pilot', posType: 'toast', credentials: {} };
  const result = await submitOrder('pilot', paidOrder(), depsWith(config, registry));
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.error.code, 'NOT_IMPLEMENTED');
});
