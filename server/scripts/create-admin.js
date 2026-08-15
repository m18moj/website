// Run locally with: npm run create-admin -- --username youradmin --password "Str0ngPassword!"
// Or set ADMIN_USERNAME / ADMIN_PASSWORD in .env and run: npm run create-admin
//
// This is intentionally a filesystem-only CLI, not an HTTP endpoint — there is
// no way to create or promote an admin account over the network, only by
// someone with local access to this machine and its .env file.
require('dotenv').config();
const bcrypt = require('bcrypt');
const usersModel = require('../models/users');

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,24}$/;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = value;
      if (value !== true) i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = (args.username || process.env.ADMIN_USERNAME || '').trim();
  const password = args.password || process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('Missing username or password.');
    console.error('Usage: npm run create-admin -- --username youradmin --password "Str0ngPassword!"');
    console.error('(Or set ADMIN_USERNAME / ADMIN_PASSWORD in .env and run: npm run create-admin)');
    process.exitCode = 1;
    return;
  }

  if (!USERNAME_PATTERN.test(username)) {
    console.error('Username must be 3-24 characters: letters, numbers, underscores, or hyphens only.');
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = usersModel.findByUsername(username);

  if (existing) {
    usersModel.promoteToAdmin(existing.id, passwordHash);
    console.log(`Existing account "${username}" is now an admin, and its password was updated to the one you just provided.`);
  } else {
    usersModel.createUser({ username, passwordHash, role: 'admin' });
    console.log(`Admin account created: ${username}`);
  }

  const port = process.env.PORT || 3000;
  console.log(`Sign in at http://localhost:${port}/pages/login with that username and password.`);
  console.log('If the server is already running, restart it now — Node\'s SQLite driver can take a moment to notice changes made by another process while it\'s up, so signing in immediately after this may briefly fail.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
