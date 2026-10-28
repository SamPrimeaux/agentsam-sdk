import {describe,it,expect} from 'vitest';
import {insertOpenScadImport} from './OpenScadLibraryPane';

describe('OpenSCAD source library insertion',()=>{
 it('inserts a registered statement without destroying existing parametric source',()=>{
  const result=insertOpenScadImport('cube([1,2,3]);','include <BOSL2/std.scad>');
  expect(result).toContain('include <BOSL2/std.scad>');
  expect(result).toContain('cube([1,2,3]);');
  expect(insertOpenScadImport(result,'include <BOSL2/std.scad>')).toEqual(result);
 });
 it('rejects unsafe import paths',()=>{
  expect(()=>insertOpenScadImport('','include <../../test.scad>')).toThrow();
 });
});
