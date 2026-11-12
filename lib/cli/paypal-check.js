import { randomUUID } from 'node:crypto';
import { paypal } from '../paypal.js';

// Creates one unapproved sandbox checkout and reads it back. Never pays,
// captures, refunds, reads a customer's order, or prints credentials.
try {
  if ((process.env.PAYPAL_TRANSPORT || 'apimatic') !== 'apimatic') {
    throw new Error('Set PAYPAL_TRANSPORT=apimatic to check the installed SDK.');
  }
  const reference = `crumb-check-${randomUUID()}`;
  const order = await paypal('/v2/checkout/orders', 'POST', {
    intent: 'CAPTURE',
    purchase_units: [{ custom_id: reference, amount: { currency_code: 'USD', value: '1.00' } }]
  }, reference);
  if (!order.id) throw new Error('The sandbox did not return an order reference.');
  const checked = await paypal(`/v2/checkout/orders/${order.id}`);
  if (checked.id !== order.id || checked.status !== 'CREATED') throw new Error('Unexpected sandbox order state.');
  console.log('PASS: APIMatic-generated PayPal SDK authenticated, created a sandbox order and read it back.');
  console.log('Status: CREATED (unapproved). No funds were transferred.');
} catch (error) {
  // SDK transport redacts provider request details before this boundary.
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
}
