import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = (await readFile(new URL('../worker/index.js', import.meta.url), 'utf8')).replace("import { connect } from 'cloudflare:sockets';", 'const connect = () => {};');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const original = globalThis.fetch;
const rss = (host, title) => `<rss><channel><item><title>${title}</title><link>https://${host}/article</link><description>English exam preparation</description></item></channel></rss>`;
globalThis.fetch = async url => {
  url = String(url);
  if (url.includes('/news/')) return new Response(rss('news.example', 'English exam news'));
  if (url.includes('bing.com/search')) return new Response(rss('study.example', 'English exam guide'));
  return new Response('', {status: 503});
};
try {
  const response = await worker.fetch(new Request('https://local/api/ai/search', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({q: 'English exam', count: 6})}), {});
  const data = await response.json();
  assert.deepEqual(new Set(data.results.map(x => x.host)), new Set(['news.example', 'study.example']), 'collect results from both search engines');
  console.log('PASS search aggregates independent sources');
} finally { globalThis.fetch = original; }
