"""Validate all actual .sketch JSON entries against the pinned official Sketch
schemas; also check image and flow references. Not a Figma host compatibility test.
Requires Python jsonschema (test-only). No network or production app data access.
"""
import json, sys, zipfile, hashlib
from pathlib import Path
from jsonschema import Draft7Validator
root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'outputs/sketch-export-verification'
vendor = root / 'integrations/sketch/vendor'
schemas = {key: json.loads((vendor / f'{key}.schema.json').read_text(encoding='utf-8')) for key in ['file-format', 'document', 'page', 'meta', 'user']}
def validate(value, key):
    errors = list(Draft7Validator(schemas[key]).iter_errors(value))
    if errors:
        # oneOf errors can otherwise print every alternate layer type in full.
        def detail(error):
            nested = [e for e in error.context if e.validator not in ['const', 'required']] or error.context
            return {'path': '.'.join(map(str, error.absolute_path)), 'message': error.message[:700], 'context': [detail(e) for e in nested[:6]]}
        raise ValueError(json.dumps([detail(error) for error in errors[:8]], ensure_ascii=False, indent=2))
def check_parts(parts):
    for key in ['document', 'meta', 'user']: validate(parts[key], key)
    for page in parts['pages']: validate(page['content'], 'page')
    expanded = {key: parts[key] for key in ['document', 'meta', 'user']}
    expanded['document'] = {**parts['document'], 'pages': [page['content'] for page in parts['pages']]}
    validate(expanded, 'file-format')
parts = json.loads((out / 'sketch-parts.json').read_text(encoding='utf-8'))
check_parts(parts)
def equivalent(a, b):
    if isinstance(a, (float, int)) and not isinstance(a, bool) and isinstance(b, (float, int)) and not isinstance(b, bool):
        import math
        return math.isclose(a, b, rel_tol=1e-14, abs_tol=1e-14)
    if type(a) is not type(b): return False
    if isinstance(a, dict): return a.keys() == b.keys() and all(equivalent(a[k], b[k]) for k in a)
    if isinstance(a, list): return len(a) == len(b) and all(equivalent(x, y) for x, y in zip(a, b))
    return a == b
reports = []
# Prior runs are retained as evidence, but compare only this run's newest archive
# against the current exporter fixture. JSON float roundtrip may differ by one ULP.
for path in sorted(out.glob('prototype-sample-*.sketch'))[-1:]:
    with zipfile.ZipFile(path) as archive:
        if archive.testzip(): raise ValueError('ZIP CRC failed')
        names = set(archive.namelist())
        for name in names:
            if name.startswith('/') or '..' in Path(name).parts: raise ValueError('unsafe ZIP path')
        for forbidden in ['manifest.json', 'code.js', 'ui.html', 'prototype.json', 'preview.html']:
            if any(name.endswith(forbidden) for name in names): raise ValueError('export contains non-Sketch/plugin artifacts')
        document = json.loads(archive.read('document.json'))
        actual = {'document': document, 'meta': json.loads(archive.read('meta.json')), 'user': json.loads(archive.read('user.json')),
                  'pages': [{'id': page['id'], 'content': json.loads(archive.read(f"pages/{page['id']}.json"))} for page in parts['pages']]}
        check_parts(actual)
        if not equivalent(actual['document'], parts['document']): raise ValueError('document does not match current exporter')
        for page in actual['pages']:
            expected = next(p for p in parts['pages'] if p['id'] == page['id'])
            if not equivalent(page, expected): raise ValueError('page data changed during native write')
        image_names = {image['name'] for image in parts['images']}
        expected_names = {'document.json', 'meta.json', 'user.json'} | {f"pages/{page['id']}.json" for page in parts['pages']} | image_names
        if names != expected_names: raise ValueError('missing or unexpected archive entries')
        ids = set(); flows = []; images = set(); texts = []
        def scan(value):
            if isinstance(value, dict):
                if 'do_objectID' in value:
                    if value['do_objectID'] in ids: raise ValueError('duplicate UUID')
                    ids.add(value['do_objectID'])
                if value.get('_class') == 'MSImmutableFlowConnection': flows.append(value['destinationArtboardID'])
                if value.get('_ref_class') == 'MSImageData': images.add(value['_ref'])
                if value.get('_class') == 'attributedString': texts.append(value['string'])
                for child in value.values(): scan(child)
            elif isinstance(value, list):
                for child in value: scan(child)
        scan(document)
        for page in actual['pages']: scan(page['content'])
        if images != image_names: raise ValueError('image links are incomplete')
        boards = {layer['do_objectID'] for page in actual['pages'] for layer in page['content']['layers']}
        if any(target not in boards | {'back', 'automatic'} for target in flows): raise ValueError('flow target missing')
        import base64
        for image in parts['images']:
            if archive.read(image['name']) != base64.b64decode(image['data']): raise ValueError('image bytes do not match')
        reports.append({'file': str(path), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'pages': len(actual['pages']), 'editableTextLayers': len(texts), 'imageFiles': len(images), 'flowReferences': len(flows), 'officialSchemaValid': True, 'archiveCrcValid': True})
result = {'pass': True, 'schema': '@sketch-hq/sketch-file-format@6.5.0', 'sourcePartsValid': True, 'archives': reports,
          'actualFigmaImportTested': False, 'note': 'Schema and archive verification do not prove native Figma import fidelity or interaction preservation.'}
(out / 'sketch-schema-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
