import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const tag = process.env.RELEASE_TAG;
if (!tag) throw new Error('RELEASE_TAG is required');
const version = encodeURIComponent(tag.replace(/^v(?=\d)/, ''));
const directory = process.env.RELEASE_DIRECTORY || 'dist/release';
mkdirSync(directory, { recursive: true });
const file = join(directory, `word-sea-typecho-${version}.zip`);

// Archive the committed source, excluding tests, workflows and local QA output.
execFileSync('git', [
  'archive', '--format=zip', '--prefix=word-sea/', `--output=${file}`, 'HEAD', '--',
  ':(top,glob)*.php', 'assets', 'friends.json', 'README.md',
  'LICENSE.txt', 'QUOTES.md', 'screenshot.png',
], { stdio: 'inherit' });
console.log(`Built ${file}`);
