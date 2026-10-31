#!/usr/bin/env python3
"""Read-only, dependency-free verifier for native editable chat PPTX packages.

Usage: python scripts/verify-chat-pptx.py PATH.pptx
       python scripts/verify-chat-pptx.py --self-test

Prints JSON; exits 0 for success, 1 for validation failure, 2 for CLI misuse.
Never extracts, modifies the input, starts Office, follows network links, or
reads other documents. --self-test creates synthetic fixtures in a disposable
temporary directory only. Bounds checks measure transformed shape/text BOXES,
not glyphs: this is not a renderer, font/text-fit check, full XSD validator, or
binary-media/malware scanner. No individual slide must have images/charts/notes.
The deck must have nonblank native shape/table a:t text by default.
"""

import argparse
import collections
import copy
import json
import math
from pathlib import Path
import posixpath
import re
import stat
import sys
import tempfile
import urllib.parse
import warnings
import xml.etree.ElementTree as ET
import zipfile

P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
NS = {'p': P, 'a': A, 'r': R}
STRICT = {'http://purl.oclc.org/ooxml/presentationml/main': P,
          'http://purl.oclc.org/ooxml/drawingml/main': A,
          'http://purl.oclc.org/ooxml/officeDocument/relationships': R}
MIME_BASE = 'application/vnd.openxmlformats-officedocument.'
MIMES = {kind: MIME_BASE + suffix for kind, suffix in {
    'presentation': 'presentationml.presentation.main+xml',
    'slide': 'presentationml.slide+xml', 'slideMaster': 'presentationml.slideMaster+xml',
    'slideLayout': 'presentationml.slideLayout+xml', 'theme': 'theme+xml'}.items()}
ROOTS = {f'{{{P}}}presentation': 'presentation', f'{{{P}}}sld': 'slide',
         f'{{{P}}}sldMaster': 'slideMaster', f'{{{P}}}sldLayout': 'slideLayout',
         f'{{{A}}}theme': 'theme'}
MEDIA = {'png': {'image/png'}, 'jpg': {'image/jpeg'}, 'jpeg': {'image/jpeg'},
         'gif': {'image/gif'}, 'svg': {'image/svg+xml'}, 'webp': {'image/webp'},
         'bmp': {'image/bmp', 'image/x-ms-bmp'}, 'tif': {'image/tiff'}, 'tiff': {'image/tiff'},
         'emf': {'image/emf', 'image/x-emf'}, 'wmf': {'image/wmf', 'image/x-wmf'}}
MAX_ENTRIES, MAX_TOTAL, MAX_PART, MAX_XML = 10000, 256*1024**2, 128*1024**2, 16*1024**2
TOLERANCE = 12700  # one point in EMU
LOCAL_PATH = re.compile(r'(?i)(?:file\s*:|(?:^|[\s\x22\x27(<=>])(?:[a-z]:[\\/]|'
                        r'\\\\[^\\\s]|//[^/\s]+/|/(?:Users|home|tmp|private|var|etc|mnt|Volumes|opt|data)/))')
MACRO_EXTS = {'.pptm', '.ppsm', '.potm', '.sldm', '.docm', '.dotm', '.xlsm', '.xlam', '.xltm', '.vba'}
IDENTITY = (1., 0., 0., 1., 0., 0.)


def q(local, namespace=P):
    return '{' + namespace + '}' + local


def decode(value):
    if re.search(r'%(?![0-9a-fA-F]{2})', value):
        raise ValueError('Malformed percent encoding')
    value = urllib.parse.unquote(value, errors='strict')
    if '%' in value:
        raise ValueError('Ambiguous/repeated percent encoding')
    return value


def safe_name(value, directory=False):
    name = decode(value)
    name = name[:-1] if directory and name.endswith('/') else name
    if not name or name.startswith('/') or '\\' in name or ':' in name:
        raise ValueError('Empty, absolute, drive-qualified or backslash ZIP path')
    if any(ord(c) < 32 or ord(c) == 127 for c in name) or '?' in name or '#' in name:
        raise ValueError('Control character, query or fragment in ZIP path')
    if any(p in ('', '.', '..') or p.endswith((' ', '.')) for p in name.split('/')):
        raise ValueError('Traversal/dot/empty/Windows-ambiguous path component')
    return name


def resolve(source, target):
    # OPC /ppt/... is package-root absolute, NOT an OS filesystem path.
    if not target or target != target.strip():
        raise ValueError('Missing target or surrounding whitespace')
    value = decode(target)
    if '\\' in value or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError('Backslash/control character in relationship target')
    uri = urllib.parse.urlsplit(value)
    if uri.scheme or uri.netloc or uri.query or uri.fragment or value.startswith('//') or ':' in uri.path:
        raise ValueError('External/local-file/query/fragment target forbidden')
    parts = [] if value.startswith('/') else source.split('/')[:-1]
    for part in uri.path.lstrip('/').split('/'):
        if part == '..':
            if not parts:
                raise ValueError('Target escapes package root')
            parts.pop()
        elif part not in ('', '.'):
            parts.append(part)
    return safe_name('/'.join(parts))


