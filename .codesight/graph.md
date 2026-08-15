# Dependency Graph

## Most Imported Files (change these carefully)

- `server\db.js` — imported by **15** files
- `server\models\catalog.js` — imported by **13** files
- `server\models\users.js` — imported by **11** files
- `discord-bot\config.js` — imported by **10** files
- `server\models\orders.js` — imported by **10** files
- `discord-bot\models\discordLinks.js` — imported by **7** files
- `server\middleware\rateLimit.js` — imported by **7** files
- `discord-bot\moderationLog.js` — imported by **6** files
- `discord-bot\models\guildConfig.js` — imported by **6** files
- `server\middleware\csrf.js` — imported by **6** files
- `discord-bot\db.js` — imported by **5** files
- `server\middleware\auth.js` — imported by **5** files
- `server\models\auditLog.js` — imported by **5** files
- `server\models\settings.js` — imported by **4** files
- `server\serialize.js` — imported by **4** files
- `discord-bot\assistant.js` — imported by **3** files
- `discord-bot\rateLimiter.js` — imported by **3** files
- `discord-bot\models\tickets.js` — imported by **3** files
- `server\models\errorLog.js` — imported by **3** files
- `server\models\licenses.js` — imported by **3** files

## Import Map (who imports what)

- `server\db.js` ← `discord-bot\db.js`, `server\index.js`, `server\models\auditLog.js`, `server\models\bundles.js`, `server\models\catalog.js` +10 more
- `server\models\catalog.js` ← `discord-bot\assistant.js`, `discord-bot\commands\setupServer.js`, `discord-bot\onboarding.js`, `server\models\bundles.js`, `server\routes\account.js` +8 more
- `server\models\users.js` ← `discord-bot\commands\ask.js`, `discord-bot\commands\verify.js`, `discord-bot\events\messageCreate.js`, `server\middleware\auth.js`, `server\orderFulfillment.js` +6 more
- `discord-bot\config.js` ← `discord-bot\assistant.js`, `discord-bot\automod.js`, `discord-bot\commands\setupServer.js`, `discord-bot\commands\verify.js`, `discord-bot\conversationStore.js` +5 more
- `server\models\orders.js` ← `discord-bot\assistant.js`, `discord-bot\commands\verify.js`, `discord-bot\ticketActions.js`, `server\orderFulfillment.js`, `server\routes\account.js` +5 more
- `discord-bot\models\discordLinks.js` ← `discord-bot\commands\ask.js`, `discord-bot\commands\verify.js`, `discord-bot\events\messageCreate.js`, `discord-bot\ticketActions.js`, `server\orderFulfillment.js` +2 more
- `server\middleware\rateLimit.js` ← `server\index.js`, `server\routes\account.js`, `server\routes\admin.js`, `server\routes\auth.js`, `server\routes\chat.js` +2 more
- `discord-bot\moderationLog.js` ← `discord-bot\commands\ban.js`, `discord-bot\commands\kick.js`, `discord-bot\commands\timeout.js`, `discord-bot\commands\unban.js`, `discord-bot\commands\warn.js` +1 more
- `discord-bot\models\guildConfig.js` ← `discord-bot\commands\setupServer.js`, `discord-bot\commands\ticketClose.js`, `discord-bot\commands\verify.js`, `discord-bot\discordRest.js`, `discord-bot\moderationLog.js` +1 more
- `server\middleware\csrf.js` ← `server\index.js`, `server\routes\account.js`, `server\routes\admin.js`, `server\routes\auth.js`, `server\routes\checkout.js` +1 more
