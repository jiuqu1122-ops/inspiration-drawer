import { HTML_DESIGN_CAPTURE_SCRIPT } from './htmlDesignCapture';
import { MAX_CHAT_HTML_LENGTH } from './chatHtmlArtifacts';

// No same-origin permission, external scripts, fetch, frames, forms, plugins,
// workers or app/local asset protocols. The exported source is not rewritten.
export const CHAT_HTML_PREVIEW_SANDBOX = 'allow-scripts';
export const CHAT_HTML_PREVIEW_CSP = [
  "default-src 'none'", "script-src 'unsafe-inline'", "style-src 'unsafe-inline'",
  'img-src data: blob:', 'font-src data:', 'media-src data: blob:',
  "connect-src 'none'", "frame-src 'none'", "child-src 'none'", "worker-src 'none'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "manifest-src 'none'",
].join('; ');

export function buildChatHtmlPreviewDocument(source: string): string {
  if (source.length > MAX_CHAT_HTML_LENGTH) throw new Error('HTML 超过 2 MB，暂不加载预览。请精简内容。');
  // Put the policy before ANY model-controlled markup. Additional model CSPs
  // cannot relax it. Wrapping also supports fragments and complete documents.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CHAT_HTML_PREVIEW_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><script>
  document.addEventListener('click', function(event) {
    var link = event.target instanceof Element ? event.target.closest('a,area') : null;
    if (link && !(link.getAttribute('href') || '').startsWith('#')) event.preventDefault();
  }, true);
  document.addEventListener('submit', function(event) { event.preventDefault(); }, true);
  ${HTML_DESIGN_CAPTURE_SCRIPT}
  </script></head><body>${source}</body></html>`;
}
