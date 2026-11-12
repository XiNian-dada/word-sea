import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { RELEASE_TAG: tag, RELEASE_SHA: sha, RELEASE_REPOSITORY: repository,
  RELEASE_API_URL: api, RELEASE_TOKEN: token } = process.env;
if (![tag, sha, repository, api, token].every(Boolean)) {
  throw new Error('Release tag, commit, repository, API URL and token are required');
}
const version = encodeURIComponent(tag.replace(/^v(?=\d)/, ''));
const filename = `word-sea-typecho-${version}.zip`;
const bytes = readFileSync(join(process.env.RELEASE_DIRECTORY || 'dist/release', filename));
const base = `${api.replace(/\/$/, '')}/repos/${repository}/releases`;

async function request(path = '', options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { Authorization: `token ${token}`, ...options.headers },
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 404 && options.allowMissing) return null;
  if (!response.ok) throw new Error(`Forgejo release API returned HTTP ${response.status}`);
  return response.json();
}

function json(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// Keep incomplete uploads as drafts; a rerun resumes without deleting releases.
let release = await request(`/tags/${encodeURIComponent(tag)}`, { allowMissing: true });
if (!release) {
  release = await request('', json('POST', {
    tag_name: tag, target_commitish: sha, name: `Word Sea ${tag}`, draft: true,
    prerelease: /(?:^|[-.])(?:alpha|beta|rc)(?:[.\d-]|$)/i.test(tag),
    body: `下载附件 ${filename}，解压后将 word-sea 文件夹上传到 Typecho 的 usr/themes/。升级前请备份现有主题文件。`,
  }));
}

const assets = await request(`/${release.id}/assets`);
const existing = assets.find(asset => asset.name === filename);
if (existing) {
  // Verify the existing attachment on retries rather than replacing user data.
  const response = await fetch(`${base}/${release.id}/assets/${existing.id}`, {
    headers: { Authorization: `token ${token}` }, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Attachment API returned HTTP ${response.status}`);
  const attachment = await response.json();
  const download = await fetch(attachment.browser_download_url, {
    headers: { Authorization: `token ${token}` }, signal: AbortSignal.timeout(60_000),
  });
  if (!download.ok || !Buffer.from(await download.arrayBuffer()).equals(bytes)) {
    throw new Error('Existing ZIP differs from this tag; refusing to overwrite it');
  }
  console.log(`Verified existing ${filename}`);
} else {
  const form = new FormData();
  form.append('attachment', new Blob([bytes], { type: 'application/zip' }), filename);
  await request(`/${release.id}/assets`, { method: 'POST', body: form });
  console.log(`Uploaded ${filename}`);
}
if (release.draft) await request(`/${release.id}`, json('PATCH', { draft: false }));
console.log(`Published Word Sea ${tag}`);
