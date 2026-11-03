// Builds ../_site for GitHub Pages from our own pages, laid out like tools/serve.mjs serves them.
// Usage: node tools/pages.mjs <base path, e.g. /modify-real-estate>
// Root-relative links in the pages assume the copy of the site at the domain root. On Pages that copy is not there,
// so /assets/... point at the few files committed from site/assets, and every other root link goes to the live site.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const PAGES = ['barak', 'stara-sladovna', 'stara-sladovna-gym-threejs'];
const LIVE = 'https://modifyrealestate.cz';
const base = (process.argv[2] ?? '').replace(/\/$/, '');

const files = async (dir) => (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));

await rm(OUT, { recursive: true, force: true });
const assets = new Set();
for (const page of PAGES) {
    const dest = join(OUT, page);
    await cp(join(ROOT, 'custom', page, 'public'), dest, { recursive: true });
    for (const file of await files(dest)) {
        if (!['.html', '.js', '.json', '.css'].includes(extname(file))) continue;
        const text = await readFile(file, 'utf8');
        // data.js builds photo URLs from a PHOTOS folder constant
        const photos = text.match(/const PHOTOS = '\/(assets\/[^']+)'/)?.[1];
        if (photos) for (const [, name] of text.matchAll(/\$\{PHOTOS\}\/([^`]+)`/g)) assets.add(`${photos}/${name}`);
        const out = text
            // root-relative URLs only: a quote, then / and a letter (not //cdn or a regex)
            .replace(/(["'`(])\/(assets\/[^"'`)\s]+)/g, (_, q, path) => (assets.add(path), `${q}${base}/${path}`))
            .replace(/(href="|profile: ')\/(?!\/)/g, `$1${LIVE}/`);
        if (out !== text) await writeFile(file, out);
    }
}

const missing = [];
for (const path of assets) {
    if (!extname(path)) continue; // the PHOTOS folder itself
    const src = join(ROOT, 'site', path);
    if (!existsSync(src)) { missing.push(`site/${path}`); continue; }
    await mkdir(dirname(join(OUT, path)), { recursive: true });
    await cp(src, join(OUT, path));
}
if (missing.length) {
    console.error(`Missing in site/ (add them with git add -f):\n${missing.join('\n')}`);
    process.exit(1);
}
// the address of the Pages site itself opens the offices' page
await writeFile(join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=stara-sladovna/"><title>Stará Sladovna</title><a href="stara-sladovna/">Stará Sladovna</a> · <a href="stara-sladovna-gym-threejs/">Stará Sladovna, gym ve 3D</a> · <a href="barak/">Barák</a>
`);
console.log(`_site: ${PAGES.join(', ')}, ${assets.size} asset references`);
