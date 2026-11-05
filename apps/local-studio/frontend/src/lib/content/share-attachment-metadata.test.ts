import test from 'node:test';
import assert from 'node:assert/strict';
import { shareAttachmentMetadata } from './share-attachment-metadata.ts';

test('conversation share projects only image names and allowed MIME types', () => {
  const result = shareAttachmentMetadata({ metadata: { attachments: [
    { id: 'img-1', name: '  Geaux preview.png  ', mimeType: 'image/png', kind: 'image', source: {type:'blob',blobId:'private-account-object'}, lifetime: 'conversation', dataUrl:'private' },
    { id:'img-2', name: 'Export.webp', mimeType: 'image/webp', kind:'image' },
  ] } });
  assert.deepEqual(result, [
    {name:'Geaux preview.png',mimeType:'image/png'},
    {name:'Export.webp',mimeType:'image/webp'},
  ]);
  assert.doesNotMatch(JSON.stringify(result), /blobId|private-account|dataUrl|source|lifetime/);
});

test('unknown and malicious attachment metadata cannot leak into public share', () => {
  assert.deepEqual(shareAttachmentMetadata({ metadata: undefined }), []);
  assert.deepEqual(shareAttachmentMetadata({ metadata: { attachments: 'not-an-array' } }), []);
  assert.deepEqual(shareAttachmentMetadata({ metadata: { attachments: [null, 2, {kind:'file',name:'notes.txt'}, {kind:'image',name:''}, {kind:'image',name:'photo',mimeType:'text/html'}] } }), [
    {name:'photo',mimeType:'image/*'},
  ]);
});
