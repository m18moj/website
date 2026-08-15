// Floating assistant widget, present on every customer-facing page. Talks to
// POST /api/chat, which is backed by the same assistant module the Discord
// bot uses (discord-bot/assistant.js) — one "brain", two front doors.
(function () {
  const history = [];
  let sending = false;

  function apiFetch(path, options) {
    if (window.ScripForgeAuth && window.ScripForgeAuth.apiFetch) {
      return window.ScripForgeAuth.apiFetch(path, options);
    }
    // Fallback if auth.js hasn't loaded for some reason — chat still works,
    // just without a CSRF header (the endpoint doesn't require one; see
    // server/routes/chat.js).
    return fetch(path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin'
    }).then((res) => res.json());
  }

  function build() {
    const launcher = document.createElement('button');
    launcher.className = 'sf-chat-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open chat assistant');
    launcher.textContent = '💬';

    const panel = document.createElement('div');
    panel.className = 'sf-chat-panel';
    panel.innerHTML = `
      <div class="sf-chat-header">
        <span>ScripForge Assistant</span>
        <button type="button" aria-label="Close chat">&times;</button>
      </div>
      <div class="sf-chat-messages"></div>
      <div class="sf-chat-input-row">
        <input type="text" maxlength="2000" placeholder="Ask a question…" aria-label="Message" />
        <button type="button">Send</button>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    const messagesEl = panel.querySelector('.sf-chat-messages');
    const input = panel.querySelector('input');
    const sendBtn = panel.querySelector('.sf-chat-input-row button');
    const closeBtn = panel.querySelector('.sf-chat-header button');

    function addMessage(role, text) {
      const el = document.createElement('div');
      el.className = `sf-chat-msg sf-chat-msg-${role}`;
      el.textContent = text;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setSending(value) {
      sending = value;
      sendBtn.disabled = value;
      input.disabled = value;
    }

    async function send() {
      const text = input.value.trim();
      if (!text || sending) return;

      addMessage('user', text);
      history.push({ role: 'user', content: text });
      input.value = '';
      setSending(true);

      try {
        const data = await apiFetch('/api/chat', { method: 'POST', body: { messages: history } });
        if (data && data.reply) {
          addMessage('assistant', data.reply);
          history.push({ role: 'assistant', content: data.reply });
        } else {
          addMessage('error', (data && data.error) || 'Something went wrong. Please try again.');
        }
      } catch (err) {
        addMessage('error', err.message || 'Something went wrong. Please try again.');
      } finally {
        setSending(false);
        input.focus();
      }
    }

    launcher.addEventListener('click', () => {
      panel.classList.toggle('sf-chat-open');
      if (panel.classList.contains('sf-chat-open')) {
        if (messagesEl.children.length === 0) {
          addMessage('assistant', "Hi! I can help with questions about scripts, orders, or how ScripForge works. What's up?");
        }
        input.focus();
      }
    });

    closeBtn.addEventListener('click', () => panel.classList.remove('sf-chat-open'));
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