def multiply(l, r):
    a, b, c, d, e, f = l
    g, h, i, j, k, m = r
    return a*g+c*h, b*g+d*h, a*i+c*j, b*i+d*j, a*k+c*m+e, b*k+d*m+f


def point(m, x, y):
    a, b, c, d, e, f = m
    return a*x+c*y+e, b*x+d*y+f


def rotation(t, x, y, w, h):
    angle = math.radians(int(t.get('rot', '0'))/60000)
    sx = -1 if t.get('flipH') in ('1', 'true') else 1
    sy = -1 if t.get('flipV') in ('1', 'true') else 1
    c, s, cx, cy = math.cos(angle), math.sin(angle), x+w/2, y+h/2
    return multiply((1, 0, 0, 1, cx, cy),
                    multiply((c*sx, s*sx, -s*sy, c*sy, 0, 0), (1, 0, 0, 1, -cx, -cy)))


class Verifier:
    def __init__(self, path, min_text_runs=1):
        self.path, self.min_text_runs = Path(path), min_text_runs
        self.errors, self.names, self.xml = [], set(), {}
        self.types, self.kinds, self.rels = {}, {}, {}
        self.metrics = {key: 0 for key in ('zip_entries', 'uncompressed_bytes', 'xml_parts',
            'relationships', 'slides', 'slide_masters', 'slide_layouts', 'themes', 'media_parts',
            'image_embeds', 'native_text_runs', 'nonempty_native_text_runs', 'native_text_characters',
            'shapes_checked', 'text_shapes_checked', 'intentional_background_bleeds')}
        self.metrics['per_slide'] = []

    def error(self, code, part, message):
        if len(self.errors) < 500:
            self.errors.append({'code': code, 'part': part, 'message': str(message)[:600]})

    def run(self):
        try:
            with zipfile.ZipFile(self.path, 'r') as archive:
                self.read_zip(archive)
            self.content_types()
            self.relationships()
            self.presentation()
        except (OSError, ValueError, zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError,
                NotImplementedError, EOFError, RecursionError) as exc:
            self.error('unreadable_package', '', f'{type(exc).__name__}: {exc}')
        return {'ok': not self.errors, 'path': str(self.path), 'metrics': self.metrics,
                'errors': self.errors, 'warnings': [],
                'limits': {'max_entries': MAX_ENTRIES, 'max_uncompressed_bytes': MAX_TOTAL,
                           'max_part_bytes': MAX_PART, 'max_xml_bytes': MAX_XML,
                           'max_reported_errors': 500, 'bounds_tolerance_emu': TOLERANCE,
                           'min_nonempty_native_text_runs': self.min_text_runs},
                'scope': 'Read-only ZIP/XML/relationship/shape-box checks; no rendering, '
                         'glyph/text-fit, full XSD or binary-media validation.'}

    def read_zip(self, archive):
        entries = archive.infolist()
        self.metrics['zip_entries'] = len(entries)
        self.metrics['uncompressed_bytes'] = sum(e.file_size for e in entries)
        if len(entries) > MAX_ENTRIES or self.metrics['uncompressed_bytes'] > MAX_TOTAL:
            self.error('zip_limit', '', 'Entry/expanded-size safety limit exceeded')
            return
        seen = set()
        for info in entries:
            name = info.filename
            try:
                if info.orig_filename != name:
                    raise ValueError('NUL in ZIP filename')
                normalized = safe_name(name, info.is_dir())
            except (ValueError, UnicodeError) as exc:
                self.error('unsafe_zip_path', name, exc)
                continue
            if normalized.casefold() in seen:
                self.error('duplicate_zip_path', name, 'Duplicate/decoded/case-folded path')
                continue
            seen.add(normalized.casefold())
            if stat.S_IFMT(info.external_attr >> 16) not in (0, stat.S_IFREG, stat.S_IFDIR):
                self.error('unsafe_zip_entry', name, 'Links and special files forbidden')
                continue
            if info.flag_bits & 1:
                self.error('encrypted_zip_entry', name, 'Encryption forbidden')
                continue
            if info.is_dir():
                continue
            self.names.add(normalized)
            lower = normalized.lower()
            if 'vba' in posixpath.basename(lower) or Path(lower).suffix in MACRO_EXTS:
                self.error('macro_part', name, 'VBA/macro-enabled part forbidden')
            xml_like = lower.endswith(('.xml', '.rels', '.svg'))
            limit = MAX_XML if xml_like else MAX_PART
            if info.file_size > limit:
                self.error('part_limit', name, f'Part exceeds {limit} bytes')
                continue
            try:
                with archive.open(info, 'r') as member:
                    payload = member.read(limit+1)  # validates CRC; no extraction
                if len(payload) > limit:
                    self.error('part_limit', name, 'Expanded read limit exceeded')
                    continue
                if not xml_like:
                    continue
                security = payload.replace(b'\x00', b'').upper()  # also UTF-16/32
                if b'<!DOCTYPE' in security or b'<!ENTITY' in security:
                    self.error('unsafe_xml_declaration', name, 'DTD/entities forbidden')
                    continue
                root = ET.fromstring(payload)
                for el in root.iter():
                    for old, new in STRICT.items():
                        el.tag = el.tag.replace('{' + old + '}', '{' + new + '}')
                        el.attrib = {k.replace('{' + old + '}', '{' + new + '}'): v for k, v in el.attrib.items()}
                self.xml[normalized] = root
                self.metrics['xml_parts'] += 1
                if any(LOCAL_PATH.search(v) for el in root.iter()
                       for v in [*el.attrib.values(), el.text or '', el.tail or '']):
                    self.error('absolute_local_path', name, 'XML leaks file URI/absolute local path')
            except (ET.ParseError, UnicodeError, OSError, zipfile.BadZipFile, RuntimeError,
                    NotImplementedError, EOFError) as exc:
                self.error('xml_parse' if xml_like else 'zip_read', name, exc)

    def content_types(self):
        root = self.xml.get('[Content_Types].xml')
        if root is None or root.tag != q('Types', CT):
            self.error('content_types_missing', '[Content_Types].xml', 'Missing/invalid Types root')
            return
        defaults, overrides = {}, {}
        for el in root:
            mime = el.get('ContentType', '')
            if not mime or '/' not in mime:
                self.error('content_type_invalid', '[Content_Types].xml', 'Invalid MIME type')
            if 'macroenabled' in mime.lower() or 'vba' in mime.lower():
                self.error('macro_content_type', '[Content_Types].xml', 'Macro/VBA MIME type forbidden')
            if el.tag == q('Default', CT):
                ext = el.get('Extension', '').lower()
                if not ext or ext in defaults or any(c in ext for c in './\\:'):
                    self.error('content_type_duplicate', '[Content_Types].xml', 'Invalid/duplicate extension')
                defaults[ext] = mime
            elif el.tag == q('Override', CT):
                try:
                    value = el.get('PartName', '')
                    if not value.startswith('/'):
                        raise ValueError('Override must use package-root absolute PartName')
                    name = safe_name(value[1:])
                    if name in overrides:
                        raise ValueError('Duplicate Override PartName')
                    overrides[name] = mime
                    if name not in self.names:
                        self.error('content_type_orphan', name, 'Override names missing part')
                except (ValueError, UnicodeError) as exc:
                    self.error('content_type_invalid', '[Content_Types].xml', exc)
            else:
                self.error('content_type_invalid', '[Content_Types].xml', 'Unexpected element')
        for name in sorted(self.names - {'[Content_Types].xml'}):
            mime = overrides.get(name, defaults.get(name.rsplit('.', 1)[-1].lower(), ''))
            self.types[name] = mime
            if not mime:
                self.error('content_type_missing', name, 'No matching Default/Override')
            root = self.xml.get(name)
            kind = ROOTS.get(root.tag) if root is not None else None
            if kind:
                self.kinds[name] = kind
                if mime != MIMES[kind]:
                    self.error('content_type_mismatch', name, f'Expected {MIMES[kind]}, got {mime!r}')
            expected = 'presentation' if name == 'ppt/presentation.xml' else None
            for folder, role in [('slides', 'slide'), ('slideMasters', 'slideMaster'),
                                 ('slideLayouts', 'slideLayout'), ('theme', 'theme')]:
                if re.fullmatch('ppt/' + folder + r'/[^/]+\.xml', name):
                    expected = role
            if expected and kind != expected:
                self.error('part_root_mismatch', name, f'Expected {expected} XML root')
            if name.endswith('.rels') and mime != 'application/vnd.openxmlformats-package.relationships+xml':
                self.error('content_type_mismatch', name, 'Incorrect relationships MIME type')
            if name.startswith('ppt/media/'):
                self.metrics['media_parts'] += 1
                ext = name.rsplit('.', 1)[-1].lower()
                if (ext in MEDIA and mime not in MEDIA[ext]) or not mime.startswith(('image/', 'audio/', 'video/')):
                    self.error('content_type_mismatch', name, 'Incorrect media MIME type')
        counts = collections.Counter(self.kinds.values())
        for role, metric in [('slideMaster', 'slide_masters'), ('slideLayout', 'slide_layouts'), ('theme', 'themes')]:
            self.metrics[metric] = counts[role]
            if not counts[role]:
                self.error('required_part_missing', '', f'No {role} part')

    def relationships(self):
        for name, root in sorted(self.xml.items()):
            if not name.endswith('.rels'):
                continue
            folder, leaf = posixpath.split(name)
            if name == '_rels/.rels':
                source = ''
            elif posixpath.basename(folder) == '_rels':
                source = posixpath.join(posixpath.dirname(folder), leaf[:-5])
                if source not in self.names:
                    self.error('relationship_source_missing', name, 'Missing source part')
            else:
                self.error('relationship_location', name, 'Invalid relationship-part location')
                continue
            if root.tag != q('Relationships', PKG):
                self.error('relationship_root', name, 'Invalid Relationships root')
                continue
            mapping = self.rels.setdefault(source, {})
            for el in root:
                self.metrics['relationships'] += 1
                rid, kind = el.get('Id', ''), el.get('Type', '')
                for old, new in STRICT.items():
                    if kind.startswith(old + '/'):
                        kind = new + kind[len(old):]
                if el.tag != q('Relationship', PKG) or not rid or not kind:
                    self.error('relationship_invalid', name, 'Invalid element or missing Id/Type')
                    continue
                if rid in mapping:
                    self.error('relationship_duplicate_id', name, f'Duplicate Id {rid}')
                    continue
                mapping[rid] = {'type': kind, 'target': None}
                if 'vba' in kind.lower() or 'macro' in kind.lower():
                    self.error('macro_relationship', name, 'Macro/VBA relationship forbidden')
                if el.get('TargetMode', 'Internal') != 'Internal':
                    self.error('external_relationship', name, 'Non-internal relationship forbidden')
                    continue
                try:
                    target = resolve(source, el.get('Target', ''))
                    mapping[rid]['target'] = target
                    if target not in self.names:
                        self.error('relationship_target_missing', name, f'{rid}: missing {target}')
                    role = kind.removeprefix(R + '/')
                    if role in ('slide', 'slideMaster', 'slideLayout', 'theme') and self.kinds.get(target) != role:
                        self.error('relationship_type_mismatch', name, f'{rid}: expected {role}')
                    if role == 'image' and not self.types.get(target, '').startswith('image/'):
                        self.error('image_content_type', name, f'{rid}: image target is not image/*')
                except (ValueError, UnicodeError) as exc:
                    self.error('unsafe_relationship_target', name, f'{rid}: {exc}')
        for name, root in self.xml.items():
            mapping = self.rels.get(name, {})
            for el in root.iter():
                is_image = el.tag == q('blip', A) or el.tag.endswith('}svgBlip')
                for attr, rid in el.attrib.items():
                    if not attr.startswith('{' + R + '}'):
                        continue
                    rel = mapping.get(rid)
                    if rel is None:
                        self.error('relationship_reference_missing', name, f'Unresolved {attr}={rid!r}')
                    if is_image and attr == q('embed', R):
                        self.metrics['image_embeds'] += 1
                        if not rel or rel['type'] != R + '/image' or rel['target'] not in self.names:
                            self.error('image_embed_missing', name, f'{rid}: embedded image unavailable')
                    if is_image and attr == q('link', R):
                        self.error('linked_image', name, 'Images must be embedded, not linked')
                if is_image and q('embed', R) not in el.attrib:
                    self.error('image_embed_missing', name, 'Image lacks r:embed')

    def links(self, source, role):
        return [r['target'] for r in self.rels.get(source, {}).values()
                if r['type'] == R + '/' + role and r['target'] in self.names]

    def require_link(self, source, role, multiple=False):
        links = self.links(source, role)
        if not links or (not multiple and len(links) != 1):
            self.error('required_relationship', source, f'Expected {"at least one" if multiple else "one"} {role}')

    def presentation(self):
        offices = self.links('', 'officeDocument')
        if len(offices) != 1 or self.kinds.get(offices[0]) != 'presentation':
            self.error('presentation_relationship', '_rels/.rels', 'Expected one officeDocument targeting PPTX presentation')
            return
        name = offices[0]
        root = self.xml[name]
        try:
            size = root.find('p:sldSz', NS)
            w, h = int(size.get('cx')), int(size.get('cy'))
            if min(w, h) <= 0 or max(w, h) > 2**31-1:
                raise ValueError('Dimensions outside positive signed 32-bit EMU range')
        except (AttributeError, TypeError, ValueError) as exc:
            self.error('slide_dimensions', name, exc)
            return
        self.metrics['slide_size_emu'] = {'cx': w, 'cy': h}
        self.require_link(name, 'slideMaster', multiple=True)
        for part, kind in self.kinds.items():
            if kind == 'slide':
                self.require_link(part, 'slideLayout')
            elif kind == 'slideLayout':
                self.require_link(part, 'slideMaster')
            elif kind == 'slideMaster':
                self.require_link(part, 'theme')
                self.require_link(part, 'slideLayout', multiple=True)
        referenced, ids = [], set()
        for el in root.findall('p:sldIdLst/p:sldId', NS):
            try:
                number = int(el.get('id', ''))
                if not 256 <= number <= 2**31-1 or number in ids:
                    raise ValueError('Slide id not unique or outside [256, 2147483647]')
                ids.add(number)
            except ValueError as exc:
                self.error('slide_id', name, exc)
            rel = self.rels.get(name, {}).get(el.get(q('id', R)))
            if not rel or rel['type'] != R + '/slide' or self.kinds.get(rel['target']) != 'slide':
                self.error('slide_reference', name, 'Invalid slide-list relationship')
                continue
            if rel['target'] in referenced:
                self.error('slide_reference_duplicate', name, 'Slide part listed twice')
            referenced.append(rel['target'])
        if not referenced:
            self.error('slides_missing', name, 'No ordered slides')
        self.metrics['slides'] = len(referenced)
        for part in sorted(p for p, role in self.kinds.items() if role == 'slide'):
            if part not in referenced:
                self.error('slide_orphan', part, 'Slide absent from presentation slide list')
            self.slide(part, w, h)
        if self.metrics['nonempty_native_text_runs'] < self.min_text_runs:
            self.error('native_text_missing', name, f'Requires >= {self.min_text_runs} nonblank native shape/table a:t runs')

    def transforms(self, shape, slide):
        direct = shape.find('p:spPr/a:xfrm', NS)
        if direct is None:
            direct = shape.find('p:xfrm', NS)
        found = [] if direct is None else [direct]
        ph = shape.find('.//p:ph', NS)
        if ph is None:
            return found
        layouts = self.links(slide, 'slideLayout')
        sources = layouts + [m for l in layouts for m in self.links(l, 'slideMaster')]
        for source in sources:
            root = self.xml.get(source)
            if root is None:
                continue
            candidates = []
            for sp in root.findall('.//p:sp', NS):
                p = sp.find('.//p:ph', NS)
                if p is not None:
                    score = 2*(p.get('idx', '0') == ph.get('idx', '0')) + (p.get('type', 'obj') == ph.get('type', 'obj'))
                    if score:
                        candidates.append((score, sp))
            if candidates:
                t = max(candidates, key=lambda item: item[0])[1].find('p:spPr/a:xfrm', NS)
                if t is not None:
                    found.append(t)
        return found

    def slide(self, name, page_w, page_h):
        root, ids = self.xml[name], set()
        for props in root.iter(q('cNvPr')):
            try:
                number = int(props.get('id', ''))
                if not 0 <= number <= 2**32-1 or number in ids:
                    raise ValueError('cNvPr id must be unique per slide and unsigned 32-bit')
                ids.add(number)
            except ValueError as exc:
                self.error('shape_id', name, exc)
        metrics = {k: 0 for k in ('native_text_runs', 'nonempty_native_text_runs', 'native_text_characters',
                   'shapes_checked', 'text_shapes_checked', 'intentional_background_bleeds')}
        metrics['part'] = name
        tree = root.find('p:cSld/p:spTree', NS)
        if tree is None:
            self.error('shape_tree_missing', name, 'Missing slide shape tree')
            return

        def visit(parent, matrix):
            for sp in parent:
                if sp.tag not in {q(n) for n in ('sp', 'pic', 'graphicFrame', 'cxnSp', 'grpSp')}:
                    if sp.tag.endswith('}AlternateContent'):
                        self.error('unsupported_geometry', name, 'AlternateContent requires renderer capability selection')
                    continue
                group = sp.tag == q('grpSp')
                text = sp.findall('p:txBody//a:t', NS) if sp.tag == q('sp') else (
                    sp.findall('.//a:tbl//a:txBody//a:t', NS) if sp.tag == q('graphicFrame') else [])
                metrics['native_text_runs'] += len(text)
                metrics['nonempty_native_text_runs'] += sum(bool((t.text or '').strip()) for t in text)
                metrics['native_text_characters'] += sum(len(t.text or '') for t in text)
                ts = [sp.find('p:grpSpPr/a:xfrm', NS)] if group else self.transforms(sp, name)
                ts = [t for t in ts if t is not None]
                try:
                    off = next((t.find('a:off', NS) for t in ts if t.find('a:off', NS) is not None), None)
                    ext = next((t.find('a:ext', NS) for t in ts if t.find('a:ext', NS) is not None), None)
                    if off is None or ext is None:
                        raise ValueError('Missing offset/extent, including placeholder inheritance')
                    x, y, w, h = int(off.get('x')), int(off.get('y')), int(ext.get('cx')), int(ext.get('cy'))
                    if min(w, h) < 0 or (text and min(w, h) <= 0) or max(abs(v) for v in (x, y, w, h)) > 2**53:
                        raise ValueError('Negative/huge extent or zero text container')
                    combined = multiply(matrix, rotation(ts[0], x, y, w, h))
                    corners = [point(combined, px, py) for px, py in ((x, y), (x+w, y), (x, y+h), (x+w, y+h))]
                    left, right = min(p[0] for p in corners), max(p[0] for p in corners)
                    top, bottom = min(p[1] for p in corners), max(p[1] for p in corners)
                    outside = left < -TOLERANCE or top < -TOLERANCE or right > page_w+TOLERANCE or bottom > page_h+TOLERANCE
                    geom = sp.find('p:spPr/a:prstGeom', NS)
                    filled = any(sp.find('p:spPr/a:' + f, NS) is not None for f in ('solidFill', 'gradFill', 'pattFill'))
                    background = (not text and sp.tag == q('sp') and filled and geom is not None and geom.get('prst') == 'rect'
                        and -0.05*page_w <= left <= 0 and -0.05*page_h <= top <= 0
                        and page_w <= right <= 1.05*page_w and page_h <= bottom <= 1.05*page_h)
                    if outside and background:
                        metrics['intentional_background_bleeds'] += 1
                    elif outside:
                        props = sp.find('.//p:cNvPr', NS)
                        sid = props.get('id', '?') if props is not None else '?'
                        self.error('text_bounds' if text else 'shape_bounds', name,
                            f'Shape {sid} {[round(v, 2) for v in (left, top, right, bottom)]} outside [0,0,{page_w},{page_h}]')
                    metrics['shapes_checked'] += 1
                    metrics['text_shapes_checked'] += bool(text)
                    if group:
                        co, ce = ts[0].find('a:chOff', NS), ts[0].find('a:chExt', NS)
                        if co is None or ce is None:
                            raise ValueError('Missing group child-coordinate transform')
                        cw, ch = int(ce.get('cx')), int(ce.get('cy'))
                        if min(cw, ch) <= 0:
                            raise ValueError('Nonpositive group child extents')
                        sx, sy = w/cw, h/ch
                        visit(sp, multiply(combined, (sx, 0, 0, sy, x-int(co.get('x'))*sx, y-int(co.get('y'))*sy)))
                except (TypeError, ValueError, OverflowError) as exc:
                    self.error('shape_geometry', name, exc)
        visit(tree, IDENTITY)
        self.metrics['per_slide'].append(metrics)
        for key, value in metrics.items():
            if key != 'part':
                self.metrics[key] += value


