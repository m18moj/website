# Config

## Environment Variables

- `ADMIN_PASSWORD` **required** — .env.example
- `ADMIN_USERNAME` **required** — .env.example
- `ANTHROPIC_API_KEY` **required** — discord-bot\.env.example
- `ANTHROPIC_MODEL` (has default) — discord-bot\assistant.js
- `AUTOMOD_BLOCK_INVITES` **required** — discord-bot\config.js
- `AUTOMOD_ENABLED` **required** — discord-bot\config.js
- `AUTOMOD_MAX_MENTIONS` **required** — discord-bot\config.js
- `AUTOMOD_SPAM_COUNT` **required** — discord-bot\config.js
- `AUTOMOD_SPAM_WINDOW_MS` **required** — discord-bot\config.js
- `DB_PATH` **required** — discord-bot\.env.example
- `DISCORD_BOT_TOKEN` **required** — discord-bot\.env.example
- `DISCORD_CLIENT_ID` **required** — discord-bot\.env.example
- `DISCORD_CLIENT_SECRET` **required** — discord-bot\.env.example
- `DISCORD_GUILD_ID` **required** — discord-bot\.env.example
- `DISCORD_OAUTH_REDIRECT_URI` **required** — discord-bot\.env.example
- `EMAIL_FROM` (has default) — .env.example
- `NODE_ENV` (has default) — .env.example
- `NOWPAYMENTS_API_KEY` **required** — .env.example
- `NOWPAYMENTS_IPN_SECRET` **required** — .env.example
- `PORT` (has default) — .env.example
- `SESSION_SECRET` **required** — .env.example
- `SMTP_HOST` **required** — .env.example
- `SMTP_PASS` **required** — .env.example
- `SMTP_PORT` (has default) — .env.example
- `SMTP_USER` **required** — .env.example
- `STRIPE_SECRET_KEY` (has default) — .env.example
- `STRIPE_WEBHOOK_SECRET` (has default) — .env.example

## Config Files

- `.env.example`
- `discord-bot\.env.example`

## Key Dependencies

- @anthropic-ai/sdk: ^0.68.0
- express: ^5.2.1
- stripe: ^22.5.0
