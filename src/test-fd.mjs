import { writeFileSync } from 'fs';

writeFileSync('/dev/fd/1', 'BEFORE_IMPORT\n');

const {render, Text} = await import('ink');
const {default: React} = await import('react');

writeFileSync('/dev/fd/1', 'AFTER_IMPORT\n');

const App = () => {
  writeFileSync('/dev/fd/1', 'IN_COMPONENT\n');
  return React.createElement(Text, null, 'Hello');
};

writeFileSync('/dev/fd/1', 'BEFORE_RENDER\n');
render(React.createElement(App));
writeFileSync('/dev/fd/1', 'AFTER_RENDER\n');

setTimeout(() => {
  writeFileSync('/dev/fd/1', 'ON_EXIT\n');
  process.exit(0);
}, 1000);
