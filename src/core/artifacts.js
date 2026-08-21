import { FILE_EXTENSIONS } from './constants.js';

const EXT_RE = new RegExp(`\\.(${FILE_EXTENSIONS.map((x) => x.replace('.', '\\.')).join('|')})(?:$|[?#\\s)])`, 'i');
const GITHUB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(commit|pull|tree|blob)\/([^/?#]+))?/i;

function decodeSafe(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function filenameFromCandidate(candidate = {}) {
  const explicit = String(candidate.download || candidate.filename || '').trim();
  if (explicit) return explicit.split(/[\\/]/).filter(Boolean).pop() || explicit;
  const href = String(candidate.href || '').trim();
  if (href) {
    try {
      const url = new URL(href, 'https://chatgpt.com/');
      const tail = decodeSafe(url.pathname.split('/').filter(Boolean).pop() || '');
      if (tail && EXT_RE.test(tail)) return tail;
    } catch {}
  }
  const text = String(candidate.text || '').trim();
  const match = text.match(/([^\\/\n\r\t<>:"|?*]{1,180}\.[A-Za-z0-9]{1,8})(?:\s|$)/);
  return match?.[1]?.trim() || '';
}

export function classifyArtifactCandidate(candidate = {}) {
  const href = String(candidate.href || '').trim();
  if (href) {
    const github = href.match(GITHUB_RE);
    if (github) {
      return {
        kind: 'github', href, name: `${github[1]}/${github[2]}`,
        github: { owner: github[1], repo: github[2].replace(/\.git$/i, ''), resource: github[3] || 'repo', ref: github[4] || null },
        downloadable: false, confidence: 0.99
      };
    }
  }
  const name = filenameFromCandidate(candidate);
  const extension = name.match(EXT_RE)?.[1]?.toLowerCase() || '';
  const mime = String(candidate.mime || candidate.type || '').toLowerCase().split(';', 1)[0].trim();
  const fileLikeMime = Boolean(mime) && (
    mime.startsWith('image/')
    || mime.startsWith('audio/')
    || mime.startsWith('video/')
    || mime === 'application/pdf'
    || mime === 'application/zip'
    || mime === 'application/gzip'
    || mime === 'application/x-7z-compressed'
    || mime === 'application/vnd.rar'
    || mime === 'application/x-rar-compressed'
    || mime === 'application/x-tar'
    || mime === 'application/octet-stream'
    || mime === 'application/msword'
    || mime.startsWith('application/vnd.ms-')
    || mime.startsWith('application/vnd.openxmlformats-officedocument.')
    || mime === 'text/csv'
    || mime === 'text/tab-separated-values'
  );
  if (!extension && !candidate.download && !fileLikeMime) return null;
  const archive = ['zip','7z','rar','tar','gz','tgz','bz2','xz'].includes(extension);
  const family = archive ? 'archive'
    : ['pdf','doc','docx','xls','xlsx','ppt','pptx','csv','tsv'].includes(extension) ? 'document'
    : ['png','jpg','jpeg','gif','webp','svg','avif','mp3','wav','mp4','webm'].includes(extension) ? 'media'
    : ['js','mjs','cjs','ts','tsx','jsx','py','rs','go','java','kt','swift','c','h','cpp','hpp','cs','sh','ps1','html','css','json','jsonl','yaml','yml','xml','md','txt','log'].includes(extension) ? 'source'
    : 'binary';
  return {
    kind: 'file', family, name: name || candidate.label || 'Tệp ChatGPT', href: href || null,
    mime: mime || null, extension: extension || null,
    downloadable: Boolean(href || candidate.clickable),
    confidence: href && (extension || candidate.download) ? 0.98 : extension ? 0.88 : 0.72,
    source: candidate.source || 'dom'
  };
}

export function mergeArtifacts(...groups) {
  const map = new Map();
  for (const group of groups) for (const item of group || []) {
    if (!item) continue;
    const key = item.kind === 'github' ? `github:${item.href}` : `file:${item.href || ''}:${item.name || ''}`.toLowerCase();
    const prior = map.get(key);
    if (!prior || (item.confidence || 0) > (prior.confidence || 0)) map.set(key, { ...prior, ...item });
  }
  return [...map.values()];
}
