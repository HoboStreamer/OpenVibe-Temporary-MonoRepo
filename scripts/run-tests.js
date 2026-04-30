#!/usr/bin/env node
'use strict';

const { main } = require('./test');

main(process.argv.slice(2)).then((code) => {
	process.exit(code);
}).catch((error) => {
	console.error(error && error.stack || String(error));
	process.exit(1);
});
