import { writeFileSync } from 'fs';
writeFileSync('/dev/fd/1', 'before import\n');
// Check if forcing TTY makes a difference
Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true });
Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
writeFileSync('/dev/fd/1', 'after TTY override\n');
import {render, Text} from 'ink';
writeFileSync('/dev/fd/1', 'after import\n');
process.exit(0);
