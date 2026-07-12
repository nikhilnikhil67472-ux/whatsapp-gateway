const fs = require('fs');
const path = require('path');

const pkgPath = path.join(
  process.cwd(),
  'node_modules',
  '@whiskeysockets',
  'baileys',
  'node_modules',
  'whatsapp-rust-bridge',
  'package.json'
);

if (!fs.existsSync(pkgPath)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.main = pkg.main || './dist/index.js';
pkg.exports = {
  ...(pkg.exports || {}),
  '.': {
    ...(pkg.exports?.['.'] || {}),
    import: './dist/index.js',
    require: './dist/index.js',
    default: './dist/index.js',
    types: './dist/index.d.ts',
  },
};

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
console.log('[postinstall] patched whatsapp-rust-bridge exports for Node 24');
