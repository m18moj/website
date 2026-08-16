# Backend Hosting Options (2026)

Research only — no code or config changes. Evaluated against this project's actual requirements:

- **Persistent disk** — `server/db.js` uses `node:sqlite` (Node's built-in SQLite), a real file on disk. Needs Node **22.5+** (stable without flags on Node 24+) and a filesystem that survives restarts/redeploys — this rules out anything serverless/ephemeral (Vercel, Netlify, Cloudflare Workers functions, Koyeb's free tier, etc.).
- **Cron support** — `social/scheduler.js` runs `node-cron` in-process (recurring triggers every few minutes, nightly jobs). This needs a host that keeps a **long-running Node process alive**, not scale-to-zero serverless functions.
- **Stripe-reachable webhooks** — needs a stable public HTTPS URL Stripe can POST to at any time, so free tiers that sleep after inactivity and cold-start (Render's free web service, Koyeb's free instance) are a real risk of missed/delayed webhook deliveries.
- Also running here: Express web server, Discord bot (`discord-bot/`), social automation worker, and the Remotion video pipeline (`video/`) — all long-running or spawn child processes, another point against serverless.

Current repo already deploys static/edge assets via `wrangler deploy` (Cloudflare) — that's unrelated to this backend and stays as-is. This doc is only about where the Node backend (Express + SQLite + Discord bot + social scheduler) runs.

---

## Recommended: Oracle Cloud "Always Free" VM

A full Ampere A1 (ARM) or AMD micro VM, genuinely free forever (not a trial), with:

- **2 OCPU / 12 GB RAM** (Ampere A1) — Oracle cut this from 4 OCPU/24GB in mid-2026, still far more than this app needs.
- **200 GB Always Free block storage** — persistent disk for the SQLite files, unaffected by the compute cut.
- Full root VPS access — install any Node version, run `node-cron` as a real background process, use `pm2`/systemd for the Discord bot + social worker, open port 443 with a static public IP for Stripe webhooks. Trivially satisfies all three requirements because it's just a normal server.

**Caveats:**
- Oracle sent notices that Always-Free compute instances **above the new 2 OCPU/12GB limit get terminated starting August 18, 2026** — sign up fresh (or resize existing) under the current limits, don't rely on older guides quoting 4 OCPU/24GB.
- Signup has a reputation for friction: requires a valid card for identity verification (never charged on the Always Free shape), and Ampere A1 capacity in popular regions can be unavailable at signup time — retry in a different region if so.
- You own all patching/security/ops — there's no managed platform layer.

This is the best fit if the friction of VM ops is acceptable — it's the only option here that's both fully free *and* has no compromise on disk, cron, or webhook reachability.

## Low-friction low-cost fallback: a small VPS (Hetzner / DigitalOcean / Linode)

If Oracle's signup friction or capacity issues become a blocker, a small VPS is the next-best option and has none of Oracle's uncertainty:

- **Hetzner CX22** (~€4-5/mo, ~2 vCPU/4GB/40GB disk) is the cheapest reasonable option with good uptime; DigitalOcean/Linode's ~$6/mo droplet tier is the same shape with a more familiar US-based console.
- Same story as Oracle: full VPS, persistent disk, real cron, static IP for webhooks — just not free. Predictable flat monthly cost, no capacity lottery, signup takes minutes.
- Reasonable middle ground: run on this immediately, and migrate to Oracle's free tier later once its VM is provisioned and tested, if the goal is to get to $0/mo.

## Reasonable if you'd rather not manage a VM: Render (paid Starter tier)

- Render's **free** web service tier does **not** include persistent disk (disk is a paid add-on only) and sleeps after 15 minutes of inactivity — both disqualify it as-is for this project (SQLite file would not survive across free-tier restarts reliably, and a sleeping instance risks missing Stripe webhook retries).
- The **Starter** plan (~$7/mo, 512MB/0.5vCPU, always-on) adds persistent disk support and Render's native background-worker + cron-job service types, which map cleanly onto the Discord bot / social scheduler / web server split. This is the easiest "just deploy from git, don't think about servers" option if a few dollars/month and zero ops is preferred over a free but self-managed VM.
- Costs scale up per-service (web + worker + cron all bill separately), so this gets more expensive than a VPS once multiple long-running processes are involved — this app already has at least three (web server, Discord bot, social worker).

## Ruled out

- **Railway** — no free tier as of 2026; everything is metered per-second on top of a plan fee. Not meaningfully cheaper than a VPS for an always-on multi-process app, with less control.
- **Fly.io** — the old free allowance is gone for new accounts (short trial only, then requires a card). Still viable as a paid pay-as-you-second option with real persistent volumes if Oracle/Hetzner don't work out, but it's not free and not simpler than a VPS for this use case.
- **Koyeb** — free tier can no longer attach persistent volumes at all (2GB ephemeral SSD only), and new free-tier signups were closed after Koyeb's acquisition by Mistral AI in early 2026.
- **Vercel / Netlify / Cloudflare Workers (functions)** — serverless/edge-function model is the wrong shape entirely: no persistent filesystem for SQLite, no long-running process for `node-cron` or the Discord gateway connection, functions scale to zero between requests. Fine for the static site (already on Cloudflare via `wrangler deploy`), wrong for this backend.

---

## Bottom line

- **Want genuinely $0/mo and don't mind owning a VM:** Oracle Cloud Always Free (Ampere A1) — sign up now, before the August 18, 2026 enforcement date changes what's grandfathered in.
- **Want something that works today with no signup uncertainty:** a ~$5/mo Hetzner or DigitalOcean droplet, same setup either way (SQLite file on disk, `pm2`/systemd running the web server + Discord bot + social scheduler, standard crontab or `node-cron` in-process, Nginx or Node directly terminating TLS for Stripe's webhook URL).
- **Want zero server ops and can pay ~$20-30/mo for 3 always-on services:** Render Starter, one service each for web/bot/social-worker, using Render's built-in disk + cron-job features instead of rolling your own.
