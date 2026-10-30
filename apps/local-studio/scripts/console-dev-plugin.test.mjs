import assert from 'node:assert/strict';
import {test} from 'node:test';
import {consoleDevPlugin} from './console-dev-plugin.mjs';
test('local commerce HTML follows canonical ownership without intercepting API or Studio routes', () => {
  let middleware;
  consoleDevPlugin().configureServer({middlewares:{use(fn){middleware=fn;}}});
  for(const url of ['/admin/products?view=collections','/admin/content?kind=video','/admin/products/help/artwork']) {
    let body, skipped=false;
    const response={setHeader(){},end(value){body=value;}};
    middleware({url,method:'GET'},response,()=>{skipped=true;});
    assert.equal(skipped,false,url); assert.equal(response.statusCode,200); assert.match(body.toString(),/<html/i);
  }
  for(const url of ['/api/admin/products','/admin/agentsam','/sites','/admin/../../secret']) {
    let skipped=false;
    middleware({url,method:'GET'},{setHeader(){},end(){assert.fail('Route intercepted: '+url);}},()=>{skipped=true;});
    assert.equal(skipped,true,url);
  }
});
