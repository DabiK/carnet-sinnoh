import test from 'node:test';
import { withCarnet } from '../lib/webview.mjs';

test('"Ici" board: zone read from the game, bag, party, stale data', async (t) => {
  const checks = await withCarnet(async ({ evaluate, check, reload }) => {
    await evaluate(
      "state=defaults();state.targets=[389,398,130,229,448,445].map(dex=>({dex,obtained:false}));tab='now';questMode='here';catalogLegacy=false;hereScope='current';contextMapActive=false",
    );
    await evaluate(
      "window.fixture=(zoneId,items={},party=[])=>receiveBattleSnapshot({status:'idle',world:{status:'live',zoneId,items,party,badgeMask:0,badges:0,nationalDex:false,leagueCleared:false,timestamp:Date.now()},timestamp:Date.now()});fixture(354,{4:37})",
    );
    await check(
      "hereContext().zone.name==='Route 201' && document.querySelector('[data-here-card=catch-398-route201-396]')!==null && !document.getElementById('content').innerText.includes('Grelot Zen')",
    );
    await check(
      "document.getElementById('content').innerText.includes('37 Poké Balls') && state.board.visited.includes(354)",
    );
    await evaluate("fixture(354,{4:37},[{dex:387,nickname:'Rapidos'},{dex:396,nickname:'Étourmi'}])");
    await check(
      "document.querySelector('[data-here-card=train-398]') && !document.querySelector('[data-here-card=catch-398-route201-396]') && document.getElementById('content').innerText.includes('Niveau 34')",
    );
    await check("document.querySelector('[data-here-card=train-389] img').getAttribute('src')==='sprites/387.png'");
    await evaluate(
      "{const box=document.querySelector('[data-here-done=potions-201]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))}",
    );
    await check(
      "state.board.done['potions-201'] && JSON.parse(localStorage.getItem(KEY)).board.done['potions-201'] && document.querySelector('.here-completed')",
    );
    await evaluate('fixture(0)');
    await check(
      "hereContext().zone.name==='Féli-Cité' && document.querySelector('[data-here-card=item-445]') && document.querySelector('[data-here-card=item-217]') && !document.querySelector('[data-here-card=potions-201]')",
    );
    await evaluate('fixture(0,{445:1})');
    await check(
      "document.querySelector('[data-here-card=item-445]').textContent.includes('Dans le sac') && !state.flags.rod && !state.targets.some(t=>t.obtained)",
    );
    await evaluate("fixture(354);document.querySelector('[data-here-scope=visited]').click()");
    await check(
      "document.querySelector('[data-here-card=item-445]') && !document.querySelector('[data-here-card=item-218]')",
    );
    await evaluate("document.querySelector('[data-here-scope=current]').click();fixture(429)");
    await check("hereContext().zone.name==='Littorella' && !document.querySelector('[data-here-card=item-445]')");
    await evaluate('fixture(0,{},[{dex:387,heldItem:217}])');
    await check(
      "document.querySelector('[data-here-card=item-217]').textContent.includes('Déjà équipé') && !state.board.done['item-217']",
    );
    await evaluate('fixture(379)');
    await check("hereContext().zone.name==='Route 212' && !document.querySelector('[data-here-card=item-218]')");
    await evaluate('fixture(380)');
    await check("hereContext().zone.name==='Manoir Pokémon' && document.querySelector('[data-here-card=item-218]')");
    await evaluate('state.targets=[{dex:65,obtained:false}];fixture(380);render()');
    await check("!document.querySelector('[data-here-card=item-218]')");
    await evaluate('fixture(0,{},[{dex:387,heldItem:0}])');
    await check("document.querySelector('[data-here-card=item-217]')!==null");
    await evaluate(
      "fixture(354);state.targets=[{dex:398,obtained:false}];render();document.querySelector('[data-here-map]').click()",
    );
    await check(
      "tab==='map' && nearbyMapActive && !contextMapActive && document.querySelectorAll('[data-nearby-pin]').length===1 && document.querySelector('.nearby-heading').textContent.includes('Route 201')",
    );
    await check('document.body.scrollWidth<=innerWidth');
    await evaluate(
      "document.querySelector('[data-here-return]').click();document.querySelector('[data-obtain-detail]').click()",
    );
    await check("document.getElementById('obtainDetail').open");
    await evaluate(
      "catalogSelectedDex=null;document.getElementById('obtainDetail').close();receiveBattleSnapshot({status:'error',message:'Test connexion'})",
    );
    await check(
      "!liveWorld() && !document.getElementById('content').innerText.includes('POSITION LUE DANS LE JEU') && !document.getElementById('content').innerText.includes('37 Poké Balls')",
    );
    await evaluate("state.location='Route 201';render()");
    await check(
      "hereContext().zone.name==='Route 201' && !hereContext().live && document.querySelector('[data-here-scope=visited]').disabled",
    );
    await evaluate('fixture(354);worldSnapshot.timestamp=Date.now()-11000;render()');
    await check("!liveWorld() && !document.getElementById('content').innerText.includes('POSITION LUE DANS LE JEU')");
    await check(
      '(()=>{try{validate({...state,board:{done:{bad:true},visited:[]}});return false}catch{return true}})()',
    );
    await check('(()=>{try{validate({...state,board:{done:{},visited:[99999]}});return false}catch{return true}})()');
    await check(
      "!hereRequirement({id:'surf'}, {live:true,items:{420:1},badgeMask:255}) && !hereRequirement({id:'unparsed'},hereContext())",
    );
    await check("validate(JSON.parse(JSON.stringify(state))).board.done['potions-201']===true");
  });
  t.diagnostic(`${checks} checks`);
});
