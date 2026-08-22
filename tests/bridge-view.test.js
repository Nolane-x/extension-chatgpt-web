import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeHtml } from '../src/sidepanel/bridge-view.js';

test('bridge view renders canonical task scopes',()=>{
  const html=bridgeHtml();
  for(const scope of ['task_read','task_write','task_lease'])assert.match(html,new RegExp(`data-scope="${scope}"`));
});

test('bridge view does not invent a god-mode scope',()=>{
  assert.doesNotMatch(bridgeHtml(),/god[_ -]?mode/i);
});
