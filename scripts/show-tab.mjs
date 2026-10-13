// Switches the running app to a tab, e.g. before taking a screenshot of the console.
// Usage: CARNET_DEVTOOLS=http://127.0.0.1:39115 node scripts/show-tab.mjs [now|map|team|battle|journal]
import { openCarnet } from '../tests/lib/webview.mjs';

const TABS = ['now', 'map', 'team', 'battle', 'journal'];
const tab = process.argv[2] || 'now';
if (!TABS.includes(tab)) throw Error(`Unknown tab "${tab}": expected one of ${TABS.join(', ')}`);

if (!process.env.CARNET_DEVTOOLS) throw Error('Set CARNET_DEVTOOLS: see scripts/forward-devtools.sh');

const carnet = await openCarnet();
try {
  await carnet.evaluate(`tab = ${JSON.stringify(tab)}; configure = false; render(); window.scrollTo(0, 0)`);
} finally {
  await carnet.close();
}
