import fs from 'node:fs';

const plain = file => fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const runtime = ['icon.js', 'engine.js', 'activity.js', 'habitica.js', 'ui.js'].map(plain).join('\n');
const template = fs.readFileSync('preview/caret-playground.template.html', 'utf8');
const html = template.replace('/* COMPONENT_STYLES */', () => JSON.stringify(fs.readFileSync('index.css', 'utf8')))
  .replace('/* COMPONENT_RUNTIME */', () => runtime.replace(/<\/script/gi, '<\\/script'));
fs.writeFileSync('preview/caret-playground.html', html);
console.log('Built standalone preview/caret-playground.html');
