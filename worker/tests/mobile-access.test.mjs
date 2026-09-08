import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeRequest, classifyAccess } from '../src/lib/access.js';

test('native mobile exact namespace delegates authentication without opening legacy routes', () => {
  for (const path of ['/api/mobile', '/api/mobile/auth/request-otp', '/api/mobile/customers']) {
    const request = new Request('https://api.example.test' + path);
    assert.equal(classifyAccess(request).role, 'integration');
    assert.equal(authorizeRequest(request, {}).ok, true);
  }
  for (const path of ['/api/mobile-other', '/api/mobiles', '/api/estimates', '/api/auth']) {
    assert.equal(authorizeRequest(new Request('https://api.example.test' + path), {}).ok, false);
  }
});
