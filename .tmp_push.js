const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

const ROOT = '/home/runner/workspace';
const OWNER = 'christ-sukuna';
const REPO = 'sigma';
const BRANCH = 'main';

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.cache', '.local', '.agents',
  'sessions', 'sessions-temp', 'backups', 'attached_assets',
  '.upm', '.config', '.replit_cache',
]);
const EXCLUDE_FILES = new Set([
  '.env', 'zipFile.zip', '.DS_Store',
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (dir === ROOT && (EXCLUDE_DIRS.has(name) || EXCLUDE_FILES.has(name))) continue;
    if (EXCLUDE_DIRS.has(name)) continue;
    if (EXCLUDE_FILES.has(name)) continue;
    if (name.endsWith('.log')) continue;
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile()) {
      // Skip binaries larger than 50MB just in case
      if (stat.size > 50 * 1024 * 1024) { console.log('SKIP big:', rel, stat.size); continue; }
      out.push({ rel, full, size: stat.size });
    }
  }
  return out;
}

(async () => {
  const o = new Octokit({ auth: process.env.GITHUB_TOKEN });

  const files = walk(ROOT);
  console.log(`Found ${files.length} files, total bytes: ${files.reduce((a,f)=>a+f.size,0)}`);

  // Bootstrap: empty repos reject blob creation. Seed with a placeholder file via Contents API.
  console.log('Bootstrapping empty repo...');
  try {
    await o.repos.createOrUpdateFileContents({
      owner: OWNER, repo: REPO,
      path: '.bootstrap',
      message: 'bootstrap',
      content: Buffer.from('init').toString('base64'),
      branch: BRANCH,
    });
    console.log('  bootstrap file created');
  } catch (e) {
    if (e.status === 422) console.log('  already bootstrapped');
    else throw e;
  }

  // Create blobs
  console.log('Uploading blobs...');
  const tree = [];
  let i = 0;
  for (const f of files) {
    const content = fs.readFileSync(f.full);
    const { data: blob } = await o.git.createBlob({
      owner: OWNER, repo: REPO,
      content: content.toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: f.rel.split(path.sep).join('/'), mode: '100644', type: 'blob', sha: blob.sha });
    i++;
    if (i % 25 === 0) console.log(`  ${i}/${files.length}`);
  }
  console.log(`  ${i}/${files.length} done`);

  // Create tree (single shot since repo is empty)
  console.log('Creating tree...');
  const { data: treeObj } = await o.git.createTree({
    owner: OWNER, repo: REPO,
    tree,
  });

  // Create commit (with bootstrap parent)
  console.log('Creating commit...');
  const { data: ref } = await o.git.getRef({ owner: OWNER, repo: REPO, ref: `heads/${BRANCH}` });
  const parentSha = ref.object.sha;
  const { data: commit } = await o.git.createCommit({
    owner: OWNER, repo: REPO,
    message: 'Initial commit: Sigma MDX WhatsApp Bot Builder',
    tree: treeObj.sha,
    parents: [parentSha],
  });
  console.log('Commit SHA:', commit.sha);

  // Create or update branch ref
  console.log('Updating branch ref main...');
  try {
    await o.git.createRef({ owner: OWNER, repo: REPO, ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    console.log('Created ref refs/heads/' + BRANCH);
  } catch (e) {
    if (e.status === 422) {
      await o.git.updateRef({ owner: OWNER, repo: REPO, ref: `heads/${BRANCH}`, sha: commit.sha, force: true });
      console.log('Updated ref heads/' + BRANCH);
    } else throw e;
  }

  console.log('\nDONE: https://github.com/' + OWNER + '/' + REPO);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
