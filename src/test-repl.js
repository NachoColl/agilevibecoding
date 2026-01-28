#!/usr/bin/env node

/**
 * Test script for Enhanced Ink-based REPL
 * This verifies that the components can be instantiated and basic logic works
 */

import React from 'react';
import { render } from 'ink';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Verify version reading
function testVersionReading() {
  console.log('Test 1: Version reading...');
  const packageJsonPath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;

  if (!version) {
    console.error('❌ Failed to read version');
    process.exit(1);
  }

  console.log(`✅ Version: ${version}`);
}

// Verify React and Ink are available
function testDependencies() {
  console.log('\nTest 2: Dependencies...');

  if (typeof React.createElement !== 'function') {
    console.error('❌ React not available');
    process.exit(1);
  }
  console.log('✅ React available');

  if (typeof render !== 'function') {
    console.error('❌ Ink not available');
    process.exit(1);
  }
  console.log('✅ Ink available');
}

// Verify module can be imported
async function testModuleImport() {
  console.log('\nTest 3: Module import...');

  try {
    const module = await import('./cli/repl-ink.js');

    if (typeof module.startRepl !== 'function') {
      console.error('❌ startRepl function not exported');
      process.exit(1);
    }

    console.log('✅ Module imported successfully');
    console.log('✅ startRepl function available');
  } catch (error) {
    console.error('❌ Failed to import module:', error.message);
    process.exit(1);
  }
}

// Verify ink-spinner is available
async function testSpinner() {
  console.log('\nTest 4: Spinner component...');

  try {
    const spinnerModule = await import('ink-spinner');

    if (!spinnerModule.default) {
      console.error('❌ Spinner component not available');
      process.exit(1);
    }

    console.log('✅ Spinner component available');
  } catch (error) {
    console.error('❌ Failed to import spinner:', error.message);
    process.exit(1);
  }
}

// Verify ink-select-input is available
async function testSelectInput() {
  console.log('\nTest 5: SelectInput component...');

  try {
    const selectModule = await import('ink-select-input');

    if (!selectModule.default) {
      console.error('❌ SelectInput component not available');
      process.exit(1);
    }

    console.log('✅ SelectInput component available');
  } catch (error) {
    console.error('❌ Failed to import SelectInput:', error.message);
    process.exit(1);
  }
}

// Run all tests
async function runTests() {
  console.log('Running AVC Enhanced Ink REPL Tests\n');
  console.log('═'.repeat(50));

  testVersionReading();
  testDependencies();
  await testModuleImport();
  await testSpinner();
  await testSelectInput();

  console.log('\n' + '═'.repeat(50));
  console.log('\n✅ All automated tests passed!\n');
  console.log('🎯 New Features Added:\n');
  console.log('   ✨ Command history (↑/↓ arrows)');
  console.log('   ✨ Command aliases (/h, /v, /q, /i, /s)');
  console.log('   ✨ Loading spinners for async commands');
  console.log('   ✨ Number shortcuts (1-5) in command selector');
  console.log('   ✨ Better error messages with tips');
  console.log('   ✨ Command filtering when typing "/xxx"\n');

  console.log('📋 Interactive Testing Guide\n');
  console.log('To test interactively, run:');
  console.log('  cd /mnt/x/Git/nacho.coll/agilevibecoding/src');
  console.log('  node cli/index.js\n');

  console.log('Test Checklist:\n');
  console.log('  Basic Features:');
  console.log('    [ ] 1. Banner displays with version');
  console.log('    [ ] 2. Separator lines span full terminal width');
  console.log('    [ ] 3. Prompt shows "> " with cursor\n');

  console.log('  Command Selector:');
  console.log('    [ ] 4. Type "/" and press Enter → Shows command list');
  console.log('    [ ] 5. Arrow keys navigate commands');
  console.log('    [ ] 6. Number keys (1-5) select commands instantly');
  console.log('    [ ] 7. Press Esc → Cancels and returns to prompt\n');

  console.log('  Direct Commands:');
  console.log('    [ ] 8. Type "/version" → Shows version info');
  console.log('    [ ] 9. Type "/help" → Shows help with aliases');
  console.log('    [ ] 10. Type "/v" → Shows version (alias test)');
  console.log('    [ ] 11. Type "/h" → Shows help (alias test)\n');

  console.log('  Command History:');
  console.log('    [ ] 12. Run "/version", then "/help"');
  console.log('    [ ] 13. Press ↑ arrow → Shows "/help"');
  console.log('    [ ] 14. Press ↑ again → Shows "/version"');
  console.log('    [ ] 15. Press ↓ → Shows "/help" again');
  console.log('    [ ] 16. Press ↓ → Clears input\n');

  console.log('  Loading Indicators:');
  console.log('    [ ] 17. Type "/status" → Shows spinner (brief)');
  console.log('    [ ] 18. Spinner displays "Checking project status..."\n');

  console.log('  Error Handling:');
  console.log('    [ ] 19. Type "/foo" → Shows error with tips');
  console.log('    [ ] 20. Type "hello" → Shows "must start with /" error\n');

  console.log('  Terminal Resize:');
  console.log('    [ ] 21. Resize terminal → Separator lines adjust\n');

  console.log('  Exit:');
  console.log('    [ ] 22. Type "/exit" → Exits gracefully');
  console.log('    [ ] 23. Type "/q" → Exits (alias test)');
  console.log('    [ ] 24. Press Ctrl+C → Exits gracefully\n');

  console.log('💡 Tip: Copy this checklist and mark items as you test!\n');
}

runTests().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
