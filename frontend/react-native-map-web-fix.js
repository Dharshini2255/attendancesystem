const chalk = require('chalk');
const { readFile, writeFile, copyFile, mkdir } = require('fs').promises;
const { existsSync } = require('fs');

console.log(chalk.green('here'));
function log(...args) {  console.log(chalk.yellow('[react-native-maps]'), ...args);}
async function reactNativeMaps() {
  log('📦 Creating web compatibility of react-native-maps using an empty module loaded on web builds');
  const modulePath = 'node_modules/react-native-maps';
  const libPath = `${modulePath}/lib`;

  if (!existsSync(libPath)) {
    await mkdir(libPath, { recursive: true });
  }

  await writeFile(`${libPath}/index.web.js`, 'module.exports = {}', 'utf-8');
  if (existsSync(`${modulePath}/index.d.ts`)) {
    await copyFile(`${modulePath}/index.d.ts`, `${libPath}/index.web.d.ts`);
  }
  const pkg = JSON.parse(await readFile(`${modulePath}/package.json`));
  pkg['react-native'] = 'lib/index.js';
  pkg['main'] = 'lib/index.web.js';
  await writeFile(`${modulePath}/package.json`, JSON.stringify(pkg, null, 2), 'utf-8');
  log('✅ script ran successfully');
}
reactNativeMaps();