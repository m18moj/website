const nodemailer = require('nodemailer');

// Optional — nothing in the app requires email to work (accounts still don't
// need one to register or sign in). When SMTP isn't configured, every send
// just logs what would have gone out instead of failing, so password reset
// and receipts still work end-to-end in local development without a real
// mail server; only the actual delivery is skipped.
function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter = null;
function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || 'ScripForge <no-reply@scripforge.local>';

  const client = getTransporter();
  if (!client) {
    console.log(`[email] SMTP not configured — would have sent to ${to}: "${subject}"\n${text}`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await client.sendMail({ from, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}

function passwordResetEmail({ to, username, resetUrl }) {
  return sendEmail({
    to,
    subject: 'Reset your ScripForge password',
    text: `Hi ${username},\n\nSomeone requested a password reset for your ScripForge account. If this was you, reset your password here (this link expires in 30 minutes):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email — your password hasn't been changed.`,
    html: `<p>Hi ${username},</p><p>Someone requested a password reset for your ScripForge account. If this was you, reset your password here (this link expires in 30 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email — your password hasn't been changed.</p>`
  });
}

function orderReceiptEmail({ to, username, order }) {
  const itemLines = order.items.map((i) => `  - ${i.packName} — ${i.scriptTitle}: ${order.currencySymbol}${i.priceAmount.toFixed(2)}`).join('\n');
  return sendEmail({
    to,
    subject: `Your ScripForge order SF-${order.id} is confirmed`,
    text: `Hi ${username},\n\nYour order is confirmed:\n\n${itemLines}\n\nTotal: ${order.currencySymbol}${order.totalAmount.toFixed(2)} ${order.currency}\n\nDownload your scripts any time from your account page.`,
    html: `<p>Hi ${username},</p><p>Your order is confirmed:</p><ul>${order.items.map((i) => `<li>${i.packName} — ${i.scriptTitle}: ${order.currencySymbol}${i.priceAmount.toFixed(2)}</li>`).join('')}</ul><p><strong>Total: ${order.currencySymbol}${order.totalAmount.toFixed(2)} ${order.currency}</strong></p><p>Download your scripts any time from your account page.</p>`
  });
}

module.exports = { isConfigured, sendEmail, passwordResetEmail, orderReceiptEmail };
