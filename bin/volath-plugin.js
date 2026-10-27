#!/usr/bin/env node
'use strict';
require('../lib/cli.js').main().then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(1); });
