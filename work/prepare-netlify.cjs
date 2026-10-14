'use strict';

// Publish the confirmed root HTML. The historical build must not replace it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'index.html');
const destination = path.join(__dirname, 'netlify-deploy');
const html = fs.readFileSync(source);
const text = html.toString('utf8');

if (!/<!doctype html>/i.test(text)) throw new Error('The root index.html is not a complete HTML document.');

// Assets are currently embedded or external. Reject new local references until
// they are explicitly added to this deployment's public-file allowlist.
const markup = text
  .replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, '<script$1></script>')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
const references = [...markup.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)].map(match => match[1]);
for (const style of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
  for (const url of style[1].matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)) references.push(url[1]);
}
const localReferences = references.filter(value => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#|\?|$)/i.test(value.trim()));
if (localReferences.length) throw new Error('Local assets are not packaged: ' + [...new Set(localReferences)].join(', '));

fs.mkdirSync(destination, { recursive: true });
for (const file of fs.readdirSync(destination, { withFileTypes: true })) {
  if (file.name !== 'index.html' || !file.isFile()) throw new Error('Unexpected publish entry: ' + file.name);
}
fs.writeFileSync(path.join(destination, 'index.html'), html);
const published = fs.readFileSync(path.join(destination, 'index.html'));
if (!html.equals(published)) throw new Error('The final HTML changed while being copied.');
console.log(JSON.stringify({ files: ['index.html'], bytes: html.length, sha256: crypto.createHash('sha256').update(html).digest('hex') }));
