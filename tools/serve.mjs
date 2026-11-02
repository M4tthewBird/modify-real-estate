// Serves ../site at http://localhost:4180 with clean URLs, the way a static host does.
// Pages of our own are served straight from ../custom/<name>/public, so editing them needs no copy step.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const CUSTOM = { '/stara-sladovna': join(ROOT, 'custom', 'stara-sladovna', 'public') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf', '.bin': 'application/octet-stream' };

createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // relative links on a page without a trailing slash would point one level too high
    if (CUSTOM[pathname]) {
        res.writeHead(301, { location: `${pathname}/` });
        return res.end();
    }
    const path = normalize(pathname).replace(/\\/g, '/');
    const prefix = Object.keys(CUSTOM).find((p) => path === p || path.startsWith(`${p}/`));
    const base = prefix ? CUSTOM[prefix] : SITE;
    const rel = prefix ? path.slice(prefix.length) : path;
    const file = extname(rel) ? rel : join(rel, 'index.html');
    try {
        const body = await readFile(join(base, file));
        res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404, { 'content-type': TYPES['.html'] });
        res.end(await readFile(join(SITE, '404.html')).catch(() => 'Not found'));
    }
}).listen(4180, () => console.log('http://localhost:4180'));
