import test from 'node:test';
import { withCarnet } from '../lib/webview.mjs';

test('Legacy notebook: prerequisites, configuration, map, simulated battle', async (t) => {
  const checks = await withCarnet(async ({ evaluate, check, reload }) => {
    await evaluate(
      'catalogLegacy=true;state=defaults();tab="now";detailMon=null;configure=false;mapZoom=1;placingPoint=null;render()',
    );
    await check('cfg().team.length===7 && cfg().tasks.length===19');
    await check("available(cfg().tasks.find(t=>t.id==='starly')) && !available(cfg().tasks.find(t=>t.id==='gible'))");
    await check("!available(cfg().tasks.find(t=>t.id==='karp'))");
    await evaluate('state.flags.rod=true;state.flags.kit=true');
    await check("available(cfg().tasks.find(t=>t.id==='karp')) && available(cfg().tasks.find(t=>t.id==='hound'))");
    await evaluate('state.badges=5;state.flags.surf=true');
    await check("available(cfg().tasks.find(t=>t.id==='egg')) && !available(cfg().tasks.find(t=>t.id==='gible'))");
    await evaluate('state.badges=6');
    await check("available(cfg().tasks.find(t=>t.id==='gible'))");
    await evaluate('state.team.garchomp={stage:1,level:20}');
    await check("isDone(cfg().tasks.find(t=>t.id==='gible')) && !isDone(cfg().tasks.find(t=>t.id==='evo-gible'))");
    await evaluate('state.team.garchomp.stage=3');
    await check("isDone(cfg().tasks.find(t=>t.id==='evo-gible'))");
    await check('JSON.stringify(validate(JSON.parse(JSON.stringify(state))))===JSON.stringify(validate(state))');
    await check('(()=>{try{validate({...state,badges:9});return false}catch{return true}})()');
    await check(
      '(()=>{const c=clone(cfg());c.map.points[0].x=101;try{validateConfig(c);return false}catch{return true}})()',
    );
    await check(
      "(()=>{const c=clone(cfg());c.team[0].source='javascript:alert(1)';return validateConfig(c).team[0].source==='';})()",
    );
    await evaluate("tab='team';render();document.querySelector('[data-detail=torterra]').click()");
    await check(
      "document.getElementById('monDetail').open && document.querySelector('.specimen img').getAttribute('src')==='sprites/387.png'",
    );
    await evaluate(
      "const form=document.querySelector('[data-mon=torterra]');form.value='2';form.dispatchEvent(new Event('change',{bubbles:true}))",
    );
    await check(
      "document.querySelector('.species-title h2').textContent==='Boskara' && document.querySelector('.specimen img').getAttribute('src')==='sprites/388.png'",
    );
    await evaluate("document.querySelector('#monDetail [data-show-mon]').click()");
    await check("tab==='map' && selectedPoint==='lake' && !document.querySelector('dialog[open]')");
    await check(
      '(async()=>{await Promise.all([...document.images].map(i=>i.decode()));return [...document.images].every(i=>i.naturalWidth>0)})()',
    );
    await check(
      '(async()=>{return (await Promise.all(SPRITE_CATALOG.map(p=>{const i=new Image();i.src=p.file;return i.decode().then(()=>i.naturalWidth>0)}))).every(Boolean)})()',
    );
    await evaluate("tab='team';detailMon='torterra';render()");
    await evaluate("document.querySelector('#monDetail [data-edit=team]').click()");
    await check(
      "document.getElementById('editor').open && document.querySelector('#editor input[name=name]').value==='Torterra'",
    );
    await evaluate(
      "document.getElementById('editor').close();openEditor('team');document.querySelector('#editor input[name=name]').value='Pikachu';document.querySelector('#editor input[name=dex]').value='25';document.getElementById('editorForm').requestSubmit()",
    );
    await check("cfg().team.some(m=>m.name==='Pikachu') && !document.getElementById('editor').open");
    await evaluate(
      "openEditor('phases');document.querySelector('#editor input[name=title]').value='Mon étape';document.getElementById('editorForm').requestSubmit()",
    );
    await check("cfg().phases.some(p=>p.title==='Mon étape')");
    await evaluate(
      "openEditor('tasks');document.querySelector('#editor input[name=title]').value='Mon objectif';document.getElementById('editorForm').requestSubmit()",
    );
    await check("cfg().tasks.some(t=>t.title==='Mon objectif')");
    await evaluate(
      "openEditor('points');document.querySelector('#editor input[name=title]').value='Mon repère';document.getElementById('editorForm').requestSubmit()",
    );
    await check("cfg().map.points.some(p=>p.title==='Mon repère')");
    await evaluate("tab='map';selectedPoint='magma';render()");
    await check(
      "document.querySelectorAll('.pin').length===8 && document.querySelector('.hero').textContent.includes('PAS la position')",
    );
    await check("document.querySelector('.map-image').naturalWidth===1268");
    await evaluate('document.querySelector(\'[data-zoom="1"]\').click()');
    await check("document.querySelector('.map-canvas').style.width==='150%'");
    await evaluate(
      "document.querySelector('[data-place]').click();const rect=document.querySelector('.map-canvas').getBoundingClientRect();document.querySelector('.map-canvas').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));",
    );
    await check("cfg().map.points.find(p=>p.id==='magma').x===50 && cfg().map.points.find(p=>p.id==='magma').y===50");
    await check(
      "(()=>{const c=clone(cfg());c.team[0].sprite='https://evil.example/image.png';return validateConfig(c).team[0].sprite==='';})()",
    );
    await evaluate("state.location='<img src=x onerror=alert(1)>';tab='now';render()");
    await check(
      "document.querySelector('.location-pill').textContent.includes('<img src=x') && !document.querySelector('img[onerror]')",
    );
    await evaluate("state.location='Test de conservation';save()");
    await reload();
    await check("state.location==='Test de conservation' && cfg().team.some(m=>m.name==='Pikachu')");
    await evaluate(
      `tab='battle';detailMon=null;receiveBattleSnapshot({status:'battle',timestamp:Date.now(),durationMs:100,player:[{dex:387,nickname:'Rapidos',hp:20,maxHp:23,level:6}],opponents:[{dex:399,nickname:'Keunotor',gender:1,moves:[33,45,28,82],hp:9,maxHp:16,level:3,battleId:12,stats:[8,7,6,7,7],ivs:[2,25,11,2,5,28],ranks:[0,0,0,0,0,0,0],typeIds:[0,0]}]});receiveBattleSnapshot({...battleSnapshot,opponents:battleSnapshot.opponents.map(m=>({...m,hp:2}))})`,
    );
    await check(
      "document.querySelectorAll('.capture-stat').length===6 && document.querySelector('.battle-health b').textContent==='2 / 16'",
    );
    await check(
      "(()=>{const r=document.querySelector('.capture-weak').getBoundingClientRect();const identity=document.querySelector('.capture-identity').getBoundingClientRect(),hero=document.querySelector('.capture-hero').getBoundingClientRect();return identity.top>=hero.top && identity.bottom<=hero.bottom && scrollY===0 && r.bottom<document.querySelector('nav').getBoundingClientRect().top && document.querySelector('.capture-body').scrollHeight<=document.querySelector('.capture-body').clientHeight && getComputedStyle(document.querySelector('.app-header')).display==='none'})()",
    );
    await check(
      "document.getElementById('content').textContent.includes('Charge') && document.getElementById('content').textContent.includes('Rugissement')",
    );
    await check(
      "document.querySelectorAll('.advice-priorities b').length===2 && document.querySelector('.advice-verdict').textContent==='Potentiel contrasté'",
    );
    await evaluate("document.querySelector('[data-battle-guide]').click()");
    await check(
      "document.getElementById('battleHelp').open && document.getElementById('battleHelp').textContent.includes('0–15 faible') && document.querySelectorAll('.guide-stat-list section').length===6",
    );
    await evaluate(
      "document.getElementById('battleHelp').scrollTop=100;receiveBattleSnapshot({...battleSnapshot,timestamp:Date.now(),opponents:battleSnapshot.opponents.map(m=>({...m,hp:1}))})",
    );
    await check(
      "document.getElementById('battleHelp').open && Math.abs(document.getElementById('battleHelp').scrollTop-100)<2 && document.querySelector('.battle-health b').textContent==='1 / 16'",
    );
    await evaluate(
      "document.querySelector('[data-close-battle-guide]').click();document.querySelector('[data-stat-guide=speed]').click()",
    );
    await check(
      "document.getElementById('battleHelp').open && document.getElementById('battleHelp').scrollTop>0 && document.querySelector('#guide-speed').textContent.includes('agir avant')",
    );
    await evaluate("receiveBattleSnapshot({status:'idle',message:'Combat terminé',timestamp:Date.now()})");
    await check("!document.querySelector('.battle-mon') && !document.getElementById('battleHelp').open");
  });
  t.diagnostic(`${checks} checks`);
});
