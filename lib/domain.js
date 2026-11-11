import { createHash, randomBytes } from 'node:crypto';
export class AppError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const token = () => randomBytes(24).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const money = n => `PKR ${Number(n).toLocaleString('en-PK')}`;
export const now = () => new Date().toISOString();
export const slots = ['12:00–13:00', '15:00–16:00', '17:00–18:00', '18:00–19:00'];
export const branches = ['F-10 demo outlet', 'I-8 demo outlet'];
export const defaults = {
  bakeryName: 'Crumb', standardLeadHours: 24, customLeadHours: 72, slotCapacity: 8,
  cancellationPolicy: 'Cancellation and refunds require bakery review. Production stage and the accepted specification are considered.',
  supportEmail: '', assistantEnabled: true
};
export function validateDate(date, slot, custom, settings = defaults, clock = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !slots.includes(slot)) throw new AppError('Choose a valid date and pickup slot.');
  const start = new Date(`${date}T${slot.slice(0, 5)}:00+05:00`).getTime();
  const lead = custom ? settings.customLeadHours : settings.standardLeadHours;
  if (!Number.isFinite(start) || start < clock + lead * 3600000) throw new AppError(`Please allow at least ${lead} hours before pickup.`);
}
export function readiness(order) {
  return { specification: !!(order.productId && order.date && order.slot), contact: !!order.customer?.email,
    staffReview: order.status !== 'pending' && order.status !== 'clarification', payment: order.payment?.status === 'completed' };
}
export function canTransition(order, action) {
  const transitions = { approve: ['pending', 'clarification'], clarify: ['pending', 'clarification'], decline: ['pending', 'clarification'],
    preparing: ['accepted'], ready: ['preparing'], collected: ['ready'] };
  if (!transitions[action]?.includes(order.status)) throw new AppError('This action is not available for the current order state.', 409);
  if (['preparing', 'ready', 'collected'].includes(action) && order.payment?.status !== 'completed') throw new AppError('Verified payment is required before production.', 409);
  if (order.cancelRequested && ['preparing', 'ready', 'collected'].includes(action)) throw new AppError('Resolve the cancellation request before continuing production.', 409);
}
export function verifyCapture(order, provider) {
  const unit = provider.purchase_units?.[0];
  const capture = unit?.payments?.captures?.find(x => x.status === 'COMPLETED');
  if (provider.id !== order.payment.paypalOrderId || provider.status !== 'COMPLETED' || !capture ||
    unit.custom_id !== order.id || capture.amount?.currency_code !== 'USD' || capture.amount?.value !== order.payment.amount) {
    throw new AppError('PayPal payment is not a matching completed capture.', 409);
  }
  return { captureId: capture.id, status: 'completed', verifiedAt: now() };
}
export function publicOrder(o) {
  const { accessHash, _id, workspace, requestKey, ...safe } = o;
  return safe;
}
