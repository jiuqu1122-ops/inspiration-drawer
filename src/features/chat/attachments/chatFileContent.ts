import { convertFileSrc } from '@tauri-apps/api/core';
import { unzipSync, strFromU8 } from 'fflate';
import type { MsDocBlock } from '@file-viewer/doc';
import type { ChatAttachment } from '../model/chatTypes';
import { assertChatLocalFileSize, chatLocalAttachmentName, getChatLocalFileExtension } from './chatLocalFileAttachments';

const MAX_OFFICE_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_PDF_PAGES = 80;
const MAX_PDF_PREVIEW_PAGES = 3;
const MAX_EXTRACTED_CHARS = 180_000;
const MAX_SHEET_ROWS = 1_000;
const MAX_SHEET_COLUMNS = 100;

export type ChatFileContent = {
  text: string;
  notes?: string;
  images?: string[];
};

export const decodeChatText = (bytes: Uint8Array): string => {
  const littleEndian = bytes[0] === 0xff && bytes[1] === 0xfe;
  const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
  if (littleEndian || bigEndian) return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(bytes);
  const binarySample = bytes.subarray(0, 4_096);
  if (binarySample.some(value => value < 0x20 && value !== 9 && value !== 10 && value !== 12 && value !== 13)) {
    throw new Error('该文件不是可读取的文本或受支持的文档格式。');
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch {
    try { return new TextDecoder('gb18030', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }
  }
};

export const readChatLocalFile = async (path: string, name: string): Promise<Uint8Array> => {
  if (!/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path)) throw new Error('找不到可读取的本地附件。');
  const response = await fetch(convertFileSrc(path));
  if (!response.ok || !response.body) throw new Error('无法打开附件，文件可能已移动或被删除。');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    assertChatLocalFileSize(Number(response.headers.get('content-length')), name);
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      assertChatLocalFileSize(length, name);
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
};

function officeEntries(bytes: Uint8Array, selectEntry: (name: string) => boolean) {
  let expandedBytes = 0;
  return unzipSync(bytes, { filter: entry => {
    expandedBytes += entry.originalSize;
    if (expandedBytes > MAX_OFFICE_EXPANDED_BYTES) throw new Error('解压后的文档过大，请拆分文件。');
    return selectEntry(entry.name);
  } });
}

function readOfficeXml(bytes: Uint8Array, extension: string): ChatFileContent {
  const word = extension === 'docx';
  const presentation = extension === 'pptx';
  const matches = word ? /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/
    : presentation ? /^ppt\/slides\/slide\d+\.xml$/ : /^content\.xml$/;
  const entries = officeEntries(bytes, name => matches.test(name));
  const names = Object.keys(entries).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (word && entries['word/document.xml']) names.splice(0, 0, ...names.splice(names.indexOf('word/document.xml'), 1));
  if (!names.length) throw new Error('未找到文档正文。');
  const parser = new DOMParser();
  const sections: string[] = [];
  let characters = 0;
  const limit = 100;
  for (const [index, name] of names.slice(0, limit).entries()) {
    const xml = parser.parseFromString(strFromU8(entries[name]), 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('文档结构损坏，无法读取。');
    const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));
    if (!word && !presentation) paragraphs.push(...Array.from(xml.getElementsByTagNameNS('*', 'h')));
    const text = paragraphs.map(node => word || presentation
      ? Array.from(node.getElementsByTagNameNS('*', 't')).map(run => run.textContent || '').join('')
      : node.textContent || '').filter(value => value.trim()).join('\n');
    if (text) sections.push(presentation ? `[幻灯片 ${name.match(/slide(\d+)/)?.[1] || index + 1}]\n${text}` : text);
    characters += text.length;
    if (characters > MAX_EXTRACTED_CHARS) break;
  }
  return { text: sections.join('\n\n'), notes: names.length > limit ? '仅解析前 100 个文档部分。' : undefined };
}

