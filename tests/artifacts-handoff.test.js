import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyArtifactCandidate, mergeArtifacts } from '../src/core/artifacts.js';
import { buildContextHandoff } from '../src/core/handoff.js';

test('detects a real zip link as archive', () => {
  const item = classifyArtifactCandidate({href:'https://chatgpt.com/backend-api/files/project-build.zip',text:'project-build.zip'});
  assert.equal(item.family, 'archive');
  assert.equal(item.extension, 'zip');
  assert.equal(item.downloadable, true);
});

test('detects GitHub commit separately from file artifact', () => {
  const item = classifyArtifactCandidate({href:'https://github.com/Nolane-x/example/commit/abcdef1234'});
  assert.equal(item.kind, 'github');
  assert.equal(item.github.resource, 'commit');
  assert.equal(item.github.ref, 'abcdef1234');
});

test('plain text mentioning zip without filename is not enough', () => {
  assert.equal(classifyArtifactCandidate({text:'Tôi sẽ tạo file zip cho bạn'}), null);
});

test('generic ChatGPT JSON network responses are not downloadable artifacts', () => {
  assert.equal(classifyArtifactCandidate({ href:'https://chatgpt.com/backend-api/conversation/abc', mime:'application/json', source:'cdp-network' }), null);
});

test('artifact merge deduplicates identical href/name', () => {
  const a={kind:'file',name:'a.zip',href:'https://x/a.zip',confidence:.8};
  const b={...a,confidence:.95,source:'network'};
  const merged=mergeArtifacts([a],[b]);
  assert.equal(merged.length,1);
  assert.equal(merged[0].source,'network');
});

test('handoff is bounded and carries latest visible turns', () => {
  const turns=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',text:`turn-${i} `+'x'.repeat(1000)}));
  const handoff=buildContextHandoff({title:'test',url:'https://chatgpt.com/c/1',turns,artifacts:[{name:'x.zip',href:'https://x/x.zip'}]},{maxChars:9000,recentTurns:6,maxPerTurn:1200});
  assert.ok(handoff.length<=9000);
  assert.match(handoff,/turn-19/);
  assert.doesNotMatch(handoff,/turn-1\s/);
});

test('downloaded file paths are reduced to a safe display filename', () => {
  const item = classifyArtifactCandidate({ href:'https://chatgpt.com/backend-api/files/a.zip', filename:'C:\\Users\\me\\Downloads\\release.zip', source:'chrome-download' });
  assert.equal(item.name, 'release.zip');
});
