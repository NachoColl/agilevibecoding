import React from 'react';
import {render, Text, Box} from 'ink';

const App = () => React.createElement(Box, {flexDirection: 'column'},
  React.createElement(Text, {color: 'green'}, 'Choose an option:'),
  React.createElement(Text, null, '> Option A'),
  React.createElement(Text, null, '  Option B')
);

render(React.createElement(App));
setTimeout(() => process.exit(0), 3000);
