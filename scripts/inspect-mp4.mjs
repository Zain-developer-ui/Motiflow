import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node inspect-mp4.mjs <file.mp4>');
  process.exit(1);
}

const buf = fs.readFileSync(file);
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'mvex', 'udta']);

function parse(offset, end) {
  const nodes = [];
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(offset + 8));
      header = 16;
    }
    if (size < header || offset + size > end) break;
    const node = { type, offset, size, header, children: [] };
    if (CONTAINERS.has(type)) node.children = parse(offset + header, offset + size);
    nodes.push(node);
    offset += size;
  }
  return nodes;
}

function find(node, type) {
  if (node.type === type) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, type);
    if (hit) return hit;
  }
  return null;
}

const tree = parse(0, buf.length);
const top = tree.map((n) => `${n.type}(${n.size})`).join(' ');

const moov = tree.find((n) => n.type === 'moov');
const mvhd = moov ? find(moov, 'mvhd') : null;
const traks = [];
if (moov) {
  const collect = (node) => {
    if (node.type === 'trak') traks.push(node);
    for (const child of node.children ?? []) collect(child);
  };
  collect(moov);
}

console.log('boxes:', top);
console.log('tracks:', traks.length);

if (mvhd) {
  const version = buf[mvhd.offset + mvhd.header];
  const timescale = buf.readUInt32BE(mvhd.offset + mvhd.header + (version === 1 ? 20 : 12));
  const duration =
    version === 1
      ? Number(buf.readBigUInt64BE(mvhd.offset + mvhd.header + 24))
      : buf.readUInt32BE(mvhd.offset + mvhd.header + 16);
  console.log(`duration: ${(duration / timescale).toFixed(2)}s (timescale ${timescale})`);
}

for (const [i, trak] of traks.entries()) {
  const hdlr = find(trak, 'hdlr');
  const handler = hdlr ? buf.toString('ascii', hdlr.offset + hdlr.header + 8, hdlr.offset + hdlr.header + 12) : '?';
  const stsz = find(trak, 'stsz');
  const stsd = find(trak, 'stsd');
  const stss = find(trak, 'stss');
  const mdhd = find(trak, 'mdhd');

  let samples = 0;
  let bytes = 0;
  if (stsz) {
    const sampleSize = buf.readUInt32BE(stsz.offset + stsz.header + 4);
    samples = buf.readUInt32BE(stsz.offset + stsz.header + 8);
    if (sampleSize === 0) {
      for (let s = 0; s < samples; s++) bytes += buf.readUInt32BE(stsz.offset + stsz.header + 12 + s * 4);
    } else {
      bytes = sampleSize * samples;
    }
  }

  let entry = '?';
  if (stsd) entry = buf.toString('ascii', stsd.offset + stsd.header + 12, stsd.offset + stsd.header + 16);

  let trackSeconds = 0;
  if (mdhd) {
    const version = buf[mdhd.offset + mdhd.header];
    const ts = buf.readUInt32BE(mdhd.offset + mdhd.header + (version === 1 ? 20 : 12));
    const dur =
      version === 1
        ? Number(buf.readBigUInt64BE(mdhd.offset + mdhd.header + 24))
        : buf.readUInt32BE(mdhd.offset + mdhd.header + 16);
    trackSeconds = dur / ts;
  }

  const sync = stss ? buf.readUInt32BE(stss.offset + stss.header + 4) : samples;
  console.log(
    `track ${i}: handler=${handler} entry=${entry} samples=${samples} bytes=${bytes} ` +
      `duration=${trackSeconds.toFixed(2)}s sync=${sync}`,
  );
}

console.log(`file: ${buf.length} bytes`);
