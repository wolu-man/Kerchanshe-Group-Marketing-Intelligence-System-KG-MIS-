const a = require('../dist/app');
console.log('exports:', Object.keys(a));
console.log('default:', typeof a.default);
console.log('app:', typeof a.app);
