// One-time interactive CLI to mint a TikTok access/refresh token — run via
// `npm run social:tiktok-auth`. Needs TIKTOK_CLIENT_KEY/CLIENT_SECRET
// already set in social/.env (from a TikTok for Developers app with the
// Content Posting API added, approved for the video.publish and video.list
// scopes). Unlike social/scripts/youtube-oauth-setup.js this can't
// auto-capture the redirect: TikTok requires an HTTPS redirect_uri (no
// localhost), so this prints the authorize URL and asks you to paste back
// the `code` query param from the URL TikTok redirects you to — no local
// server or HTTPS tunnel needed for this one-time step.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const readline = require('readline');
const crypto = require('crypto');

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = process.env.TIKTOK_OAUTH_REDIRECT_URI;
const SCOPE = 'video.publish,video.list';

if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error('Set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in social/.env first (from your TikTok for Developers app), then re-run this.');
  process.exit(1);
}
if (!REDIRECT_URI) {
  console.error('Set TIKTOK_OAUTH_REDIRECT_URI in social/.env first — an HTTPS URL registered under your TikTok app\'s "Redirect URI" (TikTok does not allow localhost/HTTP here). It does not need to be a live page; e.g. https://scripforge.net/ works fine since you\'ll copy the code from the browser\'s address bar by hand.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');

const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
authUrl.search = new URLSearchParams({
  client_key: CLIENT_KEY,
  scope: SCOPE,
  response_type: 'code',
  redirect_uri: REDIRECT_URI,
  state
}).toString();

console.log('\nOpen this URL in a browser, log in as the TikTok account to post from, and approve access:\n');
console.log(authUrl.toString());
console.log(`\nTikTok will redirect to ${REDIRECT_URI}?code=...&state=... (the page itself may 404 — that's fine).`);
console.log('Copy the full resulting URL from your browser\'s address bar and paste it below.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the redirect URL (or just the code param): ', async (answer) => {
  rl.close();

  let code = answer.trim();
  let returnedState = null;
  try {
    const parsed = new URL(code);
    code = parsed.searchParams.get('code');
    returnedState = parsed.searchParams.get('state');
  } catch (err) {
    // Not a URL — treat the whole input as the raw code.
  }
  if (!code) {
    console.error('Could not find a code in that input.');
    process.exit(1);
  }
  if (returnedState && returnedState !== state) {
    console.error('State mismatch — this does not look like the redirect from the URL just printed. Re-run the script.');
    process.exit(1);
  }

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.refresh_token) {
      console.error('\nToken exchange failed:', data.error_description || data.error || data);
      process.exit(1);
    }
    console.log('\nSuccess.\n');
    console.log('For the single default account, add this to social/.env:');
    console.log(`  TIKTOK_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\nTo connect this as an ADDITIONAL account (multi-account posting), instead open');
    console.log('Video Studio -> Social Hand-off -> Connected accounts -> "+ Add account", pick');
    console.log('TikTok, and paste in:');
    console.log(`  Client key:     ${CLIENT_KEY}`);
    console.log('  Client secret:  (the TIKTOK_CLIENT_SECRET from social/.env)');
    console.log(`  Refresh token:  ${data.refresh_token}`);
    console.log(`\n(open_id: ${data.open_id} — access token expires in ${data.expires_in}s but the code above auto-refreshes it, this refresh token is what matters long-term; it itself expires in ${data.refresh_expires_in}s (~1 year), so re-run this script if it ever lapses.)`);
    process.exit(0);
  } catch (err) {
    console.error('\nToken exchange request failed:', err.message);
    process.exit(1);
  }
});
