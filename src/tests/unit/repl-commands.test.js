import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('REPL Command Consistency', () => {
  const replFilePath = path.join(__dirname, '../../cli/repl-ink.js');
  const replSource = fs.readFileSync(replFilePath, 'utf8');

  describe('Command Lists Synchronization', () => {
    it('should have consistent command lists across tab completion, menu, and handlers', () => {
      // Extract tab completion commands
      const tabCompletionMatch = replSource.match(
        /\/\/ Available commands for Tab completion.*?\n\s*const allCommands = \[([\s\S]*?)\];/
      );
      expect(tabCompletionMatch).toBeTruthy();

      const tabCommands = tabCompletionMatch[1]
        .split(',')
        .map(cmd => cmd.trim().replace(/['"]/g, ''))
        .filter(cmd => cmd.startsWith('/') && !cmd.startsWith('//'));

      // Extract interactive menu commands from commandGroups
      const menuMatch = replSource.match(
        /const commandGroups = \[([\s\S]*?)\s*\];[\s\S]*?\/\/ Flatten all commands/
      );
      expect(menuMatch).toBeTruthy();

      // Parse the commandGroups structure to extract all command values
      const menuCommands = [];
      const valueMatches = menuMatch[1].matchAll(/value:\s*['"]([^'"]+)['"]/g);
      for (const match of valueMatches) {
        menuCommands.push(match[1]);
      }

      // Extract command handlers from switch/case
      const handlerCommands = [];
      const caseMatches = replSource.matchAll(/case ['"]\/[^'"]+['"]/g);
      for (const match of caseMatches) {
        const cmd = match[0].match(/['"]([^'"]+)['"]/)[1];
        handlerCommands.push(cmd);
      }

      // Extract aliases from resolveAlias
      const aliasMatch = replSource.match(
        /const aliases = \{([\s\S]*?)\};/
      );
      expect(aliasMatch).toBeTruthy();

      const aliases = {};
      const aliasPairs = aliasMatch[1].matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g);
      for (const match of aliasPairs) {
        aliases[match[1]] = match[2];
      }

      // Define expected base commands (without aliases)
      const expectedBaseCommands = [
        '/init',
        '/documentation',
        '/sponsor-call',
        '/project-expansion',
        '/seed',
        '/status',
        '/models',
        '/tokens',
        '/remove',
        '/processes',
        '/help',
        '/version',
        '/restart',
        '/exit'
      ];

      // Define expected aliases
      const expectedAliases = {
        '/i': '/init',
        '/d': '/documentation',
        '/sc': '/sponsor-call',
        '/pe': '/project-expansion',
        '/s': '/status',
        '/m': '/models',
        '/tk': '/tokens',
        '/rm': '/remove',
        '/p': '/processes',
        '/h': '/help',
        '/v': '/version',
        '/q': '/exit',
        '/quit': '/exit'
      };

      // Test 1: All base commands should be in tab completion
      for (const cmd of expectedBaseCommands) {
        expect(tabCommands).toContain(cmd);
      }

      // Test 2: All base commands should be in interactive menu
      for (const cmd of expectedBaseCommands) {
        expect(menuCommands).toContain(cmd);
      }

      // Test 3: All base commands should have handlers (or aliases that map to them)
      for (const cmd of expectedBaseCommands) {
        const hasDirectHandler = handlerCommands.includes(cmd);
        const hasAliasHandler = Object.values(aliases).includes(cmd);
        expect(hasDirectHandler || hasAliasHandler).toBe(true);
      }

      // Test 4: All aliases should be in tab completion
      for (const alias of Object.keys(expectedAliases)) {
        expect(tabCommands).toContain(alias);
      }

      // Test 5: All aliases should map to valid commands
      for (const [alias, target] of Object.entries(aliases)) {
        expect(expectedBaseCommands).toContain(target);
      }

      // Test 6: Tab completion should only contain base commands + aliases
      const allExpectedCommands = [
        ...expectedBaseCommands,
        ...Object.keys(expectedAliases)
      ];
      for (const cmd of tabCommands) {
        expect(allExpectedCommands).toContain(cmd);
      }

      // Test 7: Interactive menu should only contain base commands (no aliases)
      for (const cmd of menuCommands) {
        expect(expectedBaseCommands).toContain(cmd);
      }
    });

    it('should have all command handlers match their case statements', () => {
      // Extract all case statements
      const caseMatches = replSource.matchAll(/case ['"]\/[^'"]+['"]:[\s\S]*?(?=case |default:)/g);
      const commandBlocks = Array.from(caseMatches);

      expect(commandBlocks.length).toBeGreaterThan(0);

      // Verify each block has either break, return, or falls through to next case
      for (const match of commandBlocks) {
        const block = match[0];
        const hasBreak = block.includes('break');
        const hasReturn = block.includes('return');
        const hasAwait = block.includes('await'); // Commands with await are valid
        const hasFallthrough = block.split('\n').length < 3; // Very short = fallthrough

        expect(hasBreak || hasReturn || hasAwait || hasFallthrough).toBe(true);
      }
    });

    it('should have help text that matches actual commands', () => {
      // Extract help text
      const helpMatch = replSource.match(
        /const showHelp = \(\) => \{[\s\S]*?return `([\s\S]*?)`;\s*\};/
      );
      expect(helpMatch).toBeTruthy();

      const helpText = helpMatch[1];

      // All base commands should be mentioned in help
      const expectedCommands = [
        '/init',
        '/documentation',
        '/sponsor-call',
        '/status',
        '/remove',
        '/processes',
        '/help',
        '/version',
        '/restart',
        '/exit'
      ];

      for (const cmd of expectedCommands) {
        expect(helpText).toContain(cmd);
      }

      // All aliases should be mentioned in help
      const expectedAliases = ['/i', '/d', '/sc', '/s', '/m', '/rm', '/p', '/h', '/v'];
      for (const alias of expectedAliases) {
        expect(helpText).toContain(alias);
      }
    });

    it('should have matching command counts across all lists', () => {
      // Extract counts
      const tabCompletionMatch = replSource.match(
        /\/\/ Available commands for Tab completion.*?\n\s*const allCommands = \[([\s\S]*?)\];/
      );
      const tabCommands = tabCompletionMatch[1]
        .split(',')
        .map(cmd => cmd.trim().replace(/['"]/g, ''))
        .filter(cmd => cmd.startsWith('/') && !cmd.startsWith('//'));

      const menuMatch = replSource.match(
        /const commandGroups = \[([\s\S]*?)\s*\];[\s\S]*?\/\/ Flatten all commands/
      );
      const menuCommands = [];
      const valueMatches = menuMatch[1].matchAll(/value:\s*['"]([^'"]+)['"]/g);
      for (const match of valueMatches) {
        menuCommands.push(match[1]);
      }

      // Expected: 14 base commands + 13 aliases in tab completion
      expect(tabCommands.length).toBe(27);

      // Expected: 14 base commands in menu (no aliases)
      expect(menuCommands.length).toBe(14);
    });

    it('should not have duplicate commands in any list', () => {
      // Tab completion
      const tabCompletionMatch = replSource.match(
        /\/\/ Available commands for Tab completion.*?\n\s*const allCommands = \[([\s\S]*?)\];/
      );
      const tabCommands = tabCompletionMatch[1]
        .split(',')
        .map(cmd => cmd.trim().replace(/['"]/g, ''))
        .filter(cmd => cmd.startsWith('/'));

      const tabUnique = new Set(tabCommands);
      expect(tabCommands.length).toBe(tabUnique.size);

      // Interactive menu
      const menuMatch = replSource.match(
        /const commandGroups = \[([\s\S]*?)\s*\];[\s\S]*?\/\/ Flatten all commands/
      );
      const menuCommands = [];
      const valueMatches = menuMatch[1].matchAll(/value:\s*['"]([^'"]+)['"]/g);
      for (const match of valueMatches) {
        menuCommands.push(match[1]);
      }

      const menuUnique = new Set(menuCommands);
      expect(menuCommands.length).toBe(menuUnique.size);
    });
  });

  describe('Command Aliases', () => {
    it('should have all short aliases defined', () => {
      const aliasMatch = replSource.match(/const aliases = \{([\s\S]*?)\};/);
      expect(aliasMatch).toBeTruthy();

      const aliasText = aliasMatch[1];

      const expectedAliases = [
        ['/i', '/init'],
        ['/d', '/documentation'],
        ['/sc', '/sponsor-call'],
        ['/s', '/status'],
        ['/m', '/models'],
        ['/rm', '/remove'],
        ['/p', '/processes'],
        ['/h', '/help'],
        ['/v', '/version'],
        ['/q', '/exit'],
        ['/quit', '/exit']
      ];

      for (const [alias, target] of expectedAliases) {
        expect(aliasText).toContain(`'${alias}'`);
        expect(aliasText).toContain(`'${target}'`);
      }
    });

    it('should have aliases mentioned in help text with correct format', () => {
      const helpMatch = replSource.match(
        /const showHelp = \(\) => \{[\s\S]*?return `([\s\S]*?)`;\s*\};/
      );
      expect(helpMatch).toBeTruthy();

      const helpText = helpMatch[1];

      // Check format: /command (or /alias) or /command (/alias)
      expect(helpText).toMatch(/\/init.*\/i/);
      expect(helpText).toMatch(/\/documentation.*\/d/);
      expect(helpText).toMatch(/\/sponsor-call.*\/sc/);
      expect(helpText).toMatch(/\/status.*\/s/);
      expect(helpText).toMatch(/\/remove.*\/rm/);
      expect(helpText).toMatch(/\/processes.*\/p/);
      expect(helpText).toMatch(/\/help.*\/h/);
      expect(helpText).toMatch(/\/version.*\/v/);
      expect(helpText).toMatch(/\/exit.*\/q/);
    });
  });

  describe('Regression Prevention', () => {
    it('should prevent missing commands in tab completion (regression test for /sponsor-call bug)', () => {
      const tabCompletionMatch = replSource.match(
        /\/\/ Available commands for Tab completion.*?\n\s*const allCommands = \[([\s\S]*?)\];/
      );
      const tabCommands = tabCompletionMatch[1]
        .split(',')
        .map(cmd => cmd.trim().replace(/['"]/g, ''))
        .filter(cmd => cmd.startsWith('/'));

      // This test would have caught the bug where /sponsor-call was missing
      expect(tabCommands).toContain('/sponsor-call');
      expect(tabCommands).toContain('/remove');
      expect(tabCommands).toContain('/restart');
    });

    it('should prevent missing commands in menu (regression test for menu bug)', () => {
      const menuMatch = replSource.match(
        /const commandGroups = \[([\s\S]*?)\s*\];[\s\S]*?\/\/ Flatten all commands/
      );
      const menuCommands = [];
      const valueMatches = menuMatch[1].matchAll(/value:\s*['"]([^'"]+)['"]/g);
      for (const match of valueMatches) {
        menuCommands.push(match[1]);
      }

      // This test would have caught the bug where commands were missing from menu
      expect(menuCommands).toContain('/sponsor-call');
      expect(menuCommands).toContain('/remove');
      expect(menuCommands).toContain('/restart');
    });
  });

  describe('Unknown Command Handling', () => {
    it('should have a default case in the command switch statement', () => {
      // Verify there's a default case to handle unknown commands
      expect(replSource).toContain('default:');

      // Verify the default case handles commands starting with /
      const defaultCaseMatch = replSource.match(/default:([\s\S]*?)(?=case |}\s*}\s*catch)/);
      expect(defaultCaseMatch).toBeTruthy();

      const defaultCase = defaultCaseMatch[1];
      expect(defaultCase).toContain('if (command.startsWith(\'/\'))');
      expect(defaultCase).toContain('Unknown command');
    });

    it('should provide helpful error message for unknown commands', () => {
      const defaultCaseMatch = replSource.match(/default:([\s\S]*?)(?=case |}\s*}\s*catch)/);
      expect(defaultCaseMatch).toBeTruthy();

      const defaultCase = defaultCaseMatch[1];

      // Should suggest help command
      expect(defaultCase).toMatch(/help|Type \/help/i);

      // Should show the unknown command to user
      expect(defaultCase).toContain('${command}');
    });

    it('should handle non-slash commands with helpful message', () => {
      const defaultCaseMatch = replSource.match(/default:([\s\S]*?)(?=case |}\s*}\s*catch)/);
      expect(defaultCaseMatch).toBeTruthy();

      const defaultCase = defaultCaseMatch[1];

      // Should have an else clause for non-slash commands
      expect(defaultCase).toContain('else');
      expect(defaultCase).toMatch(/Commands must start with|must start with \//i);
    });

    it('should have outer error handling to prevent crashes', () => {
      // Verify there's an outer try-catch wrapping the entire executeCommand
      const executeCommandMatch = replSource.match(/const executeCommand = async \(cmd\) => \{[\s\S]*?^\s*\};/m);
      expect(executeCommandMatch).toBeTruthy();

      const functionBody = executeCommandMatch[0];

      // Count try blocks - should have at least 2 (outer and inner)
      const tryCount = (functionBody.match(/try \{/g) || []).length;
      expect(tryCount).toBeGreaterThanOrEqual(2);

      // Should have outer catch for unexpected errors
      expect(functionBody).toContain('catch (outerError)');
      expect(functionBody).toContain('Unexpected error');
    });

    it('should return to prompt mode even on unknown commands', () => {
      const defaultCaseMatch = replSource.match(/default:([\s\S]*?)(?=case |}\s*}\s*catch)/);
      expect(defaultCaseMatch).toBeTruthy();

      // The finally block should always return to prompt
      const finallyMatch = replSource.match(/finally \{([\s\S]*?)\s*\}/);
      expect(finallyMatch).toBeTruthy();

      // After the switch, should return to prompt mode
      const afterSwitchMatch = replSource.match(/\}\s*catch[\s\S]*?finally[\s\S]*?setMode\('prompt'\)/);
      expect(afterSwitchMatch).toBeTruthy();
    });

    it('should handle "No matching commands" scenario without crashing', () => {
      // Find the CommandSelector's Enter key handler
      const selectorMatch = replSource.match(/useInput\(\(input, key\) => \{[\s\S]*?\}, \{ isActive: true \}\);/);
      expect(selectorMatch).toBeTruthy();

      const inputHandler = selectorMatch[0];

      // Should check if commands exist before calling onSelect on Enter
      expect(inputHandler).toContain('commands.length > 0');
      expect(inputHandler).toContain('commands[selectedIndex]');

      // Should execute unknown command immediately when no matches and filter starts with /
      expect(inputHandler).toContain('filter && filter.startsWith(\'/\')');
      expect(inputHandler).toContain('onSelect({ value: filter })');
    });

    it('should have safety check in onSelect callback', () => {
      // Find the CommandSelector instantiation
      const selectorInstMatch = replSource.match(/React\.createElement\(CommandSelector, \{[\s\S]*?onSelect: \(item\) => \{[\s\S]*?\}/);
      expect(selectorInstMatch).toBeTruthy();

      const onSelectCallback = selectorInstMatch[0];

      // Should check if item and item.value exist before using them
      expect(onSelectCallback).toMatch(/if \(item && item\.value\)|if \(item\?\.value\)/);
    });
  });
});
