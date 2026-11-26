import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const {
  RELEASE_TAG: tag,
  RELEASE_SHA: sha,
  GITHUB_REPOSITORY: repository,
  GH_RELEASE_TOKEN: ghToken,
  GITHUB_RELEASE_TOKEN: legacyToken,
  GITHUB_API_URL: apiUrl = 'https://api.github.com',
} = process.env;
const token = (ghToken || legacyToken || '').trim();

if (![tag, sha, repository].every(Boolean)) {
  throw new Error('RELEASE_TAG, RELEASE_SHA and GITHUB_REPOSITORY are required');
}
if (!token) {
  throw new Error(
    'GH_RELEASE_TOKEN secret is required ' +
    '(create a GitHub Fine-grained PAT with Contents: Read and write and add it to Forgejo Actions Secrets as GH_RELEASE_TOKEN)',
  );
}

const version = encodeURIComponent(tag.replace(/^v(?=\d)/, ''));
const filename = `word-sea-typecho-${version}.zip`;
const filePath = join(process.env.RELEASE_DIRECTORY || 'dist/release', filename);
const bytes = readFileSync(filePath);
const repoBase = `${apiUrl.replace(/\/$/, '')}/repos/${repository}`;
const baseHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'word-sea-forgejo-release',
};

const nodeMajor = Number(process.versions.node.split('.')[0]);
const hasProxyEnv = Boolean(
  process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy,
);
const useCurlProxy = hasProxyEnv && nodeMajor < 24 && !apiUrl.startsWith('http://127.0.0.1');

function curlRequest(url, { method = 'GET', headers = {}, body, binaryFile, responseType = 'json' } = {}) {
  const merged = { ...baseHeaders, ...headers };
  const cfgLines = [
    `url = "${url}"`,
    `request = "${method}"`,
    'silent',
    'show-error',
    'location',
    'max-time = 180',
  ];
  for (const [k, v] of Object.entries(merged)) {
    cfgLines.push(`header = "${k}: ${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  }
  const args = ['--config', '-', '--write-out', '\n%{http_code}'];
  if (binaryFile) {
    args.push('--data-binary', `@${binaryFile}`);
  } else if (body !== undefined) {
    args.push('--data-raw', typeof body === 'string' ? body : body.toString('utf8'));
  }
  const out = execFileSync('curl', args, {
    input: `${cfgLines.join('\n')}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });
  const splitIdx = out.lastIndexOf(0x0a);
  const status = Number(out.subarray(splitIdx + 1).toString('utf8').trim());
  const rawBody = splitIdx >= 0 ? out.subarray(0, splitIdx) : Buffer.alloc(0);
  if (responseType === 'buffer') return { status, data: rawBody };
  const text = rawBody.toString('utf8');
  return { status, data: text ? JSON.parse(text) : null };
}

async function ghRequest(url, { method = 'GET', headers = {}, body, binaryFile, allowMissing = false, responseType = 'json' } = {}) {
  if (useCurlProxy) {
    const res = curlRequest(url, { method, headers, body, binaryFile, responseType });
    if (res.status === 404 && allowMissing) return null;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`GitHub API ${method} ${url} returned HTTP ${res.status}`);
    }
    return res.data;
  }

  const payload = binaryFile ? readFileSync(binaryFile) : body;
  const response = await fetch(url, {
    method,
    headers: { ...baseHeaders, ...headers },
    body: payload,
    signal: AbortSignal.timeout(180_000),
  });
  if (response.status === 404 && allowMissing) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub API ${method} ${url} returned HTTP ${response.status}: ${detail.slice(0, 300)}`);
  }
  if (responseType === 'buffer') return Buffer.from(await response.arrayBuffer());
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function waitForMirroredRef(attempts = 12, delayMs = 5_000) {
  const tagRefUrl = `${repoBase}/git/ref/tags/${encodeURIComponent(tag)}`;
  const commitUrl = `${repoBase}/commits/${encodeURIComponent(sha)}`;
  for (let i = 0; i < attempts; i += 1) {
    const tagRef = await ghRequest(tagRefUrl, { allowMissing: true });
    if (tagRef) return;
    const commit = await ghRequest(commitUrl, { allowMissing: true });
    if (commit) return;
    if (i + 1 < attempts) {
      console.log(`Waiting for mirrored tag/commit on GitHub (${i + 1}/${attempts})...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `Tag ${tag} / commit ${sha} not visible on GitHub after ${(attempts * delayMs) / 1000}s; ` +
    'verify Forgejo push mirror completed cleanly.',
  );
}

async function findExistingRelease() {
  const published = await ghRequest(`${repoBase}/releases/tags/${encodeURIComponent(tag)}`, { allowMissing: true });
  if (published) return published;
  // Also locate draft releases so retries resume without creating duplicates.
  const list = await ghRequest(`${repoBase}/releases?per_page=30`);
  return (list || []).find(item => item.tag_name === tag) || null;
}

await waitForMirroredRef();

// Keep incomplete uploads as drafts; a rerun resumes without deleting releases.
let release = await findExistingRelease();
if (!release) {
  release = await ghRequest(`${repoBase}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: sha,
      name: `Word Sea ${tag}`,
      draft: true,
      prerelease: /(?:^|[-.])(?:alpha|beta|rc)(?:[.\d-]|$)/i.test(tag),
      body: `下载附件 ${filename}，解压后将 word-sea 文件夹上传到 Typecho 的 usr/themes/。升级前请备份现有主题文件。`,
    }),
  });
}

const existing = (release.assets || []).find(asset => asset.name === filename);
if (existing) {
  const downloaded = await ghRequest(`${repoBase}/releases/assets/${existing.id}`, {
    headers: { Accept: 'application/octet-stream' },
    responseType: 'buffer',
  });
  if (!downloaded.equals(bytes)) {
    throw new Error('Existing GitHub ZIP differs from this tag; refusing to overwrite it');
  }
  console.log(`Verified existing GitHub asset ${filename}`);
} else {
  const uploadBase = release.upload_url.split('{')[0];
  await ghRequest(`${uploadBase}?name=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    binaryFile: filePath,
  });
  console.log(`Uploaded ${filename} to GitHub Release`);
}

if (release.draft) {
  release = await ghRequest(`${repoBase}/releases/${release.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft: false }),
  });
}
console.log(`Published GitHub Release Word Sea ${tag}: ${release.html_url || ''}`);