async function readSpreadsheet(bytes: Uint8Array): Promise<ChatFileContent> {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) officeEntries(bytes, () => false);
  const xlsx = await import('xlsx');
  const workbook = xlsx.read(bytes, { type: 'array', sheetRows: MAX_SHEET_ROWS, cellHTML: false, cellFormula: false });
  const sections: string[] = [];
  let characters = 0;
  let limited = workbook.SheetNames.length > 30;
  for (const name of workbook.SheetNames.slice(0, 30)) {
    const sheet = workbook.Sheets[name];
    if (!sheet?.['!ref']) continue;
    const range = xlsx.utils.decode_range(sheet['!ref']);
    if (sheet['!fullref'] || range.e.c - range.s.c >= MAX_SHEET_COLUMNS) limited = true;
    range.e.c = Math.min(range.e.c, range.s.c + MAX_SHEET_COLUMNS - 1);
    const rows = xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false, range })
      .map(row => row.map(cell => String(cell ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n').trim();
    sections.push(`[工作表 ${name}]\n${rows}`);
    characters += rows.length;
    if (characters > MAX_EXTRACTED_CHARS) { limited = true; break; }
  }
  return { text: sections.join('\n\n'), notes: limited ? '仅解析部分工作表、行或列。' : undefined };
}

const legacyWordBlockText = (block: MsDocBlock): string => {
  if (block.type === 'paragraph') return block.text;
  if (block.type === 'table') return block.rows.map(row => row.cells.map(cell => (
    (cell.blocks || cell.paragraphs).map(legacyWordBlockText).join(' ')
  )).join('\t')).join('\n');
  return '';
};

async function readPdf(bytes: Uint8Array): Promise<ChatFileContent> {
  const [pdf, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdf.GlobalWorkerOptions.workerSrc ||= workerUrl;
  const documentTask = pdf.getDocument({ data: bytes, useWasm: false, enableXfa: false });
  try {
    const doc = await documentTask.promise;
    const sections: string[] = [];
    const images: string[] = [];
    let imagePages = 0;
    let characters = 0;
    const limit = Math.min(doc.numPages, MAX_PDF_PAGES);
    let lastPage = 0;
    for (let index = 1; index <= limit; index += 1) {
      const page = await doc.getPage(index);
      lastPage = index;
      try {
        const content = await page.getTextContent();
        const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        if (text) {
          sections.push(`[第 ${index} 页]\n${text}`);
          characters += text.length;
        } else {
          imagePages += 1;
          if (images.length < MAX_PDF_PREVIEW_PAGES) {
            const base = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: 1_300 / Math.max(base.width, base.height) });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport }).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.8));
            sections.push(`[第 ${index} 页：见随文页面截图]`);
          }
        }
      } finally { page.cleanup(); }
      if (characters > MAX_EXTRACTED_CHARS) break;
    }
    const notes = [
      lastPage < doc.numPages ? `已解析第 1–${lastPage} 页，共 ${doc.numPages} 页。` : '',
      imagePages > images.length ? '部分无文本页未附带截图。' : '',
    ].filter(Boolean).join(' ');
    return { text: sections.join('\n\n'), images, notes };
  } finally { await documentTask.destroy(); }
}

export async function extractChatFileContent(bytes: Uint8Array, name: string): Promise<ChatFileContent> {
  assertChatLocalFileSize(bytes.byteLength, name);
  const extension = getChatLocalFileExtension(name);
  if (extension === 'pdf') return readPdf(bytes);
  if (['docx', 'pptx', 'odt', 'odp'].includes(extension)) return readOfficeXml(bytes, extension);
  if (['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'].includes(extension)) return readSpreadsheet(bytes);
  if (extension === 'doc' && bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    const { parseMsDoc } = await import('@file-viewer/doc');
    const doc = parseMsDoc(bytes, { maxPictureBytes: 0 });
    if (doc.meta.fib.fEncrypted) throw new Error('该 Word 文件已加密，请先解锁。');
    return { text: doc.blocks.map(legacyWordBlockText).filter(Boolean).join('\n') };
  }
  return { text: decodeChatText(bytes) };
}

export async function resolveChatFileContent(attachment: ChatAttachment): Promise<ChatFileContent> {
  const name = chatLocalAttachmentName(attachment);
  const content = await extractChatFileContent(await readChatLocalFile(attachment.path, name), name);
  if (!content.text.trim() && !content.images?.length) throw new Error('未提取到可读取的内容。');
  return content;
}

export function excerptChatFileText(text: string, limit: number, question = ''): string {
  if (text.length <= limit) return text;
  const terms = (question.match(/[A-Z\d_][A-Z\d_-]{3,}|[\u3400-\u9fff]{2,}/gi) || [])
    .filter(term => !/^(?:这个文件|这份文件|文件内容|帮我看看|能看到吗)$/.test(term))
    .sort((a, b) => b.length - a.length).slice(0, 8);
  const normalized = terms.length ? text.toLowerCase() : '';
  for (const term of terms) {
    const index = normalized.indexOf(term.toLowerCase());
    if (index <= limit || index >= text.length - limit) continue;
    const intro = '[文件较长，以下是与当前问题匹配的正文摘录]\n';
    const width = limit - intro.length;
    const start = Math.max(0, Math.min(text.length - width, index - Math.floor(width / 3)));
    return intro + text.slice(start, start + width);
  }
  const separator = '\n[… 文件较长，以下接文件末尾 …]\n';
  const start = Math.floor((limit - separator.length) * 0.75);
  return text.slice(0, start) + separator + text.slice(-(limit - start - separator.length));
}
