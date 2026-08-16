// Bumps video-admin/version.json before a deploy, so the dashboard can show
// the running version, build counter, git commit, and deploy time. Runs
// automatically via `npm run deploy`; or directly: node scripts/version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'video-admin', 'version.json');

let prev = {};
try { prev = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first build */ }

const build = (Number.isInteger(prev.build) ? prev.build : 0) + 1;
const version = `1.0.${build}`;
let commit = 'dev';
try { commit = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { /* not a git repo */ }
const builtAt = new Date().toISOString();

writeFileSync(file, JSON.stringify({ version, build, commit, builtAt }, null, 2) + '\n');
console.log(`[version] v${version} (build ${build}) commit ${commit} ${builtAt}`);
