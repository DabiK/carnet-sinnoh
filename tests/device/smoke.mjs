// Smoke test of an installed debug build, on a console or an emulator: the page really loads from
// the APK, every bundled file is served, and the native bridge reaches the page.
// Needs CARNET_DEVTOOLS (scripts/forward-devtools.sh). Leaves the notebook untouched.
import assert from 'node:assert/strict';
import { openCarnet } from '../lib/webview.mjs';

assert(process.env.CARNET_DEVTOOLS, 'Set CARNET_DEVTOOLS: see scripts/forward-devtools.sh');

const carnet = await openCarnet();
try {
  await carnet.check("location.href === 'https://sinnoh.local/index.html'");
  await carnet.check("document.querySelectorAll('nav button').length === 5");
  await carnet.check("document.getElementById('content').children.length > 0");
  // Generated catalogues, from assets/data/.
  await carnet.check('ACQUISITION_CATALOG.species.length === 493 && Object.keys(ZONE_CATALOG.zones).length > 500');
  // Stylesheets and the bundled font, from assets/css/ and assets/fonts/.
  await carnet.check(
    'document.styleSheets.length === 4 && [...document.styleSheets].every((s) => s.cssRules.length > 0)',
  );
  await carnet.check("document.fonts.load('16px Nunito').then((fonts) => fonts.length > 0)");
  // Images: one sprite per species, the curated sprites and both maps.
  await carnet.check(`(async () => {
    const files = [...Array.from({ length: 493 }, (_, i) => 'sprites/' + (i + 1) + '.png'), 'sprites/egg.png', 'sinnoh.png', 'sinnoh-2d.png'];
    const loaded = await Promise.all(files.map((file) => {
      const image = new Image();
      image.src = file;
      return image.decode().then(() => image.naturalWidth > 0, () => false);
    }));
    return loaded.every(Boolean);
  })()`);
  // The native bridge: with no emulator to read, it must report an error back to the page.
  const wasOff = await carnet.evaluate("battleSnapshot.status === 'off'");
  if (wasOff) {
    await carnet.evaluate("tab = 'battle'; render(); document.querySelector('.bridge-toggle').click()");
    await carnet.check(`(async () => {
      for (let i = 0; i < 100 && !['error', 'idle', 'battle'].includes(battleSnapshot.status); i++) {
        await new Promise((retry) => setTimeout(retry, 100));
      }
      return ['error', 'idle', 'battle'].includes(battleSnapshot.status);
    })()`);
    console.log(
      'Bridge replied:',
      await carnet.evaluate('battleSnapshot.status + " · " + (battleSnapshot.message || "")'),
    );
    await carnet.evaluate("document.querySelector('.bridge-toggle').click()");
    await carnet.check(`(async () => {
      for (let i = 0; i < 50 && battleSnapshot.status !== 'off'; i++) await new Promise((retry) => setTimeout(retry, 100));
      return battleSnapshot.status === 'off';
    })()`);
    await carnet.evaluate("tab = 'now'; render()");
  }
  console.log(`${carnet.checks} smoke checks passed on ${await carnet.evaluate('navigator.userAgent')}`);
} finally {
  await carnet.close();
}
