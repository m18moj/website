(function () {
  function report(message, stack) {
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: String(message || 'Unknown error').slice(0, 2000), stack: stack ? String(stack).slice(0, 4000) : null, url: window.location.href })
      }).catch(() => {});
    } catch (err) {
      // Reporting must never itself throw.
    }
  }

  window.addEventListener('error', (event) => {
    report(event.message, event.error && event.error.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    report(reason && reason.message ? reason.message : String(reason), reason && reason.stack);
  });
})();
