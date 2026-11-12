import { AppError } from './domain.js';

// The generated SDK uses camelCase models; our service stores PayPal wire JSON.
function sdkModel(value) {
  if (Array.isArray(value)) return value.map(sdkModel);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), sdkModel(item)
  ]));
}

export function createSdkTransport(sdk, clientId, clientSecret) {
  const client = new sdk.Client({
    clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
    environment: sdk.Environment.Sandbox,
    timeout: 20000,
    // Service-level reconciliation owns retries for captures and refunds.
    httpClientOptions: { retryConfig: { maxNumberOfRetries: 0 } }
  });
  const orders = new sdk.OrdersController(client);
  const payments = new sdk.PaymentsController(client);
  return async (path, method = 'GET', body, requestId) => {
    const write = { body: sdkModel(body), paypalRequestId: requestId, prefer: 'return=representation' };
    let operation;
    let match;
    if (method === 'POST' && path === '/v2/checkout/orders') {
      operation = () => orders.createOrder(write);
    } else if (method === 'GET' && (match = /^\/v2\/checkout\/orders\/([A-Za-z0-9-]+)$/.exec(path))) {
      operation = () => orders.getOrder({ id: match[1] });
    } else if (method === 'POST' && (match = /^\/v2\/checkout\/orders\/([A-Za-z0-9-]+)\/capture$/.exec(path))) {
      operation = () => orders.captureOrder({ id: match[1], ...write });
    } else if (method === 'POST' && (match = /^\/v2\/payments\/captures\/([A-Za-z0-9-]+)\/refund$/.exec(path))) {
      operation = () => payments.refundCapturedPayment({ captureId: match[1], ...write });
    } else if (method === 'GET' && (match = /^\/v2\/payments\/refunds\/([A-Za-z0-9-]+)$/.exec(path))) {
      operation = () => payments.getRefund({ refundId: match[1] });
    } else {
      throw new AppError('Unsupported PayPal SDK operation.', 500);
    }
    try {
      const response = await operation();
      // Preserve snake_case and exact decimal strings used by payment verification.
      // ApiResponse.body is the wire response, unlike result (SDK models).
      if (typeof response.body !== 'string') throw new Error('Expected PayPal JSON response');
      const data = JSON.parse(response.body);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid PayPal response');
      return data;
    } catch {
      // SDK errors can include request headers and bodies. Never expose them.
      throw new AppError('PayPal could not complete this operation. Check payment status before retrying.', 502);
    }
  };
}

let cached;
export async function apimaticPaypal(path, method, body, requestId) {
  const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new AppError('Add PayPal sandbox keys before using checkout.', 503);
  if (!cached || cached.id !== id || cached.secret !== secret) {
    let sdk;
    try {
      // Keep the literal import visible to Next's server dependency tracer.
      sdk = await import('@paypal/paypal-server-sdk');
    } catch {
      throw new AppError('PayPal SDK is unavailable. Run npm run setup:apimatic-sdk and restart the server.', 503);
    }
    cached = { id, secret, transport: createSdkTransport(sdk, id, secret) };
  }
  return cached.transport(path, method, body, requestId);
}
