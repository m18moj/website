// Fixed set of ticket categories — opening a ticket always requires picking
// one of these (see ticketActions.js / events/interactionCreate.js), so
// every ticket the dashboard shows can be filtered/reported on by category.
const TICKET_CATEGORIES = [
  { value: 'privacy', label: 'Privacy', emoji: '🔒', description: 'Data requests, privacy questions' },
  { value: 'purchase', label: 'Purchase', emoji: '🛒', description: 'Help before/during a purchase' },
  { value: 'product', label: 'Product', emoji: '📦', description: 'Questions about a script/pack' },
  { value: 'technical_support', label: 'Technical Support', emoji: '🛠️', description: 'Something isn\'t working' },
  { value: 'account', label: 'Account', emoji: '👤', description: 'Login, access, account issues' },
  { value: 'billing', label: 'Billing', emoji: '💳', description: 'Payments, refunds, invoices' },
  { value: 'general', label: 'General', emoji: '💬', description: 'Anything else general' },
  { value: 'partnership', label: 'Partnership', emoji: '🤝', description: 'Collabs, affiliates, business' },
  { value: 'other', label: 'Other', emoji: '❓', description: "Doesn't fit the categories above" }
];

function labelFor(value) {
  const found = TICKET_CATEGORIES.find((c) => c.value === value);
  return found ? found.label : 'General';
}

module.exports = { TICKET_CATEGORIES, labelFor };
