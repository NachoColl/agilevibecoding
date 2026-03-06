import React from 'react';
import {render, Text} from 'ink';

process.stdout.write('=BEFORE_RENDER=\n');

const App = () => React.createElement(Text, {color: 'green'}, 'Hello from Ink!');

render(React.createElement(App));
process.stdout.write('=AFTER_RENDER_CALL=\n');

setTimeout(() => {
  process.stdout.write('=BEFORE_EXIT=\n');
  process.exit(0);
}, 3000);
