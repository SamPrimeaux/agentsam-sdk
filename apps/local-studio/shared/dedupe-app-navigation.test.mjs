import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeAppNavigation } from './dedupe-app-navigation.mjs';

test('one installed app even when registry and host aliases duplicate it', () => {
  const apps = [
    {id:'local-studio',label:'AgentSam',href:'/admin/agentsam',aliases:['/agentsam','/chats']},
    {id:'plugin-agentsam',label:'AgentSam',href:'/agentsam'},
    {id:'cad-creator',label:'CAD Creator',href:'/admin/cad',aliases:['/cad']},
    {id:'plugin-cad',label:'CAD Creator',href:'/cad'},
    {id:'movie-mode',label:'MovieMode',href:'/admin/moviemode'},
    {id:'plugin-moviemode',label:'MovieMode',href:'/admin/moviemode'},
  ];
  assert.deepEqual(dedupeAppNavigation(apps).map(item=>item.id), ['local-studio','cad-creator','movie-mode']);
});
test('preserves distinct product-app links and does not mutate input', () => {
  const apps = [
    {id:'product-studio',label:'Product Studio',href:'/admin/products/create'},
    {id:'completeful',label:'Completeful',href:'/admin/products/create?app=completeful'},
    {id:'media',label:'Library',href:'/media'},
  ];
  assert.deepEqual(dedupeAppNavigation(apps),apps);
});
