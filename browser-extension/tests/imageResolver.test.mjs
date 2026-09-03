import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const resolverSource = readFileSync(new URL('../src/content/imageResolver.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName, attributes = {}, properties = {}) {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    Object.assign(this, properties);
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  closest(selector) {
    let current = this;
    const expected = selector.toUpperCase();
    while (current) {
      if (current.tagName === expected) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const expected = selector.toUpperCase();
    const found = [];
    const visit = element => {
      for (const child of element.children || []) {
        if (child.tagName === expected) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

const loadResolver = (overrides = {}) => {
  const context = {
    URL,
    Buffer,
    console,
    location: { href: 'https://example.com/gallery/page.html' },
    document: { baseURI: 'https://example.com/gallery/page.html', title: 'Gallery' },
    getComputedStyle: element => ({ backgroundImage: element.backgroundImage || 'none' }),
    fetch: globalThis.fetch,
    FileReader: class {
      readAsDataURL(blob) {
        void blob.arrayBuffer().then(buffer => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onload?.();
        }).catch(error => {
          this.error = error;
          this.onerror?.();
        });
      }
    },
    ...overrides,
  };
  context.globalThis = context;
  vm.runInNewContext(resolverSource, context, { filename: 'imageResolver.js' });
  return context.InspirationImageResolver;
};

test('resolves a normal img src', () => {
  const resolver = loadResolver();
  const image = new FakeElement('img', { src: '/images/a.jpg', alt: 'A' });
  const result = resolver.resolveImageFromElement(image);
  assert.equal(result.imageUrl, 'https://example.com/images/a.jpg');
  assert.equal(result.sourceType, 'img');
});

test('prefers currentSrc over src and srcset', () => {
  const resolver = loadResolver();
  const image = new FakeElement('img', { src: '/small.jpg', srcset: '/large.jpg 1600w' }, {
    currentSrc: 'https://cdn.example.com/rendered.jpg',
  });
  assert.equal(resolver.resolveImageFromElement(image).imageUrl, 'https://cdn.example.com/rendered.jpg');
});

test('chooses the highest width srcset candidate without currentSrc', () => {
  const resolver = loadResolver();
  const image = new FakeElement('img', { srcset: '/small.jpg 320w, /large.jpg 1600w, /medium.jpg 800w' });
  assert.equal(resolver.resolveImageFromElement(image).imageUrl, 'https://example.com/large.jpg');
});

test('resolves picture source candidates', () => {
  const resolver = loadResolver();
  const picture = new FakeElement('picture');
  picture.append(new FakeElement('source', { srcset: '/hero-1x.webp 1x, /hero-2x.webp 2x' }));
  const image = picture.append(new FakeElement('img'));
  const result = resolver.resolveImageFromElement(image);
  assert.equal(result.imageUrl, 'https://example.com/hero-2x.webp');
  assert.equal(result.sourceType, 'picture');
});

test('extracts the first real URL from a gradient background', () => {
  const resolver = loadResolver();
  const element = new FakeElement('div');
  element.backgroundImage = 'linear-gradient(#000, #fff), url("../assets/card.png")';
  const result = resolver.resolveImageFromElement(element);
  assert.equal(result.imageUrl, 'https://example.com/assets/card.png');
  assert.equal(result.sourceType, 'background');
});

test('uses lazy data-src only as a fallback', () => {
  const resolver = loadResolver();
  const image = new FakeElement('img', { 'data-src': '/lazy/photo.webp' });
  const result = resolver.resolveImageFromElement(image);
  assert.equal(result.imageUrl, 'https://example.com/lazy/photo.webp');
  assert.equal(result.sourceType, 'lazy');
});

test('materializes a blob URL inside the browser', async () => {
  const blob = new Blob(['image-bytes'], { type: 'image/png' });
  const resolver = loadResolver({ fetch: async () => ({ ok: true, blob: async () => blob }) });
  const result = await resolver.prepareImageForTransfer({
    kind: 'blob',
    imageUrl: 'blob:https://example.com/private',
    sourceType: 'blob',
  });
  assert.match(result.dataUrl, /^data:image\/png;base64,/);
  assert.equal(result.imageUrl, undefined);
});

test('passes a bounded data:image payload through directly', async () => {
  const resolver = loadResolver();
  const dataUrl = 'data:image/png;base64,aGVsbG8=';
  const result = await resolver.prepareImageForTransfer({ kind: 'data', dataUrl, sourceType: 'data' });
  assert.equal(result.dataUrl, dataUrl);
});

test('normalizes a percent-encoded data image to base64 before transfer', async () => {
  const resolver = loadResolver();
  const result = await resolver.prepareImageForTransfer({
    kind: 'data',
    dataUrl: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
    sourceType: 'data',
  });
  assert.match(result.dataUrl, /^data:image\/svg\+xml;base64,/);
});

test('normalizes a relative URL against document.baseURI', () => {
  const resolver = loadResolver();
  assert.equal(resolver.normalizeImageUrl('../img/a.png'), 'https://example.com/img/a.png');
});

test('normalizes a protocol-relative URL with the page protocol', () => {
  const resolver = loadResolver();
  assert.equal(resolver.normalizeImageUrl('//cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
});

test('finds an image wrapped by div and anchor elements', () => {
  const resolver = loadResolver();
  const anchor = new FakeElement('a');
  const wrapper = anchor.append(new FakeElement('div'));
  const image = wrapper.append(new FakeElement('img', { src: '/wrapped.png' }));
  const handle = wrapper.append(new FakeElement('span'));
  assert.equal(resolver.resolveImageFromElement(handle).imageUrl, 'https://example.com/wrapped.png');
  assert.ok(image);
});

test('does not trigger for an ordinary non-image element', () => {
  const resolver = loadResolver();
  assert.equal(resolver.resolveImageFromElement(new FakeElement('button')), null);
});
