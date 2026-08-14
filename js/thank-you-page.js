(function () {
  function renderOrder(order, { pending }) {
    const heading = document.getElementById('thankYouHeading');
    const message = document.getElementById('thankYouMessage');
    const reference = document.getElementById('orderReference');
    const summary = document.getElementById('orderSummary');
    const { escapeHtml } = window.ScriptForgeAuth;

    if (order.status === 'paid') {
      heading.textContent = 'Payment received — thanks!';
      message.textContent = 'Your scripts are unlocked, and your order is saved to your account.';
    } else if (pending) {
      heading.textContent = 'Waiting for payment confirmation…';
      message.textContent = order.paymentProvider === 'crypto'
        ? 'Crypto payments confirm on the blockchain, which can take a few minutes. This page will update automatically — you can also close it and check your account page later.'
        : 'We\'re still confirming your payment. Refresh this page in a moment, or check your account for the latest status.';
    } else {
      heading.textContent = 'Order received.';
      message.textContent = 'We\'re still confirming your payment. Check your account page for the latest status.';
    }

    reference.textContent = `SF-${order.id}`;

    summary.innerHTML = order.items.map((item) => `
      <div class="checkout-item-row">
        <span>${escapeHtml(item.packName)} — ${escapeHtml(item.scriptTitle)}</span>
        <span>${order.currencySymbol}${item.priceAmount.toFixed(2)}</span>
      </div>
    `).join('') + `
      <div class="checkout-pack-total">Total: ${order.currencySymbol}${order.totalAmount.toFixed(2)}</div>
    `;
    summary.hidden = false;
  }

  async function pollUntilPaid(fetchOrder, { maxAttempts = 12, intervalMs = 5000 } = {}) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const order = await fetchOrder();
      renderOrder(order, { pending: order.status !== 'paid' });

      if (order.status === 'paid') {
        window.ScriptForgeCart.clearCart();
        if (window.ScriptForgeToast) window.ScriptForgeToast.show('Payment confirmed — enjoy your scripts!', 'success');
        return;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    const cryptoRef = params.get('crypto_ref');
    const message = document.getElementById('thankYouMessage');

    if (!sessionId && !cryptoRef) {
      // Reached directly (e.g. by typing the URL), not after a payment —
      // leave the generic enquiry copy in place.
      document.querySelector('.order-number').hidden = true;
      return;
    }

    try {
      if (sessionId) {
        const fetchOrder = async () => {
          const data = await window.ScriptForgeAuth.apiFetch(`/api/checkout/session-status?session_id=${encodeURIComponent(sessionId)}`);
          return data.order;
        };
        await pollUntilPaid(fetchOrder, { maxAttempts: 3, intervalMs: 2000 });
      } else {
        const fetchOrder = async () => {
          const data = await window.ScriptForgeAuth.apiFetch(`/api/checkout/crypto-status?order_id=${encodeURIComponent(cryptoRef)}`);
          return data.order;
        };
        await pollUntilPaid(fetchOrder, { maxAttempts: 12, intervalMs: 5000 });
      }
    } catch (err) {
      message.textContent = 'We couldn\'t load your order details right now, but if payment was confirmed, it has been saved to your account.';
    }
  });
})();
