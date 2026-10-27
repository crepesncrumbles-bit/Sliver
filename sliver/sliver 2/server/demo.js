// Demo songs: synthesized 30-second tunes so the game works with no internet.
// Each "song" is a seeded melody + bass line rendered to a WAV buffer.

const SAMPLE_RATE = 44100;
const CLIP_SECONDS = 30;

const DEMO_TRACKS = [
  ['Neon Harbor', 'The Midnight Ferries'],
  ['Paper Satellites', 'Juniper Vale'],
  ['Copper Sunrise', 'Low Tide Club'],
  ['Velvet Static', 'Marlowe & The Echoes'],
  ['Glass Highway', 'Northbound Kites'],
  ['Lemon Grove', 'Sundial Sisters'],
  ['Cassette Heart', 'Polaroid Youth'],
  ['Thunder in July', 'Red Clay Choir'],
  ['Slow Orbit', 'Moonlit Arcade'],
  ['Brickyard Waltz', 'The Lantern Hours'],
  ['Saltwater Radio', 'Coastline Ghosts'],
  ['Golden Hour Drive', 'Avenue Nine'],
];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map();

function renderDemoWav(index) {
  if (cache.has(index)) return cache.get(index);
  const rand = mulberry32(index * 7919 + 13);
  const scales = [
    [0, 2, 4, 5, 7, 9, 11], // major
    [0, 2, 3, 5, 7, 8, 10], // minor
    [0, 2, 4, 7, 9],        // pentatonic
    [0, 3, 5, 6, 7, 10],    // blues
  ];
  const scale = scales[index % scales.length];
  const root = 57 + Math.floor(rand() * 8); // MIDI root
  const bpm = 88 + Math.floor(rand() * 48);
  const step = 60 / bpm / 2; // eighth notes
  const timbre = index % 3; // 0 soft sine, 1 warm, 2 hollow

  const motif = Array.from({ length: 16 }, () =>
    rand() < 0.2 ? null : scale[Math.floor(rand() * scale.length)] + 12 * Math.floor(rand() * 2)
  );
  const chords = [0, 5, 3, 4].map((d) => scale[d % scale.length]);
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const TAU = 2 * Math.PI;

  const n = SAMPLE_RATE * CLIP_SECONDS;
  const mix = new Float32Array(n);

  // Melody: each note is rendered separately with its own attack/release, so there are no clicks.
  const notes = Math.floor(CLIP_SECONDS / step);
  for (let k = 0; k < notes; k++) {
    const section = Math.floor(k / 32) % 4;
    const note = motif[(k + (section === 2 ? 4 : 0)) % 16];
    if (note === null) continue;
    const f = freq(root + note + (section === 3 ? 2 : 0));
    const start = Math.floor(k * step * SAMPLE_RATE);
    const len = Math.floor(step * 0.92 * SAMPLE_RATE); // notes end before the next one starts (dry, no wash)
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const attack = Math.min(1, t / 0.008);
      const release = Math.min(1, (len - i) / (0.04 * SAMPLE_RATE));
      const env = attack * release * Math.exp(-t * 2.5);
      let v;
      if (timbre === 0) v = Math.sin(TAU * f * t);
      else if (timbre === 1) v = Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) + 0.12 * Math.sin(TAU * 3 * f * t);
      else v = Math.sin(TAU * f * t) + 0.18 * Math.sin(TAU * 3 * f * t) + 0.07 * Math.sin(TAU * 5 * f * t); // hollow, clarinet-ish
      mix[start + i] += 0.28 * env * v;
    }
  }

  // Pad chords (soft, sustained) + bass on each bar, with smooth crossfades between bars.
  const bar = step * 8;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const b = Math.floor(t / bar);
    const inBar = t - b * bar;
    const fade = Math.min(1, inBar / 0.05, (bar - inBar) / 0.05);
    const c = chords[b % 4];
    const fr = freq(root - 12 + c);
    mix[i] += 0.035 * fade * (Math.sin(TAU * fr * t) + 0.6 * Math.sin(TAU * fr * 1.5 * t)); // quiet, simple pad
    const beatT = t % (step * 2);
    const bassEnv = Math.min(1, beatT / 0.005, (step * 2 - beatT) / 0.015) * Math.exp(-beatT * 4) * fade;
    mix[i] += 0.22 * bassEnv * Math.sin(TAU * freq(root - 24 + c) * t);
    // soft kick on each beat
    mix[i] += 0.35 * Math.exp(-beatT * 25) * Math.min(1, beatT / 0.002) * Math.sin(TAU * (50 + 70 * Math.exp(-beatT * 35)) * beatT);
  }

  // Normalize to -1 dBFS peak: loud enough, never clips.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mix[i]));
  const gain = 0.89 / (peak || 1);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(mix[i] * gain * 32767);

  const dataBytes = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24); buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  cache.set(index, buf);
  return buf;
}

function demoTracks() {
  return DEMO_TRACKS.map(([title, artist], i) => ({
    source: 'demo',
    sourceId: String(i),
    title,
    artist,
    cover: null,
    link: null,
  }));
}

module.exports = { demoTracks, renderDemoWav };
