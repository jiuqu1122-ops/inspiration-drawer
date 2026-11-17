import { describe, expect, it } from 'vitest';
import { buildPrototypeSketch, prototypeChildBounds, sketchId, SKETCH_EXPORT_LIMITATIONS } from './prototypeSketch';
import { makePrototypeFixture } from './prototypeFixture';
import type { PrototypeNode } from './prototypeSchema';
const layers = (items: any[]): any[] => items.flatMap(item => [item, ...layers(item.layers || [])]);
describe('genuine Sketch design export, not a Figma plugin or bitmap screenshot', () => {
  it('builds valid separate document/page parts with stable IDs and editable layers', () => {
    const doc=makePrototypeFixture();const output=buildPrototypeSketch(doc);
    expect(output.document._class).toBe('document');expect(output.meta.version).toBe(121);expect(output.pages).toHaveLength(3);
    expect(output.document.pages.map(page=>page._ref)).toEqual(output.pages.map(page=>`pages/${page.id}`));
    const all=output.pages.flatMap(page=>layers(page.content.layers));
    expect(all.filter(node=>node._class==='text').some(node=>node.attributedString.string.includes('一个想法'))).toBe(true);
    expect(all.some(node=>node._class==='rectangle')).toBe(true);expect(all.some(node=>node._class==='group')).toBe(true);
    const ids=all.map(node=>node.do_objectID);expect(new Set(ids).size).toBe(ids.length);expect(ids.every(id=>/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/.test(id))).toBe(true);
    expect(buildPrototypeSketch({...doc,nodes:[...doc.nodes].reverse()}).document.do_objectID).toBe(output.document.do_objectID);
  });
  it('calculates the same fixed flex positions without claiming native Auto Layout', () => {
    const child=(id:string,width:number,height:number):PrototypeNode=>({id,parentId:'frame',kind:'rect',width,height});
    const rows=prototypeChildBounds({width:400,height:100,layout:'horizontal',gap:10,padding:20,align:'center',justify:'space-between'},[child('a',80,40),child('b',100,20)]);
    expect(rows.get('a')).toEqual({x:20,y:30,width:80,height:40});expect(rows.get('b')).toEqual({x:280,y:40,width:100,height:20});
    const columns=prototypeChildBounds({width:200,height:200,layout:'vertical',gap:10,padding:20,align:'end',justify:'center'},[child('a',80,40),child('b',100,30)]);
    expect(columns.get('a')).toEqual({x:100,y:60,width:80,height:40});expect(columns.get('b')).toEqual({x:80,y:110,width:100,height:30});
    expect(SKETCH_EXPORT_LIMITATIONS).toContain('布局按当前尺寸定位');
  });
  it('stores Tab state definitions as additional static artboards with clear warnings, not fake interactive variants', () => {
    const output=buildPrototypeSketch(makePrototypeFixture());const states=output.pages[1];
    expect(states.content.name).toContain('静态');expect(states.content.layers).toHaveLength(2);
    const texts=layers(states.content.layers).filter(node=>node._class==='text').map(node=>node.attributedString.string);
    expect(texts).toContain('一体成型，轻巧随身。');expect(texts).toContain('重量 128g · 铝合金外壳');
    expect(output.warnings.join(' ')).toContain('不转换为 Figma 原生变体');
  });
  it('keeps basic Sketch flow references resolvable and explicitly does not claim native Figma interaction preservation', () => {
    const output=buildPrototypeSketch(makePrototypeFixture());const all=output.pages.flatMap(page=>layers(page.content.layers));const targets=new Set(all.filter(n=>n._class==='artboard').map(n=>n.do_objectID));
    const flows=all.filter(node=>node.flow).map(node=>node.flow);expect(flows.length).toBeGreaterThan(0);
    expect(flows.every(flow=>flow.destinationArtboardID==='back'||targets.has(flow.destinationArtboardID))).toBe(true);
    expect(output.warnings.join(' ')).toContain('基础跳转也需在 Figma 中核对');
    const overlays=all.filter(node=>node.userInfo?.['com.inspirationdrawer.prototype']?.interaction?.action==='openOverlay');
    expect(overlays.every(node=>!node.flow)).toBe(true);
  });
  it('deduplicates real embedded image resources and preserves Unicode text/UTF-16 string lengths', () => {
    const doc=makePrototypeFixture();doc.nodes[0].text='中文 😃';
    const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGO89GTtfwY8gAmf5PBRAAB96ANyQ9uqLgAAAABJRU5ErkJggg==';
    doc.nodes.push(...['image-one','image-two'].map(id=>({id,parentId:'home',kind:'image' as const,width:30,height:30,imageData:data})));
    const output=buildPrototypeSketch(doc);expect(output.images).toHaveLength(1);expect(output.images[0].name).toMatch(/^images\/[A-F0-9-]+\.png$/);
    const all=output.pages.flatMap(page=>layers(page.content.layers));const text=all.find(node=>node.attributedString?.string==='中文 😃');expect(text.attributedString.attributes[0].length).toBe('中文 😃'.length);
    expect(JSON.stringify(output)).not.toContain('data:image');expect(output.images[0].data).toBe(data.split(',')[1]);
  });
  it('exports different domains from actual data and rejects invalid input', () => {
    const doc=makePrototypeFixture();doc.name='研究样本仪表盘';doc.id='research-dashboard';doc.nodes[0].text='样本统计';
    expect(buildPrototypeSketch(doc).meta.pagesAndArtboards).toBeDefined();expect(JSON.stringify(buildPrototypeSketch(doc))).toContain('样本统计');
    expect(()=>buildPrototypeSketch({...doc,schemaVersion:2} as any)).toThrow();
    expect(sketchId('domain-a')).not.toBe(sketchId('domain-b'));
  });
});
