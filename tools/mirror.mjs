// Copies modifyrealestate.cz (Webflow) into ../site as a static site that needs nothing from Webflow.
// The original HTML goes to ../raw. Run: node tools/mirror.mjs
// Tracking is left out and forms are switched off in this development copy: see README.md.
import { access, cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const RAW = join(ROOT, 'raw');
const ORIGIN = 'https://modifyrealestate.cz';
const SELF = /^https?:\/\/(?:www\.)?modifyrealestate\.cz/;
const HOSTS = ['cdn.prod.website-files.com', 'uploads-ssl.webflow.com', 'assets.website-files.com', 'd3e54v103j8qbb.cloudfront.net', 'ajax.googleapis.com', 'cdn.jsdelivr.net'];
const HOST_RE = HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|');
const assetRe = () => new RegExp(`(?:https?:)?//(?:${HOST_RE})/(?:(?!&quot;|&#x27;|&#39;|,https?:)[^\\s"'<>\\\\\`])+`, 'g');
const TRACKING = /googletagmanager|connect\.facebook\.net|fbq\(|consent\.cookiebot|facebook\.com\/tr/;
const UA = 'Mozilla/5.0 (site migration with the owner permission)';
const PAGE_WORKERS = 3;
const ASSET_WORKERS = 6;

const failures = [];
const assets = new Map(); // url -> local path
const queue = [];

const absolute = (url) => (url.startsWith('//') ? `https:${url}` : url).replace(/&amp;/g, '&');

const get = async (url) => {
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch(url, { headers: { 'user-agent': UA } });
            if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            if (attempt >= 3) throw err;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
};

/** Closing brackets and separators a URL match can pick up from srcset or an unquoted css url(). */
const trim = (url) => {
    let u = url.replace(/[,;]+$/, '');
    while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
    return u;
};

const localPath = (raw) => {
    const url = new URL(absolute(raw));
    const safe = decodeURIComponent(url.pathname)
        .split('/')
        .filter(Boolean)
        .map((s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._@-]/g, '_'));
    if (safe.join('/') !== url.pathname.slice(1) || url.search) {
        const file = safe.pop();
        const tag = createHash('sha1').update(url.pathname + url.search).digest('hex').slice(0, 8);
        const dot = file.lastIndexOf('.');
        safe.push(dot > 0 ? `${file.slice(0, dot)}-${tag}${file.slice(dot)}` : `${file}-${tag}`);
    }
    return `/assets/${url.hostname}/${safe.join('/')}`;
};

/** Swaps every asset address in the text for its local path and queues the download. */
const claim = (text) =>
    text.replace(assetRe(), (match) => {
        // a template inside a script is filled in at run time, not a file to fetch
        if (match.includes('${')) return match;
        const url = trim(match);
        const rest = match.slice(url.length);
        try {
            let local = assets.get(url);
            if (!local) {
                local = localPath(url);
                assets.set(url, local);
                queue.push(url);
            }
            return local + rest;
        } catch {
            return match;
        }
    });

const removeTracking = (html) =>
    html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (tag) => (TRACKING.test(tag) ? '' : tag))
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/g, (tag) => (TRACKING.test(tag) ? '' : tag))
        .replace(/<link\b[^>]*(?:googletagmanager|connect\.facebook\.net)[^>]*>/g, '')
        .replace(/<link\b[^>]*rel="(?:preconnect|dns-prefetch)"[^>]*>/g, (tag) => (tag.includes('website-files') ? '' : tag));

