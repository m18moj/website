const { UAParser } = require('ua-parser-js');

// What a server can actually learn about a visitor's browser, without any
// client-side fingerprinting script: the User-Agent and Accept-Language
// headers it already sends on every request, plus the IP address the
// connection arrived from. Anything beyond that (screen size, timezone,
// installed fonts, canvas/WebGL fingerprints, precise geolocation) would
// require either JavaScript running in their browser or a third-party IP
// lookup service — neither of which this does, to keep this a plain, local,
// no-external-dependency store.
function parseRequestContext(req) {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const parsed = new UAParser(userAgent).getResult();

  const browser = parsed.browser.name
    ? `${parsed.browser.name}${parsed.browser.version ? ` ${parsed.browser.version}` : ''}`
    : null;
  const os = parsed.os.name
    ? `${parsed.os.name}${parsed.os.version ? ` ${parsed.os.version}` : ''}`
    : null;
  const deviceType = parsed.device.type || 'desktop';

  return {
    ip: req.ip,
    userAgent: userAgent || null,
    browser,
    os,
    deviceType,
    acceptLanguage: acceptLanguage.split(',')[0] || null
  };
}

module.exports = { parseRequestContext };
