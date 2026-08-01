import os from 'node:os';

const LATENCY_MAX = 48;
const latencySamples = new Float64Array(LATENCY_MAX);
let latencyLen = 0;
let latencyIdx = 0;
let latencySum = 0;

let prevIdle = 0;
let prevTotal = 0;
let prevCpuAt = 0;
let cachedCpu = 0;

export function sampleCpuPercent() {
  const now = Date.now();
  if (now - prevCpuAt < 2000 && prevCpuAt) return cachedCpu;
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (let i = 0; i < cpus.length; i++) {
    const t = cpus[i].times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  if (prevTotal > 0) {
    const di = idle - prevIdle;
    const dt = total - prevTotal;
    if (dt > 0) cachedCpu = Math.max(0, Math.min(100, Math.round((100 - (100 * di) / dt) * 10) / 10));
  }
  prevIdle = idle;
  prevTotal = total;
  prevCpuAt = now;
  return cachedCpu;
}

export function recordApiLatency(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0 || n > 60000) return;
  if (latencyLen === LATENCY_MAX) {
    latencySum -= latencySamples[latencyIdx];
  } else {
    latencyLen++;
  }
  latencySamples[latencyIdx] = n;
  latencySum += n;
  latencyIdx = (latencyIdx + 1) % LATENCY_MAX;
}

export function getApiLatencyStats() {
  if (!latencyLen) {
    return { samples: 0, avgMs: null, p50Ms: null, p95Ms: null, lastMs: null };
  }
  const copy = [];
  const start = latencyLen === LATENCY_MAX ? latencyIdx : 0;
  for (let i = 0; i < latencyLen; i++) {
    copy.push(latencySamples[(start + i) % LATENCY_MAX]);
  }
  copy.sort((a, b) => a - b);
  const last = latencySamples[(latencyIdx + LATENCY_MAX - 1) % LATENCY_MAX];
  return {
    samples: latencyLen,
    avgMs: Math.round(latencySum / latencyLen),
    p50Ms: Math.round(copy[Math.min(copy.length - 1, Math.floor(copy.length * 0.5))]),
    p95Ms: Math.round(copy[Math.min(copy.length - 1, Math.floor(copy.length * 0.95))]),
    lastMs: Math.round(last),
  };
}

export function getMemoryStats() {
  const mem = process.memoryUsage();
  const total = os.totalmem();
  const free = os.freemem();
  return {
    heapUsedMb: Math.round(mem.heapUsed / 1048576),
    rssMb: Math.round(mem.rss / 1048576),
    systemUsedPct: Math.round(((total - free) / total) * 100),
  };
}