def verify(path, min_text_runs=1):
    return Verifier(path, min_text_runs).run()


def fixture_parts():
    """Small synthetic structural fixture; not a product presentation."""
    def rels(*entries):
        return (f'<Relationships xmlns="{PKG}">' + ''.join(
            f'<Relationship Id="{rid}" Type="{R}/{kind}" Target="{target}"/>'
            for rid, kind, target in entries) + '</Relationships>').encode()
    def root(kind, body):
        return f'<p:{kind} xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}">{body}</p:{kind}>'.encode()
    def tree(body=''):
        return '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/></p:nvGrpSpPr><p:grpSpPr/>' + body + '</p:spTree>'
    shape = ('<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
             '<p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="3000000" cy="1000000"/>'
             '</a:xfrm><a:prstGeom prst="rect"/></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>'
             '<a:p><a:r><a:t>Editable &amp; native</a:t></a:r></a:p></p:txBody></p:sp>')
    overrides = [('ppt/presentation.xml', 'presentation'), ('ppt/slides/slide1.xml', 'slide'),
                 ('ppt/slideMasters/slideMaster1.xml', 'slideMaster'),
                 ('ppt/slideLayouts/slideLayout1.xml', 'slideLayout'), ('ppt/theme/theme1.xml', 'theme')]
    return {
        '[Content_Types].xml': (f'<Types xmlns="{CT}"><Default Extension="xml" ContentType="application/xml"/>'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + ''.join(f'<Override PartName="/{n}" ContentType="{MIMES[k]}"/>' for n, k in overrides) + '</Types>').encode(),
        '_rels/.rels': rels(('rId1', 'officeDocument', 'ppt/presentation.xml')),
        'ppt/presentation.xml': root('presentation', '<p:sldMasterIdLst><p:sldMasterId id="2147483648" '
            'r:id="rId2"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>'
            '<p:sldSz cx="12192000" cy="6858000"/>'),
        'ppt/_rels/presentation.xml.rels': rels(('rId1', 'slide', 'slides/slide1.xml'),
            ('rId2', 'slideMaster', 'slideMasters/slideMaster1.xml')),
        'ppt/slides/slide1.xml': root('sld', '<p:cSld>' + tree(shape) + '</p:cSld>'),
        'ppt/slides/_rels/slide1.xml.rels': rels(('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml')),
        'ppt/slideMasters/slideMaster1.xml': root('sldMaster', '<p:cSld>' + tree() + '</p:cSld>'),
        'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels(('rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'),
            ('rId2', 'theme', '../theme/theme1.xml')),
        'ppt/slideLayouts/slideLayout1.xml': root('sldLayout', '<p:cSld>' + tree() + '</p:cSld>'),
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels(('rId1', 'slideMaster', '../slideMasters/slideMaster1.xml')),
        'ppt/theme/theme1.xml': f'<a:theme xmlns:a="{A}" name="Synthetic"><a:themeElements/></a:theme>'.encode(),
    }


