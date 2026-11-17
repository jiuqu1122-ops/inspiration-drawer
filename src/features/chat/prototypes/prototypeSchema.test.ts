import { describe, expect, it } from 'vitest';
import { parsePrototype, prototypeUtf8Length, PROTOTYPE_JSON_SCHEMA } from './prototypeSchema';
import { renderPrototypeHtml } from './prototypeHtml';
import { makePrototypeFixture } from './prototypeFixture';

describe('data-only interactive prototype contract', () => {
  it('roundtrips multiple pages, overlay, Auto Layout and real component states', () => {
    const doc = makePrototypeFixture();
    expect(parsePrototype(JSON.stringify(doc))).toEqual(doc);
    expect(prototypeUtf8Length('中文😃')).toBe(new TextEncoder().encode('中文😃').length);
    expect(PROTOTYPE_JSON_SCHEMA.properties).toHaveProperty('interactions');
  });
  it.each([
    ['unsupported version', (d: any) => { d.schemaVersion = 2; }],
    ['duplicate IDs', (d: any) => { d.nodes[0].id = 'home'; }],
    ['cyclic hierarchy', (d: any) => { d.nodes[0].kind = 'frame'; d.nodes[0].parentId = d.nodes[0].id; }],
    ['orphan parent', (d: any) => { d.nodes[0].parentId = 'missing'; }],
    ['invalid dimensions', (d: any) => { d.nodes[0].width = -10; }],
    ['NaN/null dimensions', (d: any) => { d.nodes[0].height = NaN; }],
    ['CSS injection', (d: any) => { d.nodes[0].color = 'red;url(file:///secret)'; }],
    ['arbitrary script', (d: any) => { d.script = 'alert(1)'; }],
    ['remote image', (d: any) => { d.nodes.push({id:'img',kind:'image',parentId:'home',width:10,height:10,imageData:'https://server/image.png'}); }],
    ['SVG script image', (d: any) => { d.nodes.push({id:'img',kind:'image',parentId:'home',width:10,height:10,imageData:'data:image/svg+xml;base64,PHN2Zz4='}); }],
    ['bad target', (d: any) => { d.interactions[0].targetId = 'missing'; }],
    ['overlay as navigation', (d: any) => { d.interactions[0].targetId = 'dialog'; }],
    ['regular page as overlay', (d: any) => { d.interactions[1].targetId = 'home'; }],
    ['duplicate trigger', (d: any) => { d.interactions.push(d.interactions[0]); }],
    ['cross component setState', (d: any) => { d.interactions[0] = { sourceId:'home-detail', action:'setState', targetId:'tabs', stateId:'tab-spec' }; }],
    ['bad initial variant', (d: any) => { d.nodes.find((n: any)=>n.id==='tabs').initialStateId='bad'; }],
    ['bad state dimensions', (d: any) => { d.nodes.find((n: any)=>n.id==='tab-info').height=220; }],
    ['unsupported action', (d: any) => { d.interactions[0].action='eval'; }],
  ])('rejects %s before preview or any Figma file mutation', (_name, mutate) => {
    const doc = makePrototypeFixture(); mutate(doc); expect(() => parsePrototype(doc)).toThrow();
  });
  it('renders text as text, never HTML/code; only controlled JS is emitted', () => {
    const doc = makePrototypeFixture(); doc.nodes[0].text = '</script><script>parent.HACKED=1</script>';
    const html = renderPrototypeHtml(doc);
    expect(html).toContain('&lt;/script&gt;&lt;script&gt;parent.HACKED=1&lt;/script&gt;');
    expect(html).not.toContain('<script>parent.HACKED=1');
    expect(html).toContain('data-state="tab-spec" hidden');
    expect(html).toContain('data-screen="dialog"');
    expect(html).toContain('data-kind="frame"');
    expect(html).toContain('font-family:&quot;Inter&quot;');
    expect(html).not.toContain('fetch(');
  });
  it('works for unrelated domains rather than a hardcoded model or screen template', () => {
    const doc = makePrototypeFixture(); doc.id='new-dashboard'; doc.name='科研记录工具'; doc.nodes[0].text='样本统计';
    expect(renderPrototypeHtml(doc)).toContain('<title>科研记录工具</title>');
    expect(parsePrototype(doc).id).toBe('new-dashboard');
  });
});
