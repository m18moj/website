// One-time interactive CLI to mint a YouTube refresh token — run via
// `npm run social:youtube-auth`. Needs YOUTUBE_CLIENT_ID/CLIENT_SECRET
// already set in social/.env (from a Google Cloud project with the YouTube
// Data API v3 enabled and an OAuth client of type "Web application").
// Prints a consent URL, runs a throwaway local HTTP server to catch the
// redirect, exchanges the code for tokens, and prints the refresh token to
// paste into social/.env as YOUTUBE_REFRESH_TOKEN. Same one-shot,
// paste-the-result-into-.env pattern as server/scripts/create-admin.js.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const crypto = require('crypto');

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const PORT = Number(process.env.YOUTUBE_OAUTH_LOCAL_PORT) || 8934;
const REDIRECT_URI = process.env.YOUTUBE_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in social/.env first (from a Google Cloud OAuth client), then re-run this.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline', // required to get a refresh_token back
  prompt: 'consent', // forces a fresh refresh_token even if this app was authorized before
  state
}).toString();

console.log(`\nRegister this exact redirect URI in the Google Cloud Console (APIs & Services -> Credentials -> your OAuth client -> Authorized redirect URIs) if you haven't already:\n  ${REDIRECT_URI}\n`);
console.log('Then open this URL in a browser and approve access:\n');
console.log(authUrl.toString());
console.log(`\nWaiting for the redirect on ${REDIRECT_URI} ...`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code || returnedState !== state) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Missing code or state mismatch — close this tab and re-run the script.');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Authorized — you can close this tab and return to the terminal.');
  server.close();

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.refresh_token) {
      console.error('\nToken exchange failed:', data.error_description || data.error || data);
      console.error('If there is no refresh_token in the response, revoke this app\'s access at https://myaccount.google.com/permissions and re-run — Google only issues one on the first consent (or with prompt=consent, which this script already sends).');
      process.exit(1);
    }
    console.log('\nSuccess. Add this to social/.env:\n');
    console.log(`YOUTUBE_REFRESH_TOKEN=${data.refresh_token}`);
    console.log('\nYOUTUBE_CHANNEL_ID also needs to be set by hand — find it at https://studio.youtube.com (Settings -> Channel -> Advanced settings).');
    process.exit(0);
  } catch (err) {
    console.error('\nToken exchange request failed:', err.message);
    process.exit(1);
  }
});

server.listen(PORT);
