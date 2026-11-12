import test from 'node:test';
import assert from 'node:assert/strict';
import { createSdkTransport } from '../lib/paypal-apimatic.js';
import { paypal } from '../lib/paypal.js';

test('SDK adapter preserves payment JSON, model fields and idempotency across all supported operations', async () => {
  const calls = [];
  let config;
  const wire = { id: 'PP1', purchase_units: [{ custom_id: 'order-1', payments: { captures: [{ amount: { currency_code: 'USD', value: '12.00' } }] } }] };
  const endpoint = name => async args => {
    calls.push({ name, args });
    return { body: JSON.stringify(wire), result: { purchaseUnits: [] } };
  };
  const sdk = {
    Environment: { Sandbox: 'sandbox' },
    Client: class { constructor(options) { config = options; } },
    OrdersController: class {
      createOrder = endpoint('create'); getOrder = endpoint('get'); captureOrder = endpoint('capture');
    },
    PaymentsController: class {
      refundCapturedPayment = endpoint('refund'); getRefund = endpoint('getRefund');
    }
  };
  const transport = createSdkTransport(sdk, 'client', 'secret');
  const body = { intent: 'CAPTURE', purchase_units: [{ custom_id: 'order-1', amount: { currency_code: 'USD', value: '12.00' } }], payment_source: { paypal: { experience_context: { return_url: 'https://example.com/return' } } } };
  assert.deepEqual(await transport('/v2/checkout/orders', 'POST', body, 'create-1'), wire);
  assert.equal(calls[0].args.body.purchaseUnits[0].customId, 'order-1');
  assert.equal(calls[0].args.body.purchaseUnits[0].amount.currencyCode, 'USD');
  assert.equal(calls[0].args.body.paymentSource.paypal.experienceContext.returnUrl, 'https://example.com/return');
  assert.equal(calls[0].args.paypalRequestId, 'create-1');
  assert.equal(calls[0].args.prefer, 'return=representation');
  assert.equal(body.purchase_units[0].custom_id, 'order-1', 'input is not mutated');
  await transport('/v2/checkout/orders/PP1');
  await transport('/v2/checkout/orders/PP1/capture', 'POST', {}, 'capture-1');
  await transport('/v2/payments/captures/CAP1/refund', 'POST', { amount: { currency_code: 'USD', value: '12.00' } }, 'refund-1');
  await transport('/v2/payments/refunds/REF1');
  assert.deepEqual(calls.slice(1).map(x => [x.name, x.args.id || x.args.captureId || x.args.refundId]), [['get', 'PP1'], ['capture', 'PP1'], ['refund', 'CAP1'], ['getRefund', 'REF1']]);
  assert.equal(calls[2].args.paypalRequestId, 'capture-1');
  assert.equal(calls[3].args.paypalRequestId, 'refund-1');
  assert.equal(config.environment, 'sandbox');
  assert.equal(config.timeout, 20000);
  assert.equal(config.httpClientOptions.retryConfig.maxNumberOfRetries, 0);
  assert.deepEqual(config.clientCredentialsAuthCredentials, { oAuthClientId: 'client', oAuthClientSecret: 'secret' });
  await assert.rejects(() => transport('https://example.com'), /Unsupported/);
});

test('SDK errors and invalid responses never expose SDK request details', async () => {
  for (const endpoint of [async () => { throw new Error('Authorization: secret'); }, async () => ({ body: '<html>secret</html>' }), async () => ({ body: null })]) {
    const transport = createSdkTransport({ Client: class {}, Environment: { Sandbox: 'sandbox' }, OrdersController: class { getOrder = endpoint; }, PaymentsController: class {} }, 'id', 'secret');
    await assert.rejects(() => transport('/v2/checkout/orders/PP1'), error => error.status === 502 && !error.message.includes('secret'));
  }
});

test('configured SDK requires credentials; webhook verification stays on REST', async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  try {
    process.env.PAYPAL_TRANSPORT = 'apimatic';
    delete process.env.PAYPAL_CLIENT_ID;
    await assert.rejects(() => paypal('/v2/checkout/orders/PP1'), error => error.status === 503);
    process.env.PAYPAL_CLIENT_ID = 'test'; process.env.PAYPAL_CLIENT_SECRET = 'test';
    const calls = [];
    globalThis.fetch = async url => {
      calls.push(url);
      return Response.json(url.endsWith('/oauth2/token') ? { access_token: 'token' } : { verification_status: 'SUCCESS' });
    };
    assert.deepEqual(await paypal('/v1/notifications/verify-webhook-signature', 'POST', { webhook_id: 'hook' }), { verification_status: 'SUCCESS' });
    assert.equal(calls.length, 2);
    process.env.PAYPAL_TRANSPORT = 'invalid';
    await assert.rejects(() => paypal('/v2/checkout/orders/PP1'), error => error.status === 503);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ['PAYPAL_TRANSPORT', 'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
