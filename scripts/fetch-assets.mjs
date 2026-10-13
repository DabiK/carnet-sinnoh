// Restores the sprites and the legacy map artwork from their sources. These files are versioned:
// this is only needed to repair or refresh them.
// Usage: node scripts/fetch-assets.mjs [--force]
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ASSETS = resolve(process.env.CARNET_ASSETS || join(ROOT, 'assets'));
const FORCE = process.argv.includes('--force');

const SPECIES_COUNT = 493;
const POKEAPI_SPRITES =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/diamond-pearl/';
const REGION_ARTWORK = 'https://www.pokepedia.fr/images/thumb/9/99/Sinnoh-DEPS.png/800px-Sinnoh-DEPS.png';
const PNG_SIGNATURE = '89504e470d0a1a0a';
const USER_AGENT = 'CarnetSinnoh/0.6 (personal offline companion; asset setup script)';

/** Runs `task` over `items`, a few at a time, to stay polite with the hosts. */
async function inBatches(items, size, task) {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(task));
  }
}

/** Downloads one PNG and checks its signature and, when given, its dimensions. */
async function fetchPng(url, file, { width, height } = {}) {
  const target = join(ASSETS, file);
  if (existsSync(target) && !FORCE) return false;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${file}: HTTP ${response.status} for ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.toString('hex', 0, 8) !== PNG_SIGNATURE) throw Error(`${file}: not a PNG`);
  if ((width && bytes.readUInt32BE(16) !== width) || (height && bytes.readUInt32BE(20) !== height)) {
    throw Error(`${file}: unexpected PNG dimensions`);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return true;
}

/** The hand-picked sprites listed for the default notebook, read from the app's own script. */
async function curatedSprites() {
  const source = await readFile(join(ROOT, 'assets/js/sprite-catalog.js'), 'utf8');
  return vm.runInNewContext(`${source}\n;SPRITE_CATALOG`);
}

let downloaded = 0;
const count = (fetched) => (downloaded += fetched ? 1 : 0);

// 1. Hand-picked sprites for the species of the default notebook.
const curated = await curatedSprites();
await inBatches(curated, 3, async (sprite) =>
  count(await fetchPng(sprite.url, sprite.file, { width: sprite.width || 80, height: sprite.height || 80 })),
);

// 2. One sprite for every other species, in National Pokédex order.
const curatedFiles = new Set(curated.map((sprite) => sprite.file));
const others = Array.from({ length: SPECIES_COUNT }, (_, index) => `sprites/${index + 1}.png`).filter(
  (file) => !curatedFiles.has(file),
);
await inBatches(others, 8, async (file) =>
  count(await fetchPng(POKEAPI_SPRITES + file.replace('sprites/', ''), file, { width: 80, height: 80 })),
);

// 3. Optional background of the legacy map view.
count(await fetchPng(REGION_ARTWORK, 'sinnoh.png', { width: 800, height: 566 }));

console.log(`${downloaded} file(s) downloaded into ${ASSETS}`);
if (!existsSync(join(ASSETS, 'sinnoh-2d.png'))) {
  console.log('assets/sinnoh-2d.png is missing and its host refuses automated downloads: git restore it.');
}
