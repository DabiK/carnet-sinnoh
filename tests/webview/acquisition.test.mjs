import test from 'node:test';
import { withCarnet } from '../lib/webview.mjs';

test('Pokédex and goals: search, species sheet, map, persistence', async (t) => {
  const checks = await withCarnet(async ({ evaluate, check, reload }) => {
    await evaluate(
      "state=defaults();questMode='pokemon';catalogScope='gen4';catalogQuery='';catalogLegacy=false;catalogSelectedDex=null;detailMon=null;catalogMapDex=null;tab='now';render()",
    );
    await check(
      "ACQUISITION_CATALOG.species.length===493 && state.targets.length===0 && document.getElementById('content').textContent.includes('Qui veux-tu rencontrer')",
    );
    await evaluate("document.querySelector('[data-open-catalog]').click()");
    await check("tab==='team' && document.querySelectorAll('.catalog-mon').length===24");
    await check(
      "catalogScope==='gen4' && document.querySelector('.catalog-result-count').textContent==='107 Pokémon' && [...document.querySelectorAll('.catalog-mon')].every(m=>Number(m.dataset.obtainDetail)>=387)",
    );
    await evaluate(
      "document.getElementById('catalogSearch').value='Pikachu';document.getElementById('catalogSearch').dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await check("document.querySelectorAll('.catalog-mon').length===0");
    await evaluate("document.querySelector('[data-catalog-scope=national]').click()");
    await check(
      "document.querySelectorAll('.catalog-mon').length===1 && document.querySelector('.catalog-mon').dataset.obtainDetail==='25' && document.querySelector('[data-catalog-scope=national]').getAttribute('aria-pressed')==='true'",
    );
    await evaluate("document.querySelector('[data-catalog-scope=gen4]').click()");
    await evaluate(
      "document.getElementById('catalogSearch').value='Carchacrok';document.getElementById('catalogSearch').dispatchEvent(new Event('input',{bubbles:true}))",
    );
    await check(
      "document.querySelectorAll('.catalog-mon').length===1 && document.querySelector('.catalog-mon').dataset.obtainDetail==='445'",
    );
    await evaluate("document.querySelector('.catalog-mon').click()");
    await check(
      "document.getElementById('obtainDetail').open && document.querySelector('.obtain-sheet').textContent.includes('Griknot') && document.querySelector('.obtain-sheet').textContent.includes('Niveau 24') && document.querySelector('.obtain-sheet').textContent.includes('Niveau 48')",
    );
    await evaluate("document.querySelector('[data-want]').click()");
    await check(
      "state.targets.length===1 && state.targets[0].dex===445 && document.querySelector('[data-want]').disabled",
    );
    await evaluate("document.querySelector('[data-close-obtain]').click();tab='now';render()");
    await check("document.querySelector('.obtain-goal h2').textContent==='Carchacrok'");
    await evaluate("document.querySelector('[data-obtain-map]').click()");
    await check("tab==='map' && document.querySelectorAll('.acquisition-map .pin').length===4");
    await evaluate("document.querySelector('[data-obtain-pin=grottedesegaresentreesecrete]').click()");
    await check(
      "document.querySelector('.obtain-map-info').textContent.includes('Grotte des Égarés') && document.querySelector('.map-canvas').style.width==='100%'",
    );
    await evaluate("document.querySelector('[data-obtain-pin=cavernedumiroirdeau]').click()");
    await check(
      "document.querySelector('.obtain-map-info').textContent.includes('Badge Glaçon') && document.querySelector('.obtain-map-info').textContent.includes('ce point ne situe pas la grotte')",
    );
    await evaluate("document.querySelector('.map-controls button:last-child').click()");
    await check("document.querySelector('.map-canvas').style.width==='150%'");
    await evaluate("tab='now';render();document.querySelector('[data-obtained]').click()");
    await check('state.targets[0].obtained===true && JSON.parse(localStorage.getItem(KEY)).targets[0].obtained===true');
    await check('(()=>{try{validate({...state,targets:[{dex:999}]});return false}catch{return true}})()');
    await check('(()=>{try{validate({...state,targets:[{dex:445},{dex:445}]});return false}catch{return true}})()');
    await check('acquisitionOptions(429)[0].externalVersion===true');
    await check(
      "acquisitionOptions(228)[0].start.dex===229 && acquisitionOptions(228)[0].breeding.placeId==='garderiebonville'",
    );
    await evaluate("catalogSelectedDex=251;tab='team';render()");
    await check(
      "document.querySelector('.obtain-sheet').textContent.includes('Pokémon HOME concerne les jeux officiels')",
    );
    await evaluate("catalogSelectedDex=null;catalogMapDex=228;catalogMapPlace='garderiebonville';tab='map';render()");
    await check(
      "document.querySelector('.obtain-map-info').textContent.includes('Garderie de Bonville') && document.querySelector('.obtain-map-info').textContent.includes('Faire reproduire Démolosse')",
    );
    await reload();
    await evaluate("questMode='pokemon';render()");
    await check("catalogScope==='gen4' && state.targets[0].dex===445 && state.targets[0].obtained===true");
    await evaluate("tab='now';render();document.querySelector('[data-remove-target]').click()");
    await check('state.targets.length===0 && JSON.parse(localStorage.getItem(KEY)).targets.length===0');
    await check('document.body.scrollWidth<=innerWidth');
  });
  t.diagnostic(`${checks} checks`);
});
