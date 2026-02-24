/**
 * sync-agents.mjs
 * Copies src/cli/agents/*.md to _docs/agents/ with each file's content
 * wrapped in a ```markdown code block so VitePress displays the raw
 * agent specification rather than rendering it as HTML.
 */
import fs from 'fs';
import path from 'path';

const srcDir = 'src/cli/agents';
const dstDir = '_docs/agents';

fs.mkdirSync(dstDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.md'));

for (const file of files) {
  const src  = fs.readFileSync(path.join(srcDir, file), 'utf8');
  const title = src.split('\n')[0].replace(/^#\s*/, '');
  // Page heading (rendered) + full raw content inside a markdown code fence
  const out  = `# ${title}\n\n\`\`\`markdown\n${src.trimEnd()}\n\`\`\`\n`;
  fs.writeFileSync(path.join(dstDir, file), out);
}

console.log(`synced ${files.length} agent files → ${dstDir}/`);
