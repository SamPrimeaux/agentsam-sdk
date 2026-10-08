#!/usr/bin/env node
import fs from 'node:fs';
import { comparePreparedTurns } from '../../src/registry/turn-one.js';
const [left,right]=process.argv.slice(2);
if(!left||!right){
 console.error('Usage: node scripts/registry/compare-turn-one.mjs <cli-audit.json> <studio-audit.json>');
 process.exit(2);
}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
console.log(JSON.stringify(comparePreparedTurns(read(left),read(right)),null,2));