const transformHtml = (html, links) => {
    const out = removeTracking(html)
        .replace(/<(script|link)\b[^>]*>/g, (tag) => tag.replace(/\s(?:integrity|crossorigin)(?:="[^"]*")?/g, ''))
        .replace(/<a\b[^>]*>/g, (tag) =>
            tag.replace(/href="([^"]*)"/, (m, href) => {
                const rel = href.replace(SELF, '') || '/';
                if (rel.startsWith('/') && !rel.startsWith('//')) links.push(rel);
                return `href="${SELF.test(href) ? rel : href}"`;
            })
        );
    // social previews need absolute addresses
    const withMeta = out.replace(/<meta\b[^>]*>/g, (tag) => claim(tag).replace(/content="\/assets\//, `content="${ORIGIN}/assets/`));
    return claim(withMeta).replace('</head>', '<link href="/overrides.css" rel="stylesheet"/><script src="/forms-off.js"></script></head>');
};

const pageFile = (dir, path) => join(dir, ...path.split('/').filter(Boolean), 'index.html');

const crawl = async () => {
    const sitemap = await (await get(`${ORIGIN}/sitemap.xml`)).text();
    const todo = [...sitemap.matchAll(/<loc>([^<]+)/g)].map((m) => new URL(m[1]).pathname);
    const seen = new Set(todo);
    let found = 0;
    const worker = async () => {
        while (todo.length) {
            const path = todo.shift();
            const res = await get(ORIGIN + path);
            if (!res.ok) {
                failures.push(`${res.status} ${path}`);
                continue;
            }
            if (!(res.headers.get('content-type') ?? '').includes('html')) continue;
            const html = await res.text();
            const links = [];
            const out = transformHtml(html, links);
            for (const [dir, body] of [[RAW, html], [SITE, out]]) {
                const file = pageFile(dir, path);
                await mkdir(dirname(file), { recursive: true });
                await writeFile(file, body);
            }
            found++;
            for (const link of links) {
                const clean = link.split(/[?#]/)[0].replace(/\/$/, '') || '/';
                if (!seen.has(clean) && !/\.[a-z0-9]{2,5}$/i.test(clean)) {
                    seen.add(clean);
                    todo.push(clean);
                }
            }
        }
    };
    while (todo.length) await Promise.all(Array.from({ length: PAGE_WORKERS }, worker));
    // the site's own error page
    const missing = await fetch(`${ORIGIN}/404`, { headers: { 'user-agent': UA } });
    await writeFile(join(SITE, '404.html'), transformHtml(await missing.text(), []));
    return found;
};

const downloadAssets = async () => {
    let bytes = 0;
    let done = 0;
    const worker = async () => {
        while (queue.length) {
            const url = queue.shift();
            const file = join(SITE, ...assets.get(url).split('/').filter(Boolean));
            const isText = /\.(css|js)$/i.test(new URL(absolute(url)).pathname);
            // files already here stay; stylesheets and scripts are rewritten, so they are always fetched
            if (!isText && (await access(file).then(() => true, () => false))) continue;
            try {
                const res = await get(absolute(url));
                if (!res.ok) {
                    failures.push(`${res.status} ${url}`);
                    continue;
                }
                let body = Buffer.from(await res.arrayBuffer());
                // stylesheets and scripts point at further files
                if (isText) body = Buffer.from(claim(body.toString('utf8')));
                await mkdir(dirname(file), { recursive: true });
                await writeFile(file, body);
                bytes += body.length;
                if (++done % 200 === 0) console.log(`  ${done} files, ${(bytes / 1e6).toFixed(0)} MB, ${queue.length} left`);
            } catch (err) {
                failures.push(`${err.message} ${url}`);
            }
        }
    };
    while (queue.length) await Promise.all(Array.from({ length: ASSET_WORKERS }, worker));
    return { done, bytes };
};

await mkdir(SITE, { recursive: true });
const pages = await crawl();
console.log(`${pages} pages, ${queue.length} assets found`);
const { done, bytes } = await downloadAssets();
for (const file of ['forms-off.js', 'overrides.css']) await writeFile(join(SITE, file), await readFile(join(ROOT, 'tools', file)));
// our own pages travel with the copy, so site/ alone can be deployed
await cp(join(ROOT, 'custom', 'stara-sladovna', 'public'), join(SITE, 'stara-sladovna'), { recursive: true });
await writeFile(join(ROOT, 'mirror-report.json'), JSON.stringify({ when: new Date().toISOString(), pages, assets: done, megabytes: Math.round(bytes / 1e6), failures }, null, 2));
console.log(`done: ${pages} pages, ${done} assets, ${(bytes / 1e6).toFixed(0)} MB, ${failures.length} failures`);
failures.slice(0, 40).forEach((f) => console.log('  FAIL', f));
