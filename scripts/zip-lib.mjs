import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
const UTF8_FLAG = 0x0800;
const METHOD_DEFLATE = 8;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function normalizedArchivePath(value) {
  const normalized = String(value).replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error(`Đường dẫn ZIP không an toàn: ${value}`);
  return normalized;
}

function localHeader(nameBytes, crc, compressedSize, sourceSize) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(UTF8_FLAG, 6); header.writeUInt16LE(METHOD_DEFLATE, 8);
  header.writeUInt16LE(DOS_TIME, 10); header.writeUInt16LE(DOS_DATE, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressedSize, 18); header.writeUInt32LE(sourceSize, 22);
  header.writeUInt16LE(nameBytes.length, 26); header.writeUInt16LE(0, 28); return header;
}

function centralHeader(nameBytes, crc, compressedSize, sourceSize, localOffset, mode) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE((3 << 8) | 30, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(UTF8_FLAG, 8); header.writeUInt16LE(METHOD_DEFLATE, 10);
  header.writeUInt16LE(DOS_TIME, 12); header.writeUInt16LE(DOS_DATE, 14); header.writeUInt32LE(crc, 16); header.writeUInt32LE(compressedSize, 20); header.writeUInt32LE(sourceSize, 24);
  header.writeUInt16LE(nameBytes.length, 28); header.writeUInt16LE(0, 30); header.writeUInt16LE(0, 32); header.writeUInt16LE(0, 34); header.writeUInt16LE(0, 36);
  header.writeUInt32LE(((mode & 0xffff) << 16) >>> 0, 38); header.writeUInt32LE(localOffset, 42); return header;
}

export function createDeterministicZip(entries) {
  const normalized = entries.map((entry) => ({ name: normalizedArchivePath(entry.name), data: Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data), mode: entry.mode ?? 0o100644 })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const seen = new Set(), localParts = [], centralParts = []; let localOffset = 0;
  for (const entry of normalized) {
    if (seen.has(entry.name)) throw new Error(`Entry ZIP bị trùng: ${entry.name}`); seen.add(entry.name);
    const nameBytes = Buffer.from(entry.name, 'utf8'), compressed = zlib.deflateRawSync(entry.data, { level: 9 }), checksum = crc32(entry.data), local = localHeader(nameBytes, checksum, compressed.length, entry.data.length);
    localParts.push(local, nameBytes, compressed); centralParts.push(centralHeader(nameBytes, checksum, compressed.length, entry.data.length, localOffset, entry.mode), nameBytes);
    localOffset += local.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(normalized.length, 8); end.writeUInt16LE(normalized.length, 10); end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(localOffset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function writeDeterministicZip(target, entries) {
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, createDeterministicZip(entries)); return target;
}
