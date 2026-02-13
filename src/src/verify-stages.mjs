#!/usr/bin/env node

import { ModelConfigurator } from './cli/init-model-config.js';

const configurator = new ModelConfigurator(process.cwd());

console.log('\n📊 Verifying Models Command Stage Consistency\n');
console.log('='.repeat(60));

const ceremonies = configurator.getCeremonies();
let allPassed = true;

ceremonies.forEach(ceremony => {
  console.log(`\n🔍 ${ceremony.name}`);
  console.log('-'.repeat(60));

  const summaryStages = Object.keys(ceremony.stages);
  console.log(`  Summary stages: ${summaryStages.join(', ')}`);

  const editStages = configurator.getStagesForCeremony(ceremony.name);
  const editStageNames = editStages
    .filter(s => s.id !== 'main' && s.id !== 'validation')
    .map(s => s.stageName || s.id.replace('stage-', ''));

  console.log(`  Edit stages:    ${editStageNames.join(', ')}`);

  const match = JSON.stringify(summaryStages.sort()) === JSON.stringify(editStageNames.sort());
  console.log(`  Match:          ${match ? '✅ Yes' : '❌ No'}`);

  if (!match) allPassed = false;

  try {
    const overview = configurator.getConfigurationOverview(ceremony.name);
    console.log(`  Overview:       ✅ Works (${overview.stages.length} stages, $${overview.totalCost.toFixed(2)})`);
  } catch (error) {
    console.log(`  Overview:       ❌ Failed - ${error.message}`);
    allPassed = false;
  }
});

console.log('\n' + '='.repeat(60));
console.log(allPassed ? '\n✅ ALL CHECKS PASSED!\n' : '\n❌ SOME CHECKS FAILED!\n');
process.exit(allPassed ? 0 : 1);
