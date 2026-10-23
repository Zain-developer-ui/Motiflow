import fs from 'node:fs';

const out = process.argv[2] ?? 'test-audio.wav';
const sampleRate = 44_100;
const duration = 12;
const channels = 2;
const frames = sampleRate * duration;
const dataBytes = frames * channels * 2;

const buf = Buffer.alloc(44 + dataBytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataBytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(channels, 22);
buf.writeUInt32LE(sampleRate, 24);
buf.writeUInt32LE(sampleRate * channels * 2, 28);
buf.writeUInt16LE(channels * 2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataBytes, 40);

for (let i = 0; i < frames; i++) {
  const t = i / sampleRate;
  const fadeIn = Math.min(1, t * 4);
  const fadeOut = Math.min(1, (duration - t) * 4);
  const env = Math.max(0, Math.min(fadeIn, fadeOut));
  const tone = Math.sin(2 * Math.PI * 440 * t) * 0.3 + Math.sin(2 * Math.PI * 660 * t) * 0.12;
  const value = Math.max(-1, Math.min(1, tone * env)) * 32_767;
  buf.writeInt16LE(value | 0, 44 + i * 4);
  buf.writeInt16LE(value | 0, 46 + i * 4);
}

fs.writeFileSync(out, buf);
console.log(`${out}: ${buf.length} bytes, ${duration}s @ ${sampleRate}Hz ${channels}ch`);
