// A page for remote-install.js's init() to run on, without a browser: a few globals, and a root whose elements
// (found by id, as #remote-<id>) are plain objects that remember their handlers.
export function fakeNode() {
  return {
    children: [], dataset: {}, handlers: {}, value: '', className: '', textContent: '', hidden: true,
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; }, add() {},
    setAttribute() {}, scrollIntoView() {}, focus() {}, select() {},
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: [] }) }),
    addEventListener(event, handler) { this.handlers[event] = handler; },
  };
}

// The globals a page expects (anything not given is a harmless stand-in), put back when the test ends.
export function fakePage(t, globals = {}) {
  const all = {
    isSecureContext: true,
    navigator: { userAgent: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Option: class { constructor(text, value) { Object.assign(this, { text, value }); } },
    addEventListener() {},
    WebTransport: class { ready = Promise.resolve(); closed = new Promise(() => {}); close() {} },
    ...globals,
  };
  for (const [key, value] of Object.entries(all)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => (original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key]));
  }
  const elements = new Map();
  const querySelector = id => (elements.has(id) ? elements.get(id) : elements.set(id, fakeNode()).get(id));
  return { querySelector, root: { querySelector, ownerDocument: { createElement: fakeNode, head: fakeNode() }, dataset: {} } };
}
