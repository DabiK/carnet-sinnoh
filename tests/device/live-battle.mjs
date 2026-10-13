// Manual check on the console, during a real battle: the bridge keeps publishing, the sheet fits
// the screen without scrolling and the notebook is left untouched.
// Needs a debug build, the bridge connected and CARNET_DEVTOOLS set (scripts/forward-devtools.sh).
import assert from 'node:assert/strict';
import { openCarnet } from '../lib/webview.mjs';

assert(process.env.CARNET_DEVTOOLS, 'This check only makes sense on the console: set CARNET_DEVTOOLS');

const carnet = await openCarnet();
try {
  const result = await carnet.evaluate(`(async () => {
    for (let i = 0; i < 75 && battleSnapshot.status !== 'battle'; i++) await new Promise((ok) => setTimeout(ok, 200));
    if (battleSnapshot.status !== 'battle') throw Error('No live battle');
    const original = JSON.stringify(state);
    const stamp = battleSnapshot.timestamp;
    await new Promise((ok) => setTimeout(ok, 6500));
    if (document.querySelectorAll('.capture-stat').length !== 6) throw Error('Missing statistics');
    if (document.querySelectorAll('.capture-iv').length !== 6) throw Error('Missing IVs');
    const body = document.querySelector('.capture-body');
    if (body.scrollHeight > body.clientHeight) throw Error('Capture sheet overflows');
    const sheetBottom = document.querySelector('.capture-weak').getBoundingClientRect().bottom;
    if (sheetBottom >= document.querySelector('nav').getBoundingClientRect().top) throw Error('Bottom menu covers the sheet');
    if (scrollY !== 0) throw Error('Combat scrolls');
    if (battleSnapshot.timestamp <= stamp) throw Error('Bridge failed to refresh');
    if (JSON.stringify(state) !== original) throw Error('Carnet changed');
    return battleSnapshot;
  })()`);
  console.log('Live refresh keeps six stats, IVs and attacks visible without scrolling and preserves the carnet.');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await carnet.close();
}
