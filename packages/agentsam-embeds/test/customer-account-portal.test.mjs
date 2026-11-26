import assert from 'node:assert/strict';
import test from 'node:test';
import { registerCustomerAccountPortal } from '../src/customer-account-portal.js';

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.isConnected = true;
    this.shadow = { innerHTML: '' };
  }
  attachShadow() { return this.shadow; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}

function registry() {
  const definitions = new Map();
  return {
    get: (name) => definitions.get(name),
    define: (name, value) => definitions.set(name, value),
  };
}

test('customer account portal renders local Identity links and a validated return path', () => {
  const customElements = registry();
  const Portal = registerCustomerAccountPortal(customElements, FakeElement);
  const previousLocation = globalThis.location;
  globalThis.location = { pathname: '/products/blue-shirt', search: '?variant=navy' };
  try {
    const element = new Portal();
    element.setAttribute('config', JSON.stringify({
      enabled: true,
      inherit_typography: true,
      login_label: 'Sign in',
      signup_label: 'Create account',
      show_signup: true,
      style: 'button',
      alignment: 'right',
    }));
    element.connectedCallback();
    assert.match(element.shadow.innerHTML, /href="\/auth\/login\?next=/);
    assert.match(element.shadow.innerHTML, /href="\/auth\/signup\?next=/);
    assert.match(element.shadow.innerHTML, /Sign in/);
    assert.match(element.shadow.innerHTML, /Create account/);
    assert.match(element.shadow.innerHTML, /aria-label="Customer account"/);
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
});

test('customer account portal never renders signup when the merchant disables it and escapes labels', () => {
  const Portal = registerCustomerAccountPortal(registry(), FakeElement);
  const element = new Portal();
  element.setAttribute('config', JSON.stringify({
    enabled: true,
    login_label: '<img src=x onerror=alert(1)>',
    show_signup: false,
  }));
  element.connectedCallback();
  assert.match(element.shadow.innerHTML, /&lt;img/);
  assert.doesNotMatch(element.shadow.innerHTML, /<img/);
  assert.doesNotMatch(element.shadow.innerHTML, /href="\/auth\/signup/);
});
