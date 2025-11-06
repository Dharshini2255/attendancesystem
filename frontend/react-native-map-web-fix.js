const fs = require('fs');
const path = require('path');

const libPath = path.resolve(__dirname, 'node_modules/react-native-maps/lib');
const webPath = path.resolve(libPath, 'index.js');
const packagePath = path.resolve(__dirname, 'node_modules/react-native-maps/package.json');

// Create the lib directory if it doesn't exist
if (!fs.existsSync(libPath)) {
  fs.mkdirSync(libPath, { recursive: true });
}

// Create an empty index.js file
fs.writeFileSync(webPath, 'module.exports = {};');

// Update package.json
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.main = 'lib/index.js';
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

console.log('react-native-maps web fix applied.');