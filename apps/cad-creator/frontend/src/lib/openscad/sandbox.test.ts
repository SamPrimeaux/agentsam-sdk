import {describe,it,expect} from 'vitest';
import {validateOpenScadSource} from './sandbox';

describe('OpenSCAD library source validation lanes',()=>{
 it('keeps browser-only sandbox strict by default',()=>{
  const source='include <BOSL2/std.scad>\ncube(3);';
  expect(validateOpenScadSource(source).valid).toBe(false);
 });
 it('allows safe relative .scad declarations in native-backed source editor',()=>{
  const source='include <BOSL2/std.scad>\nuse <MCAD/boxes.scad>\ncube([2,3,4]);';
  expect(validateOpenScadSource(source,{allowLibraryImports:true}).valid).toBe(true);
 });
 it('refuses traversal and absolute paths even in native-backed editor mode',()=>{
  for(const source of [
   'include <../../outside.scad>\ncube(1);',
   'use </etc/passwd.scad>\ncube(1);',
   'include <https://evil.test/x.scad>\ncube(1);',
  ])expect(validateOpenScadSource(source,{allowLibraryImports:true}).valid).toBe(false);
 });
});
