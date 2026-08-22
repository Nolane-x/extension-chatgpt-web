import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSettingsPatch } from '../src/core/settings.js';

test('partial nested settings patch preserves sibling values',()=>{
  const current={recovery:{enabled:false,baseMs:10000,maxMs:120000},queue:{sendDelayMs:350}};
  const next=mergeSettingsPatch(current,{recovery:{enabled:true}});
  assert.deepEqual(next.recovery,{enabled:true,baseMs:10000,maxMs:120000});
  assert.deepEqual(next.queue,{sendDelayMs:350});
});

test('top-level values and arrays replace normally',()=>{
  const next=mergeSettingsPatch({locale:'vi',agentScopes:['observe']},{locale:'en',agentScopes:['observe','send']});
  assert.equal(next.locale,'en');
  assert.deepEqual(next.agentScopes,['observe','send']);
});