def self_test():
    baseline, cases, failures, tests = fixture_parts(), [], [], []
    slide, rels, ct = 'ppt/slides/slide1.xml', 'ppt/slides/_rels/slide1.xml.rels', '[Content_Types].xml'

    def case(name, part=None, old=None, new=None, expected=None, extra=None, remove=None, special=None):
        parts = copy.deepcopy(baseline)
        if part:
            parts[part] = parts[part].replace(old, new)
        parts.update(extra or {})
        if remove:
            parts.pop(remove)
        cases.append((name, parts, expected, special))

    case('valid_text_only_no_images_charts_notes')
    case('valid_package_root_uri', '_rels/.rels', b'Target="ppt/', b'Target="/ppt/')
    case('valid_relative_normalization', rels, b'../slideLayouts/', b'../slides/../slideLayouts/')
    case('missing_theme', remove='ppt/theme/theme1.xml', expected='relationship_target_missing')
    case('broken_target', rels, b'slideLayout1.xml', b'missing.xml', 'relationship_target_missing')
    case('external_relationship', rels, b'Target="../', b'TargetMode="External" Target="../', 'external_relationship')
    for name, target in [('network', b'https://example.invalid/x'), ('file_uri', b'file:///C:/secret.xml'),
                         ('drive', b'C:/secret.xml'), ('traversal', b'../../../secret.xml'),
                         ('encoded_traversal', b'%2e%2e/%2e%2e/%2e%2e/secret.xml')]:
        case(name, rels, b'../slideLayouts/slideLayout1.xml', target, 'unsafe_relationship_target')
    case('duplicate_shape_id', slide, b'id="2"', b'id="1"', 'shape_id')
    case('numeric_equivalent_shape_id', slide, b'id="2"', b'id="01"', 'shape_id')
    case('bad_xml', slide, b'</p:sld>', b'</p:broken>', 'xml_parse')
    case('entity_declaration', slide, b'<p:sld ', b'<!DOCTYPE p:sld [<!ENTITY x "y">]><p:sld ', 'unsafe_xml_declaration')
    case('wrong_slide_mime', ct, MIMES['slide'].encode(), b'application/xml', 'content_type_mismatch')
    case('duplicate_default', ct, b'</Types>', b'<Default Extension="xml" ContentType="application/xml"/></Types>', 'content_type_duplicate')
    case('bad_slide_root', slide, b'p:sld', b'p:wrong', 'part_root_mismatch')
    case('no_editable_text', slide, b'Editable &amp; native', b'', 'native_text_missing')
    case('offpage_text', slide, b'x="100000"', b'x="-1000000"', 'text_bounds')
    case('oversized_text', slide, b'cx="3000000"', b'cx="30000000"', 'text_bounds')
    case('negative_extent', slide, b'cx="3000000"', b'cx="-1"', 'shape_geometry')
    case('missing_transform', slide, b'a:xfrm', b'a:unused', 'shape_geometry')
    case('bad_slide_size', 'ppt/presentation.xml', b'cx="12192000"', b'cx="0"', 'slide_dimensions')
    case('missing_rid', slide, b'<p:spPr>', b'<p:spPr r:id="missing">', 'relationship_reference_missing')
    case('missing_image', slide, b'</p:spPr>', b'<a:blipFill><a:blip r:embed="missing"/></a:blipFill></p:spPr>', 'image_embed_missing')
    case('image_wrong_rel_type', slide, b'</p:spPr>', b'<a:blipFill><a:blip r:embed="rId1"/></a:blipFill></p:spPr>', 'image_embed_missing')
    case('linked_image', slide, b'</p:spPr>', b'<a:blipFill><a:blip r:link="rId1"/></a:blipFill></p:spPr>', 'linked_image')
    case('macro_part', extra={'ppt/vbaProject.bin': b'synthetic'}, expected='macro_part')
    case('macro_mime', ct, MIMES['presentation'].encode(), b'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml', 'macro_content_type')
    case('macro_rel', rels, b'/slideLayout"', b'/vbaProject"', 'macro_relationship')
    case('windows_local_path', slide, b'Editable &amp; native', b'C:\\Users\\synthetic\\file.pptx', 'absolute_local_path')
    case('posix_local_path', slide, b'Editable &amp; native', b'/home/synthetic/file.pptx', 'absolute_local_path')
    for name in ('../evil.xml', 'C:/evil.xml', 'ppt\\evil.xml', 'ppt/%2e%2e/evil.xml'):
        case('unsafe_entry_' + name, extra={name: b'<x/>'}, expected='unsafe_zip_path')
    case('casefold_collision', extra={'PPT/SLIDES/SLIDE1.XML': baseline[slide]}, expected='duplicate_zip_path')
    case('missing_content_types', remove=ct, expected='content_types_missing')
    case('orphan_slide', extra={'ppt/slides/slide2.xml': baseline[slide]}, expected='slide_orphan')
    case('valid_utf16', extra={slide: ('<?xml version="1.0" encoding="UTF-16"?>' + baseline[slide].decode()).encode('utf-16')})
    case('utf16_doctype', extra={slide: ('<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE p:sld>' + baseline[slide].decode()).encode('utf-16')}, expected='unsafe_xml_declaration')
    background = (b'<p:sp><p:nvSpPr><p:cNvPr id="3" name="Background"/></p:nvSpPr><p:spPr>'
        b'<a:xfrm><a:off x="-100000" y="-100000"/><a:ext cx="12392000" cy="7058000"/></a:xfrm>'
        b'<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr></p:sp>')
    case('valid_background_bleed', slide, b'</p:spTree>', background + b'</p:spTree>')
    case('excessive_background_bleed', slide, b'</p:spTree>', background.replace(b'-100000', b'-1000000') + b'</p:spTree>', 'shape_bounds')
    case('unfilled_rect_not_background', slide, b'</p:spTree>', background.replace(b'a:solidFill', b'a:noFill') + b'</p:spTree>', 'shape_bounds')
    case('rotation_outside', slide, b'<a:xfrm>', b'<a:xfrm rot="5400000">', 'text_bounds')
    case('exact_duplicate', expected='duplicate_zip_path', special='duplicate')
    case('symlink', expected='unsafe_zip_entry', special='symlink')
    with tempfile.TemporaryDirectory(prefix='verify-chat-pptx-') as folder:
        for index, (name, parts, expected, special) in enumerate(cases):
            path = Path(folder) / f'{index:02d}.pptx'
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
                    for part, payload in parts.items():
                        archive.writestr(part, payload)
                    if special == 'duplicate':
                        archive.writestr(slide, baseline[slide])
                    elif special == 'symlink':
                        info = zipfile.ZipInfo('ppt/link.xml')
                        info.create_system, info.external_attr = 3, (stat.S_IFLNK | 0o777) << 16
                        archive.writestr(info, b'../../outside')
            # ZipInfo normalizes backslashes on Windows; restore the raw test
            # name in both local/central records so the unsafe fixture is real.
            for member in parts:
                if '\\' in member:
                    raw = path.read_bytes().replace(member.replace('\\', '/').encode(), member.encode())
                    path.write_bytes(raw)
            before = path.read_bytes()
            result = verify(path)
            codes = {e['code'] for e in result['errors']}
            passed = (result['ok'] if expected is None else not result['ok'] and expected in codes)
            passed = passed and before == path.read_bytes()
            tests.append({'name': name, 'passed': passed})
            if not passed:
                failures.append({'name': name, 'expected': expected or 'ok', 'errors': result['errors']})
        for name, payload in [('missing_file', None), ('not_zip', b'not a ZIP')]:
            path = Path(folder) / (name + '.pptx')
            if payload is not None:
                path.write_bytes(payload)
            result = verify(path)
            passed = not result['ok'] and any(e['code'] == 'unreadable_package' for e in result['errors'])
            tests.append({'name': name, 'passed': passed})
            if not passed:
                failures.append({'name': name, 'errors': result['errors']})
    return {'ok': not failures, 'self_test': True, 'tests_run': len(tests),
            'tests_passed': sum(t['passed'] for t in tests), 'tests': tests, 'errors': failures,
            'fixtures': 'Synthetic only; temporary directory removed; verifier left inputs unchanged.'}


class JsonParser(argparse.ArgumentParser):
    def error(self, message):
        print(json.dumps({'ok': False, 'errors': [{'code': 'cli_usage', 'message': message}]}, indent=2))
        self.exit(2)


def main(argv=None):
    parser = JsonParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('pptx', nargs='?', help='PPTX path to inspect read-only')
    parser.add_argument('--self-test', action='store_true', help='Run only synthetic temporary fixtures')
    parser.add_argument('--min-text-runs', type=int, default=1, help='Minimum nonblank native text runs (default: 1)')
    args = parser.parse_args(argv)
    if args.min_text_runs < 0:
        parser.error('--min-text-runs must be nonnegative')
    if args.self_test == bool(args.pptx):
        parser.error('Provide either a PPTX path or --self-test, not both')
    result = self_test() if args.self_test else verify(args.pptx, args.min_text_runs)
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
