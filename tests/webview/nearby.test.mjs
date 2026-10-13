import test from 'node:test';
import { withCarnet } from '../lib/webview.mjs';

test('Encounter map: rates, conditions, sub-areas', async (t) => {
  const checks = await withCarnet(async ({ evaluate, check, reload }) => {
    await evaluate(
      "state=defaults();state.targets=[{dex:389,obtained:false}];tab='map';nearbyMapActive=true;catalogLegacy=false;contextMapActive=false;window.fixture=(zoneId,items={})=>receiveBattleSnapshot({status:'idle',world:{status:'live',zoneId,items,party:[],badgeMask:0,badges:0,nationalDex:false,leagueCleared:false,timestamp:Date.now()},timestamp:Date.now()});fixture(355);render()",
    );
    await check("nearbyGroups().filter(g=>g.available).map(g=>g.mon.dex).join(',')==='396,399,401,403'");
    await check(
      'document.querySelector(\'.nearby-list [data-nearby-mon="403"]\')!==null && state.targets.length===1 && state.targets[0].dex===389',
    );
    await check(
      "document.querySelector('[data-nearby-mon=\"403\"]').textContent.includes('30 %') && document.querySelector('[data-nearby-mon=\"399\"]').textContent.includes('30 %')",
    );
    await check(
      "document.querySelector('[data-nearby-mon=\"396\"]').textContent.includes('40 %') && document.querySelector('[data-nearby-mon=\"396\"]').textContent.includes('Jour')",
    );
    await check(
      "document.querySelector('[data-nearby-mon=\"401\"]').textContent.includes('Matin') && document.querySelector('[data-nearby-mon=\"401\"]').textContent.includes('Nuit') && document.querySelector('[data-nearby-mon=\"401\"]').textContent.includes('10 %')",
    );
    await check(
      'document.querySelector(\'.nearby-conditional [data-nearby-mon="263"]\')!==null && !nearbyGroups().find(g=>g.mon.dex===263).available',
    );
    await check(
      "[...document.querySelectorAll('[data-nearby-mon] a')].every(a=>a.href.includes('Route_202')) && document.querySelector('[data-nearby-pin]')!==null",
    );
    await check(
      "document.getElementById('content').textContent.includes('taux de rencontre, pas les chances') && document.body.scrollWidth<=innerWidth",
    );
    await evaluate('fixture(354)');
    await check(
      "document.querySelector('.nearby-heading').textContent.includes('Route 201') && !document.querySelector('[data-nearby-mon=\"403\"]')",
    );
    await evaluate(
      "window.rodZone=Number(Object.values(ZONE_CATALOG.zones).find(z=>z.regionKey==='route218').id);fixture(rodZone)",
    );
    await check('nearbyGroups().find(g=>g.mon.dex===129) && !nearbyGroups().find(g=>g.mon.dex===129).available');
    await evaluate('fixture(rodZone,{445:1})');
    await check(
      "nearbyGroups().find(g=>g.mon.dex===129).available && document.querySelector('.nearby-list [data-nearby-mon=\"129\"]').textContent.includes('100 %')",
    );
    await evaluate('fixture(292)');
    await check(
      "nearbyPlaces(hereContext()).every(p=>p.subarea==='entrée principale') && !document.querySelector('[data-nearby-mon=\"443\"]')",
    );
    await evaluate('fixture(293)');
    await check(
      "nearbyPlaces(hereContext()).every(p=>p.subarea==='entrée secrète') && nearbyGroups().find(g=>g.mon.dex===443).available && document.querySelector('[data-nearby-mon=\"443\"]').textContent.includes('15 %')",
    );
    await evaluate('fixture(200)');
    await check('nearbyGroups().some(g=>g.mon.dex===198) && !nearbyGroups().some(g=>g.mon.dex===200)');
    await check(
      "nearbyRate({rates:{all:'Commun'}}).includes('Commun') && !nearbyRate({rates:{all:'Commun'}}).includes('Commun %') && nearbyRate({rates:{}}).includes('non documenté')",
    );
    await evaluate("document.querySelector('[data-obtain-detail]').click()");
    await check("document.getElementById('obtainDetail').open");
    await evaluate(
      "document.querySelector('[data-close-obtain]').click();fixture(355);window.scrollTo(0,150);fixture(355,{4:20})",
    );
    await check(
      "document.querySelector('.nearby-heading').textContent.includes('Route 202') && document.body.scrollWidth<=innerWidth",
    );
    await evaluate("receiveBattleSnapshot({status:'off'});state.location='Route 201';render()");
    await check(
      "!hereContext().live && document.querySelector('.nearby-heading').textContent.includes('MANUELLE') && document.querySelector('[data-open-progress]')",
    );
    await evaluate("state.location='Début de l’aventure';render()");
    await check(
      "document.querySelectorAll('[data-nearby-mon]').length===0 && document.getElementById('content').textContent.includes('Ta position est nécessaire')",
    );
    await evaluate('fixture(508)');
    await check(
      "document.querySelectorAll('[data-nearby-mon]').length===0 && document.getElementById('content').textContent.includes('biome précis')",
    );
    await evaluate(
      "state.targets=[{dex:398,obtained:false}];tab='now';questMode='pokemon';render();document.querySelector('[data-obtain-map]').click()",
    );
    await check("tab==='map' && !nearbyMapActive && document.querySelector('.obtain-map-info')");
    await evaluate("document.querySelector('nav [data-tab=map]').click();fixture(355)");
    await check(
      "nearbyMapActive && document.querySelector('.nearby-heading') && document.querySelector('.nearby-list [data-nearby-mon=\"403\"]')",
    );
  });
  t.diagnostic(`${checks} checks`);
});
