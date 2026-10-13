import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
for (const file of ['js/html.js', 'data/battle-guide-data.js', 'js/battle-guide.js'])
  vm.runInContext(fs.readFileSync(new URL('../../assets/' + file, import.meta.url), 'utf8'), context);
const evaluate = (code) => vm.runInContext(code, context);
let checks = 0;
const check = (code) => {
  assert.equal(evaluate(code), true, code);
  checks++;
};
check('Object.keys(BATTLE_GUIDE.profiles).length===493');
check(
  "BATTLE_GUIDE.profiles[443].referenceDex[0]===445 && BATTLE_GUIDE.profiles[443].priorities.join(',')==='attack,speed'",
);
check("BATTLE_GUIDE.profiles[396].referenceDex[0]===398 && BATTLE_GUIDE.profiles[396].role==='physical'");
check("BATTLE_GUIDE.profiles[63].role==='special' && BATTLE_GUIDE.profiles[63].priorities[0]==='special-attack'");
check(
  "BATTLE_GUIDE.profiles[113].role==='defensive' && BATTLE_GUIDE.profiles[113].priorities.join(',')==='hp,special-defense'",
);
check('BATTLE_GUIDE.profiles[133].branched && BATTLE_GUIDE.profiles[133].referenceDex.length===7');
check('BATTLE_GUIDE.profiles[132].priorities.length===0');
check(
  "guideIVLabel(31)==='Parfait' && guideIVLabel(30)==='Élevé' && guideIVLabel(25)==='Élevé' && guideIVLabel(24)==='Moyen' && guideIVLabel(16)==='Moyen' && guideIVLabel(15)==='Faible'",
);
check("guideAssessment({dex:443,ivs:[0,31,0,31,0,0]}).verdict==='Bons IV utiles'");
check("guideAssessment({dex:443,ivs:[31,31,31,0,31,31]}).verdict==='Potentiel contrasté'");
check("guideAssessment({dex:443,ivs:[31,2,31,2,31,31]}).verdict==='IV utiles modestes'");
check("guideAssessment({dex:443,ivs:[0,16,0,24,0,0]}).verdict==='IV utiles corrects'");
check("guideAssessment({dex:132,ivs:[31,31,31,31,31,31]}).verdict==='À regarder au cas par cas'");
check(
  'Object.values(BATTLE_GUIDE.profiles).every(p=>Object.keys(p.baseStats).length===6 && p.referenceDex.every(d=>d<=493) && p.priorities.every(k=>guideStats.some(s=>s.key===k)))',
);
check(
  "BATTLE_GUIDE.moveCategories[33]==='physical' && BATTLE_GUIDE.moveCategories[45]==='status' && BATTLE_GUIDE.moveCategories[85]==='special'",
);
console.log(`${checks} battle guide checks passed.`);
