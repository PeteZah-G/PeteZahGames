
import { exec } from 'child_process';
import { EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import process from 'process';
import { promisify } from 'util';
import { sampleCpuPercent } from '../utils/runtime-metrics.js';

const execAsync = promisify(exec);

let getXDPBlockCount = () => 0;
let getXDPStats = async () => 'XDP stats unavailable';

try {
  const xdpModule = await import('./xdp-integration.js');
  getXDPBlockCount = xdpModule.getXDPBlockCount;
  getXDPStats = xdpModule.getXDPStats;
} catch (err) {
  console.log('[SHIELD] XDP integration not available:', err.message);
}

dotenv.config({ path: '.env.production' });

const OWNER_ID = '1311722282317779097';
const HARDCODED_CHANNEL_ID = '1457434974234869855';
const ALERT_COOLDOWN = 600000;
const ATTACK_END_TIMEOUT = 300000;
const WINDOW_SIZE = 10000;
const CPU_THRESHOLD = 75;
const MEMORY_THRESHOLD = 1024 * 1024 * 1024 * 8;
const MEMORY_CRITICAL = 1024 * 1024 * 1024 * 2;
const RSS_CRITICAL = 1024 * 1024 * 1024 * 12;
const RSS_SPIKE_MIN = 1024 * 1024 * 1024;
const PATTERN_DETECTION_WINDOW = 30000;
const ATTACK_PATTERN_THRESHOLD = 50;
const RESTART_HOUR_ET = 0;
const NOON_HOUR_ET = 12;
const GB = 1024 * 1024 * 1024;
const RESTART_MARKER = path.join(tmpdir(), 'petezah-daily-restart.day');

class DDoSShield {
  constructor(client) {
    this.client = client;
    this.logChannelId = HARDCODED_CHANNEL_ID;
    this.isUnderAttack = false;
    this.attackStartTime = null;
    this.mitigatedCount = 0;
    this.lastAlertTime = 0;
    this.lastBlockTime = 0;
    this.attackEndTimer = null;
    this.startupGracePeriod = true;
    this.killSwitchActive = false;
    this.forceAttackMode = false;
    this.lastRestartDay = '';
    this.lastNoonDay = '';
    try {
      if (existsSync(RESTART_MARKER)) {
        this.lastRestartDay = readFileSync(RESTART_MARKER, 'utf8').trim();
      }
    } catch {}
    this.scheduleDailyRestart();
    this.scheduleDailyStatus();
    setTimeout(() => {
      this.startupGracePeriod = false;
    }, 600000);

    this.MAX_IP_TRACKING = 50;
    this.MAX_BLOCKS_PER_IP = 20;
    this.MAX_RECENT_BLOCKS = 50;
    this.MAX_ATTACK_PATTERNS = 50;
    this.MAX_CHALLENGE_HITS = 20;
    this.MAX_WS_HISTORY = 5;

    this.ipBlocks = new Map();
    this.blockTypes = new Map();
    this.challengeHits = new Map();
    this.ipRequests = new Map();
    this.recentBlocks = [];
    this.attackPatterns = new Map();
    this.memoryStats = { heapUsed: 0, rss: 0, active: false, timestamp: 0 };
    this.wsFlushHistory = [];
    this.autoMitigationActive = false;
    this.attackVector = null;
    this.mitigationActions = [];
    this.trustedFingerprints = new Set();
    this.lastRSS = 0;
    this.rssSeeded = false;
    this.logChannelCache = null;
    this.alertCooldowns = new Map();
    this.critStreak = 0;
    this.cpuHighStreak = 0;

    this.cleanupInterval = setInterval(() => this.cleanupOldEntries(), 60000);
    this.memoryMonitorInterval = setInterval(() => this.monitorMemory(), 45000);
    this.patternDetectionInterval = setInterval(() => this.detectAttackPatterns(), 60000);
    this.aggressiveCleanupInterval = setInterval(() => this.aggressiveCleanup(), 90000);
    for (const t of [
      this.cleanupInterval,
      this.memoryMonitorInterval,
      this.patternDetectionInterval,
      this.aggressiveCleanupInterval,
    ]) {
      if (t?.unref) t.unref();
    }
  }

  setLogChannel(channelId) {
    this.logChannelId = channelId;
    this.logChannelCache = null;
  }

  async sendLog(content, embed = null, cooldownKey = null, cooldownMs = 0) {
    if (!this.logChannelId) return;
    if (cooldownKey && cooldownMs > 0) {
      const now = Date.now();
      const last = this.alertCooldowns.get(cooldownKey) || 0;
      if (now - last < cooldownMs) return;
      this.alertCooldowns.set(cooldownKey, now);
      if (this.alertCooldowns.size > 40) {
        for (const [k, t] of this.alertCooldowns) {
          if (now - t > 3600000) this.alertCooldowns.delete(k);
        }
      }
    }
    try {
      let channel = this.logChannelCache;
      if (!channel || channel.id !== this.logChannelId) {
        channel =
          this.client.channels.cache.get(this.logChannelId) ||
          (await this.client.channels.fetch(this.logChannelId));
        this.logChannelCache = channel || null;
      }
      if (channel) channel.send({ content, embeds: embed ? [embed] : [] });
    } catch (err) {
      this.logChannelCache = null;
      console.error('Failed to send DDoS log:', err.message);
    }
  }

  getCpuUsage() {
    return sampleCpuPercent();
  }

  entropy(str) {
    if (!str || str.length === 0) return 0;
    const freq = {};
    for (let char of str) freq[char] = (freq[char] || 0) + 1;
    return -Object.values(freq).reduce((sum, f) => {
      const p = f / str.length;
      return sum + p * Math.log2(p);
    }, 0);
  }

  getRequestVelocity(ip, fingerprint) {
    const ipData = this.ipRequests.get(ip);
    if (!ipData) return 0;
    return ipData.burstCount || 0;
  }

  isKnownGoodBot(ua, ip) {
    const goodBots = [/googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i, /baiduspider/i, /yandexbot/i];
    return goodBots.some((pattern) => pattern.test(ua));
  }

  calculateRiskScore(ip, fingerprint, reqContext = {}) {
    let score = 0;

    score += this.getRecentBlocks(ip, 10000) * 4;
    score += (this.challengeHits.get(fingerprint)?.length || 0) * 2;

    const blockRate = this.getRecentBlockRate();
    const { totalHits } = this.getChallengeSpike();
    const blockRatio = totalHits > 0 ? blockRate / totalHits : 0;
    score += blockRatio > 0.4 ? 25 : blockRatio > 0.25 ? 12 : 0;

    const req = reqContext.req || {};
    const ua = req.headers?.['user-agent'] || '';
    const uaEntropy = this.entropy(ua);
    score += uaEntropy < 2.5 ? 18 : 0;

    const velocity = this.getRequestVelocity(ip, fingerprint);
    score += velocity > 15 ? 20 : velocity > 8 ? 10 : 0;

    if (this.isKnownGoodBot(ua, ip)) score -= 30;
    if (this.trustedFingerprints?.has(fingerprint)) score -= 45;

    if (this.memoryStats.active) score *= 1.6;

    return Math.min(100, Math.max(0, score));
  }

  incrementBlocked(ip, type = 'unknown') {
    this.mitigatedCount++;
    this.lastBlockTime = Date.now();

    const now = Date.now();
    const ipData = this.ipBlocks.get(ip) || { blocks: [], types: {} };
    ipData.blocks.push(now);
    ipData.types[type] = (ipData.types[type] || 0) + 1;

    let writeIdx = 0;
    for (let i = 0; i < ipData.blocks.length; i++) {
      if (now - ipData.blocks[i] < 60000) {
        ipData.blocks[writeIdx++] = ipData.blocks[i];
      }
    }
    ipData.blocks.length = Math.min(writeIdx, this.MAX_BLOCKS_PER_IP);

    this.ipBlocks.set(ip, ipData);

    this.blockTypes.set(type, (this.blockTypes.get(type) || 0) + 1);

    this.recentBlocks.push(now);
    if (this.recentBlocks.length > this.MAX_RECENT_BLOCKS) {
      this.recentBlocks.length = this.MAX_RECENT_BLOCKS;
    }

    this.checkAttackConditions(ip);

    if (this.isUnderAttack && this.attackEndTimer) {
      clearTimeout(this.attackEndTimer);
      this.attackEndTimer = setTimeout(() => this.endAttackAlert(), ATTACK_END_TIMEOUT);
    }
  }

  trackChallengeHit(ip) {
    const now = Date.now();
    const hits = this.challengeHits.get(ip) || [];
    hits.push(now);

    let writeIdx = 0;
    for (let i = 0; i < hits.length; i++) {
      if (now - hits[i] < 30000) {
        hits[writeIdx++] = hits[i];
      }
    }
    hits.length = Math.min(writeIdx, this.MAX_WS_HISTORY);

    this.challengeHits.set(ip, hits);
  }

  getRecentBlocks(ip, windowMs = WINDOW_SIZE) {
    const ipData = this.ipBlocks.get(ip);
    if (!ipData) return 0;
    const now = Date.now();
    let count = 0;
    for (let i = 0; i < ipData.blocks.length; i++) {
      if (now - ipData.blocks[i] < windowMs) count++;
    }
    return count;
  }

  getRecentBlockRate() {
    const now = Date.now();
    let count = 0;
    for (let i = 0; i < this.recentBlocks.length; i++) {
      if (now - this.recentBlocks[i] < 60000) count++;
    }
    return count;
  }

  getTotalBlocks(ip) {
    const ipData = this.ipBlocks.get(ip);
    return ipData ? ipData.blocks.length : 0;
  }

  getTopAbusers(limit = 5) {
    const abusers = [];
    for (const [ip, data] of this.ipBlocks.entries()) {
      const count = data.blocks.length;
      if (count > 0) {
        const topType = Object.entries(data.types).sort((a, b) => b[1] - a[1])[0];
        abusers.push({ ip, count, primaryType: topType ? topType[0] : 'unknown' });
      }
    }
    return abusers.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  getChallengeSpike() {
    const now = Date.now();
    let totalHits = 0;
    let uniqueIps = 0;

    for (const [ip, hits] of this.challengeHits.entries()) {
      let recentCount = 0;
      for (let i = 0; i < hits.length; i++) {
        if (now - hits[i] < 30000) recentCount++;
      }
      if (recentCount > 0) {
        totalHits += recentCount;
        uniqueIps++;
      }
    }

    return { totalHits, uniqueIps };
  }

  checkAttackConditions(ip, systemState = null) {
    if (this.isUnderAttack || this.startupGracePeriod) return;
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return;

    const now = Date.now();
    if (now - this.lastAlertTime < ALERT_COOLDOWN) return;

    if (this.forceAttackMode) {
      if (!this.isUnderAttack) {
        this.lastAlertTime = now;
        this.startAttackAlert(systemState);
      }
      return;
    }

    if (!systemState || systemState.state === 'BUSY' || systemState.state === 'NORMAL') return;
    const blockRate = this.getRecentBlockRate();
    const cpuUsage = this.getCpuUsage();
    const { uniqueIps, totalHits } = this.getChallengeSpike();

    const baselineCpu = systemState.baselineCpu || 30;
    const baselineBlockRate = systemState.baselineBlockRate || 5;
    const baselineUniqueIps = systemState.baselineUniqueIps || 50;

    const cpuSpike = cpuUsage > baselineCpu * 1.2;
    const blockRateSpike = blockRate > baselineBlockRate * 3;
    const ipChurn = uniqueIps > baselineUniqueIps * 2;

    const blockRatio = totalHits > 0 ? blockRate / totalHits : 0;
    const powSolveRatio = totalHits > 0 ? (totalHits - blockRate) / totalHits : 1;

    const blockRatioHigh = blockRatio > 0.3;
    const powSolveLow = powSolveRatio < 0.3;

    const isAttack =
      (cpuSpike && blockRatioHigh) ||
      (ipChurn && blockRateSpike && blockRatioHigh) ||
      (blockRateSpike && powSolveLow && blockRatioHigh) ||
      blockRatio > 0.5;

    if (isAttack && systemState.state !== 'ATTACK') {
      this.lastAlertTime = now;
      this.startAttackAlert(systemState);
    }
  }

  async startAttackAlert(systemState = null) {
    if (this.isUnderAttack) return;

    this.isUnderAttack = true;
    this.attackStartTime = Date.now();
    this.mitigationActions = [];

    const topAbusers = this.getTopAbusers(5);
    const cpuUsage = this.getCpuUsage().toFixed(1);
    const mem = process.memoryUsage();
    const memUsage = (mem.heapUsed / 1024 / 1024 / 1024).toFixed(2);

    const blockTypesSummary =
      Array.from(this.blockTypes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => `${type}: ${count}`)
        .join('\n') || 'N/A';

    const attackPatterns =
      Array.from(this.attackPatterns.entries())
        .slice(0, 3)
        .map(([key, pattern]) => `${pattern.type}: ${pattern.count} from ${pattern.ips.length} IPs`)
        .join('\n') || 'None detected';

    const systemStatus = systemState
      ? `CPU: ${cpuUsage}%\nMemory: ${memUsage}GB\nConnections: ${systemState.activeConnections}\nWS: ${systemState.totalWS}\nTotal Blocks: ${this.mitigatedCount}`
      : `CPU: ${cpuUsage}%\nMemory: ${memUsage}GB\nTotal Blocks: ${this.mitigatedCount}`;

    const embed = new EmbedBuilder()
      .setTitle('DDoS attack detected')
      .setDescription('High volume of malicious traffic identified.\nStarting automated mitigation...')
      .addFields(
        { name: 'Top Abusers', value: topAbusers.map((a) => `${a.ip} — ${a.count} blocks (${a.primaryType})`).join('\n') || 'N/A', inline: false },
        { name: 'Block Reasons', value: blockTypesSummary, inline: true },
        { name: 'System Status', value: systemStatus, inline: true },
        { name: 'Attack Patterns', value: attackPatterns, inline: false }
      )
      .setColor('#ff0000')
      .setTimestamp();

    await this.sendLog(null, embed);

    this.attackEndTimer = setTimeout(() => this.endAttackAlert(), ATTACK_END_TIMEOUT);
  }

  async endAttackAlert() {
    if (!this.isUnderAttack) return;

    this.isUnderAttack = false;
    this.autoMitigationActive = false;
    this.attackVector = null;
    if (this.attackEndTimer) {
      clearTimeout(this.attackEndTimer);
      this.attackEndTimer = null;
    }

    const duration = Math.floor((Date.now() - this.attackStartTime) / 1000);
    const topAbusers = this.getTopAbusers(5);
    const mem = process.memoryUsage();
    const memUsage = (mem.heapUsed / 1024 / 1024 / 1024).toFixed(2);

    const mitigationSummary = this.mitigationActions.length > 0 ? this.mitigationActions.join(', ') : 'Standard protections';

    const embed = new EmbedBuilder()
      .setTitle('Attack mitigated')
      .setDescription(
        `DDoS attack neutralized after ${duration} seconds.\nTotal requests blocked: **${this.mitigatedCount.toLocaleString()}**\nMitigation actions: ${mitigationSummary}`
      )
      .addFields(
        { name: 'Top Attackers', value: topAbusers.map((a) => `${a.ip} — ${a.count} blocks`).join('\n') || 'N/A' },
        { name: 'Memory Status', value: `${memUsage}GB heap used`, inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await this.sendLog(null, embed);

    this.mitigationActions = [];
  }

  cleanupOldEntries() {
    const now = Date.now();

    for (const [ip, data] of this.ipBlocks.entries()) {
      let writeIdx = 0;
      for (let i = 0; i < data.blocks.length; i++) {
        if (now - data.blocks[i] < 60000) {
          data.blocks[writeIdx++] = data.blocks[i];
        }
      }
      data.blocks.length = writeIdx;

      if (data.blocks.length === 0) {
        this.ipBlocks.delete(ip);
      }
    }

    for (const [ip, hits] of this.challengeHits.entries()) {
      let writeIdx = 0;
      for (let i = 0; i < hits.length; i++) {
        if (now - hits[i] < 30000) {
          hits[writeIdx++] = hits[i];
        }
      }
      hits.length = writeIdx;

      if (hits.length === 0) {
        this.challengeHits.delete(ip);
      }
    }

    for (const [ip, data] of this.ipRequests.entries()) {
      if (now - data.lastSeen > 60000) {
        this.ipRequests.delete(ip);
      }
    }

    let writeIdx = 0;
    for (let i = 0; i < this.recentBlocks.length; i++) {
      if (now - this.recentBlocks[i] < 60000) {
        this.recentBlocks[writeIdx++] = this.recentBlocks[i];
      }
    }
    this.recentBlocks.length = writeIdx;

    if (this.wsFlushHistory.length > 100) {
      this.wsFlushHistory.length = 50;
    }

    if (this.ipBlocks.size > this.MAX_IP_TRACKING) {
      const entries = Array.from(this.ipBlocks.entries());
      entries.sort((a, b) => {
        const aRecent = a[1].blocks.filter((t) => now - t < 30000).length;
        const bRecent = b[1].blocks.filter((t) => now - t < 30000).length;
        return aRecent - bRecent;
      });
      const toRemove = entries.slice(0, Math.floor(this.MAX_IP_TRACKING * 0.3));
      toRemove.forEach(([ip]) => this.ipBlocks.delete(ip));
    }

    if (this.challengeHits.size > this.MAX_CHALLENGE_HITS) {
      const entries = Array.from(this.challengeHits.entries());
      entries.sort((a, b) => a[1].length - b[1].length);
      const toRemove = entries.slice(0, Math.floor(this.MAX_CHALLENGE_HITS * 0.3));
      toRemove.forEach(([ip]) => this.challengeHits.delete(ip));
    }

    if (this.ipRequests.size > this.MAX_IP_TRACKING) {
      const entries = Array.from(this.ipRequests.entries());
      entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
      const toRemove = entries.slice(0, Math.floor(this.MAX_IP_TRACKING * 0.3));
      toRemove.forEach(([ip]) => this.ipRequests.delete(ip));
    }
  }

  aggressiveCleanup() {
    const now = Date.now();

    if (this.blockTypes.size > 50) {
      const entries = Array.from(this.blockTypes.entries()).sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, Math.floor(entries.length * 0.5));
      toRemove.forEach(([type]) => this.blockTypes.delete(type));
    }

    if (this.attackPatterns.size > this.MAX_ATTACK_PATTERNS) {
      const entries = Array.from(this.attackPatterns.entries());
      entries.sort((a, b) => a[1].detected - b[1].detected);
      const toRemove = entries.slice(0, Math.floor(this.MAX_ATTACK_PATTERNS * 0.3));
      toRemove.forEach(([key]) => this.attackPatterns.delete(key));
    }

    this.attackPatterns.forEach((pattern, key) => {
      if (now - pattern.detected > 300000) {
        this.attackPatterns.delete(key);
      }
    });
  }

  trackRequest(ip) {
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return;

    const now = Date.now();
    const data = this.ipRequests.get(ip) || { count: 0, lastSeen: now, blocks: 0, firstSeen: now, burstCount: 0, lastBurst: now };
    data.count++;
    data.lastSeen = now;

    if (now - data.lastBurst < 1000) {
      data.burstCount++;
      if (data.burstCount > 100) {
        this.incrementBlocked(ip, 'burst_attack');
        data.burstCount = 0;
      }
    } else {
      data.burstCount = 1;
      data.lastBurst = now;
    }

    this.ipRequests.set(ip, data);

    const timeWindow = now - data.firstSeen;
    const rate = timeWindow > 0 ? data.count / (timeWindow / 1000) : 0;

    if (data.count > 50000 || rate > 10000) {
      this.incrementBlocked(ip, 'request_flood');
    }
  }

  trackWS(ip, delta) {
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return;

    const existing = this.ipRequests.get(ip);
    const current = existing?.ws || 0;
    const updated = Math.max(0, current + delta);

    const data = existing || { count: 0, lastSeen: Date.now(), ws: 0 };
    data.ws = updated;
    data.lastSeen = Date.now();

    this.ipRequests.set(ip, data);

    if (delta < 0) return;

    const cpuUsage = this.getCpuUsage();
    const mem = process.memoryUsage();

    if (updated > 500 && (cpuUsage > CPU_THRESHOLD || mem.heapUsed > MEMORY_CRITICAL)) {
      this.incrementBlocked(ip, 'ws_flood');
    }
  }

  monitorMemory() {
    const mem = process.memoryUsage();
    const heapUsed = mem.heapUsed;
    const rss = mem.rss;
    const cpu = this.getCpuUsage();
    const active =
      heapUsed > MEMORY_CRITICAL * 0.75 ||
      rss > MEMORY_THRESHOLD ||
      cpu >= 90;

    const previousActive = this.memoryStats.active;
    this.memoryStats = { heapUsed, rss, active, timestamp: Date.now(), cpu };

    if (!this.rssSeeded) {
      this.lastRSS = rss;
      this.rssSeeded = true;
      return;
    }

    if (this.startupGracePeriod) {
      this.lastRSS = rss;
      return;
    }

    if (active && !previousActive) {
      this.sendLog(
        `Memory pressure\nCPU ${cpu.toFixed(1)}% | heap ${(heapUsed / GB).toFixed(2)}GB | RSS ${(rss / GB).toFixed(2)}GB`,
        null,
        'mem_pressure',
        900000
      );
    }

    const delta = rss - this.lastRSS;
    this.lastRSS = rss;

    if (delta > RSS_SPIKE_MIN && !active) {
      this.sendLog(
        `RSS spike +${(delta / 1024 / 1024).toFixed(0)}MB\nCPU ${cpu.toFixed(1)}% | heap ${(heapUsed / GB).toFixed(2)}GB | RSS ${(rss / GB).toFixed(2)}GB`,
        null,
        'rss_spike',
        900000
      );
    }

    const critical =
      heapUsed > MEMORY_CRITICAL ||
      rss > RSS_CRITICAL ||
      cpu >= 95;
    if (critical) this.critStreak += 1;
    else this.critStreak = 0;

    if (cpu >= 90) this.cpuHighStreak += 1;
    else this.cpuHighStreak = 0;

    if (this.critStreak >= 3) {
      this.sendLog(
        `CRITICAL sustained\nCPU ${cpu.toFixed(1)}% | heap ${(heapUsed / GB).toFixed(2)}GB | RSS ${(rss / GB).toFixed(2)}GB`,
        null,
        'mem_critical',
        1800000
      );
    }

    if (this.cpuHighStreak >= 4 && cpu >= 92) {
      this.sendLog(
        `High CPU sustained\nCPU ${cpu.toFixed(1)}% | heap ${(heapUsed / GB).toFixed(2)}GB | RSS ${(rss / GB).toFixed(2)}GB`,
        null,
        'cpu_high',
        1800000
      );
    }

    const uptime = process.uptime();
    if (
      heapUsed > MEMORY_CRITICAL &&
      this.critStreak >= 5 &&
      uptime > 3600
    ) {
      this.sendLog(
        `High heap sustained — restarting process\nCPU ${cpu.toFixed(1)}% | heap ${(heapUsed / GB).toFixed(2)}GB | RSS ${(rss / GB).toFixed(2)}GB`,
        null,
        'mem_restart',
        3600000
      );
      setTimeout(() => process.exit(0), 5000);
    }
  }

  detectAttackPatterns() {
    const now = Date.now();
    const patterns = new Map();

    let count = 0;
    for (const [ip, data] of this.ipBlocks.entries()) {
      if (count++ > 500) break;

      let recentCount = 0;
      for (let i = 0; i < data.blocks.length; i++) {
        if (now - data.blocks[i] < PATTERN_DETECTION_WINDOW) recentCount++;
      }

      if (recentCount < ATTACK_PATTERN_THRESHOLD) continue;

      const types = data.types;
      const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

      const patternKey = `${topType}:${recentCount}`;
      if (!patterns.has(patternKey)) {
        patterns.set(patternKey, { type: topType, count: 0, ips: [] });
      }
      const pattern = patterns.get(patternKey);
      pattern.count += recentCount;
      pattern.ips.push(ip);
    }

    for (const [key, pattern] of patterns.entries()) {
      if (pattern.count > 200 && pattern.ips.length > 10) {
        this.attackPatterns.set(key, { ...pattern, detected: now });

        if (!this.isUnderAttack && !this.startupGracePeriod) {
          this.autoMitigationActive = true;
          this.attackVector = pattern.type;
          this.sendLog(`Attack pattern: ${pattern.type} (${pattern.count} blocks from ${pattern.ips.length} IPs)`, null, 'attack_pattern', 600000);
        }
      }
    }

    this.attackPatterns.forEach((pattern, key) => {
      if (now - pattern.detected > 600000) {
        this.attackPatterns.delete(key);
      }
    });
  }

  trackMemoryPressure(ip) {
    const now = Date.now();
    const data = this.ipRequests.get(ip) || { count: 0, lastSeen: now, memoryPressure: 0 };
    data.memoryPressure = (data.memoryPressure || 0) + 1;
    this.ipRequests.set(ip, data);

    if (data.memoryPressure > 10) {
      this.incrementBlocked(ip, 'memory_abuse');
    }
  }

  updateMemoryStats(mem, pressure, activeRequests) {
    this.memoryStats = {
      heapUsed: mem.heapUsed,
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      active: pressure,
      activeRequests,
      timestamp: Date.now()
    };

    if (pressure && this.isUnderAttack && !this.mitigationActions.includes('memory_mitigation')) {
      this.mitigationActions.push('memory_mitigation');
      this.sendLog(`Memory mitigation active (heap ${(mem.heapUsed / GB).toFixed(2)}GB)`, null, 'mem_mitigation', 900000);
    }
  }

  etParts() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value || '0';
    return {
      day: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')),
      minute: Number(get('minute')),
    };
  }

  scheduleDailyRestart() {
    const tick = () => {
      if (this.startupGracePeriod) return;
      if (process.uptime() < 180) return;
      const { day, hour, minute } = this.etParts();
      if (hour !== RESTART_HOUR_ET || minute !== 0) return;
      if (this.lastRestartDay === day) return;
      try {
        if (existsSync(RESTART_MARKER) && readFileSync(RESTART_MARKER, 'utf8').trim() === day) {
          this.lastRestartDay = day;
          return;
        }
      } catch {}
      this.lastRestartDay = day;
      try {
        writeFileSync(RESTART_MARKER, day);
      } catch {}
      this.performGracefulRestart();
    };
    const t = setInterval(tick, 30000);
    if (t?.unref) t.unref();
  }

  scheduleDailyStatus() {
    const tick = () => {
      const { day, hour, minute } = this.etParts();
      if (hour === NOON_HOUR_ET && minute === 0 && this.lastNoonDay !== day) {
        this.lastNoonDay = day;
        this.sendDailyStatus().catch(() => {});
      }
    };
    const t = setInterval(tick, 30000);
    if (t?.unref) t.unref();
  }

  async sendDailyStatus() {
    const mem = process.memoryUsage();
    const cpu = this.getCpuUsage();
    const uptimeH = (process.uptime() / 3600).toFixed(1);
    let status = 'Normal';
    if (this.killSwitchActive) status = 'Kill switch active';
    else if (this.isUnderAttack || this.forceAttackMode) status = 'Under attack / force mode';
    else if (cpu >= 85 || mem.heapUsed > MEMORY_CRITICAL * 0.75) status = 'Elevated load';

    const embed = new EmbedBuilder()
      .setTitle('Daily server status (noon ET)')
      .setDescription(
        [
          `Status: ${status}`,
          `CPU: ${cpu.toFixed(1)}%`,
          `Heap: ${(mem.heapUsed / GB).toFixed(2)}GB`,
          `RSS: ${(mem.rss / GB).toFixed(2)}GB`,
          `Uptime: ${uptimeH}h`,
          `Blocks (session): ${this.mitigatedCount}`,
          `Tracked IPs: ${this.ipBlocks.size}`,
        ].join('\n')
      )
      .setColor('#3b82f6')
      .setTimestamp();

    await this.sendLog(null, embed, 'daily_status', 0);
  }

  async performGracefulRestart() {
    const embed = new EmbedBuilder()
      .setTitle('Graceful restart initiated')
      .setDescription('Scheduled restart. Connections will be terminated cleanly.')
      .setColor('#ffaa00')
      .setTimestamp();

    await this.sendLog(null, embed, 'scheduled_restart', 180000);

    if (this.client.ws) {
      this.client.ws.destroy();
    }

    setTimeout(() => {
      process.exit(0);
    }, 5000);
  }

  registerCommands(client) {
    client.once('ready', () => {
      const commands = [
        { name: 'channel-setup', description: 'Set this channel as DDoS security log' },
        { name: 'test-attack', description: 'Simulate a DDoS attack to test the system' },
        { name: 'security-stats', description: 'View current security statistics' },
        { name: 'memory-status', description: 'View current memory usage and statistics' },
        { name: 'kill-switch', description: 'Emergency shutdown of the server' },
        { name: 'startup', description: 'Deactivate kill switch and allow server to run' },
        { name: 'force-cleanup', description: 'Force aggressive memory cleanup now' },
        { name: 'graceful-restart', description: 'Gracefully restart the server' },
        { name: 'attack-mode', description: 'Force attack mode activation' },
        { name: 'attack-mode-off', description: 'Disable forced attack mode' }
      ];

      client.application.commands.set(commands);
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
      }

      if (interaction.commandName === 'channel-setup') {
        this.setLogChannel(interaction.channelId);
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Security log channel set')
              .setDescription('This channel will now receive live DDoS alerts and mitigation updates.')
              .setColor('#00ff00')
          ]
        });
      }

      if (interaction.commandName === 'test-attack') {
        await interaction.reply({ content: 'Simulating DDoS attack for testing...', ephemeral: false });

        for (let i = 0; i < 100; i++) {
          this.incrementBlocked(`192.168.1.${i % 10}`, i % 3 === 0 ? 'pow_fail' : i % 3 === 1 ? 'rate_limit' : 'ws_cap');
          if (i % 10 === 0) await new Promise((r) => setTimeout(r, 100));
        }

        setTimeout(() => this.endAttackAlert(), 15000);
      }

     if (interaction.commandName === 'security-stats') {
        await interaction.deferReply({ ephemeral: true });
    
        const topAbusers = this.getTopAbusers(10);
        const blockRate = this.getRecentBlockRate();
        const cpuUsage = this.getCpuUsage().toFixed(1);
        const { totalHits, uniqueIps } = this.getChallengeSpike();
        const mem = process.memoryUsage();
        const heapUsed = (mem.heapUsed / 1024 / 1024 / 1024).toFixed(2);
        const rss = (mem.rss / 1024 / 1024 / 1024).toFixed(2);
        const xdpBlockCount = 0;

        const systemState = interaction.client.systemState || {};
        const powDifficulty = systemState.currentPowDifficulty || 16;
        const requestRate = systemState.requestRatePerMinute || 0;

        let systemLoadOutput = 'N/A';
        let contextSwitchesOutput = 'N/A';

        try {
          const { stdout: loadavg } = await execAsync("uptime | awk -F\"load average:\" '{print $2}' | awk '{print $1}' | tr -d ','");
          systemLoadOutput = parseFloat(loadavg.trim()).toFixed(2);
        } catch (err) {
          console.error('Failed to get system load:', err.message);
        }

        try {
          const { stdout: cswch } = await execAsync("sar -w 1 3 2>/dev/null | grep Average | awk '{print $3}'");
          const cswchValue = parseFloat(cswch.trim());
          if (!isNaN(cswchValue)) {
            contextSwitchesOutput = Math.round(cswchValue).toLocaleString() + '/sec';
          }
        } catch (err) {
          console.error('Failed to get context switches:', err.message);
        }

        let statusText = 'Normal';
        let statusColor = '#00ff00';

        if (this.killSwitchActive) {
          statusText = 'KILL SWITCH ACTIVE';
          statusColor = '#ff0000';
        } else if (this.isUnderAttack) {
          statusText = 'Under attack';
          statusColor = '#ff0000';
        } else if (systemState.state === 'BUSY') {
          statusText = 'Busy (high legitimate load)';
          statusColor = '#ffaa00';
        }

        if (this.forceAttackMode) {
          statusText = 'Force attack mode';
          statusColor = '#ff0000';
        }

        const embed = new EmbedBuilder()
          .setTitle('Security statistics')
          .addFields(
            { name: 'Status', value: statusText, inline: true },
            { name: 'System Load', value: systemLoadOutput, inline: true },
            { name: 'Context Switches', value: contextSwitchesOutput, inline: true },
            { name: 'CPU Usage', value: `${cpuUsage}%`, inline: true },
            { name: 'Memory (Heap)', value: `${heapUsed}GB`, inline: true },
            { name: 'Memory (RSS)', value: `${rss}GB`, inline: true },
            { name: 'PoW Difficulty', value: `${powDifficulty}`, inline: true },
            { name: 'Requests/min', value: `${Math.round(requestRate)}`, inline: true },
            { name: 'Block Rate', value: `${blockRate}/min`, inline: true },
            { name: 'Total Blocks', value: this.mitigatedCount.toLocaleString(), inline: true },
            { name: 'Challenge Hits', value: `${totalHits} from ${uniqueIps} IPs`, inline: true },
            { name: 'Attack Patterns', value: this.attackPatterns.size.toString(), inline: true },
            { name: 'Tracked IPs', value: `${this.ipBlocks.size}/${this.MAX_IP_TRACKING}`, inline: true },
            { name: 'Tracked Requests', value: `${this.ipRequests.size}/${this.MAX_IP_TRACKING}`, inline: true },
            { name: 'Top Abusers', value: topAbusers.map((a) => `${a.ip}: ${a.count} (${a.primaryType})`).join('\n') || 'None', inline: false }
          )
          .setColor(statusColor)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === 'memory-status') {
        await interaction.deferReply({ ephemeral: true });
    
        const mem = process.memoryUsage();
        const heapUsed = (mem.heapUsed / 1024 / 1024 / 1024).toFixed(2);
        const heapTotal = (mem.heapTotal / 1024 / 1024 / 1024).toFixed(2);
        const rss = (mem.rss / 1024 / 1024 / 1024).toFixed(2);
        const external = (mem.external / 1024 / 1024 / 1024).toFixed(2);

        const status = this.memoryStats.active ? 'High pressure' : 'Normal';

        const embed = new EmbedBuilder()
          .setTitle('Memory status')
          .addFields(
            { name: 'Status', value: status, inline: true },
            { name: 'Heap Used', value: `${heapUsed}GB`, inline: true },
            { name: 'Heap Total', value: `${heapTotal}GB`, inline: true },
            { name: 'RSS', value: `${rss}GB`, inline: true },
            { name: 'External', value: `${external}GB`, inline: true },
            { name: 'Active Requests', value: this.memoryStats.activeRequests?.toString() || 'N/A', inline: true },
            { name: 'Tracked IPs', value: this.ipBlocks.size.toString(), inline: true },
            { name: 'IP Requests', value: this.ipRequests.size.toString(), inline: true },
            { name: 'Challenge Hits', value: this.challengeHits.size.toString(), inline: true }
          )
          .setColor(this.memoryStats.active ? '#ff0000' : '#00ff00')
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }

      if (interaction.commandName === 'force-cleanup') {
        const beforeMem = process.memoryUsage();
        const beforeIpBlocks = this.ipBlocks.size;
        const beforeIpRequests = this.ipRequests.size;
        const beforeChallengeHits = this.challengeHits.size;

        this.aggressiveCleanup();
        this.cleanupOldEntries();

        const afterMem = process.memoryUsage();
        const freed = ((beforeMem.heapUsed - afterMem.heapUsed) / 1024 / 1024).toFixed(2);

        const embed = new EmbedBuilder()
          .setTitle('Forced cleanup complete')
          .addFields(
            { name: 'Memory Freed', value: `${freed}MB`, inline: true },
            { name: 'IP Blocks', value: `${beforeIpBlocks} → ${this.ipBlocks.size}`, inline: true },
            { name: 'IP Requests', value: `${beforeIpRequests} → ${this.ipRequests.size}`, inline: true },
            { name: 'Challenge Hits', value: `${beforeChallengeHits} → ${this.challengeHits.size}`, inline: true },
            { name: 'Heap Before', value: `${(beforeMem.heapUsed / 1024 / 1024 / 1024).toFixed(2)}GB`, inline: true },
            { name: 'Heap After', value: `${(afterMem.heapUsed / 1024 / 1024 / 1024).toFixed(2)}GB`, inline: true }
          )
          .setColor('#00ff00')
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (interaction.commandName === 'kill-switch') {
        this.setKillSwitch(true, { hardExit: true });

        const embed = new EmbedBuilder()
          .setTitle('Kill switch activated')
          .setDescription(
            'Server is now in emergency shutdown mode.\nAll incoming connections will be rejected.\nUse /startup to restore normal operations.'
          )
          .setColor('#ff0000')
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        await this.sendLog(null, embed);
      }

      if (interaction.commandName === 'startup') {
        if (!this.killSwitchActive) {
          return interaction.reply({
            content: 'Kill switch is not active. Server is running normally.',
            ephemeral: true
          });
        }

        this.setKillSwitch(false);

        const embed = new EmbedBuilder()
          .setTitle('Server restored')
          .setDescription('Kill switch deactivated.\nServer is now accepting connections normally.')
          .setColor('#00ff00')
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        await this.sendLog(null, embed);
      }

      if (interaction.commandName === 'graceful-restart') {
        await interaction.reply({ content: 'Initiating graceful restart...', ephemeral: false });
        await this.performGracefulRestart();
      }

      if (interaction.commandName === 'attack-mode') {
        const ss = interaction.client.systemState || null;
        this.setForceAttackMode(true, ss);

        const embed = new EmbedBuilder()
          .setTitle('Attack mode activated')
          .setDescription(
            'Server is now in forced attack mode.\nAll traffic will be treated as hostile.\nUse /attack-mode-off to restore normal operations.'
          )
          .setColor('#ff0000')
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        await this.sendLog(null, embed);
      }

      if (interaction.commandName === 'attack-mode-off') {
        if (!this.forceAttackMode) {
          return interaction.reply({
            content: 'Attack mode is not active.',
            ephemeral: true
          });
        }

        const ss = interaction.client.systemState || null;
        this.setForceAttackMode(false, ss);

        const embed = new EmbedBuilder()
          .setTitle('Attack mode deactivated')
          .setDescription('Server has returned to normal threat assessment mode.')
          .setColor('#00ff00')
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        await this.sendLog(null, embed);
      }
    });
  }

  isKillSwitchActive() {
    return this.killSwitchActive;
  }

  setForceAttackMode(enabled, systemStateRef = null) {
    const on = !!enabled;
    this.forceAttackMode = on;
    if (systemStateRef) {
      if (on) {
        systemStateRef.state = 'ATTACK';
        if (!this.isUnderAttack) this.startAttackAlert(systemStateRef);
      } else {
        if (systemStateRef.state === 'ATTACK') systemStateRef.state = 'NORMAL';
        if (this.isUnderAttack) this.endAttackAlert(systemStateRef);
      }
    } else if (!on && this.isUnderAttack) {
      this.endAttackAlert();
    }
    return this.forceAttackMode;
  }

  setKillSwitch(enabled, { hardExit = false } = {}) {
    const on = !!enabled;
    this.killSwitchActive = on;
    if (on && hardExit) {
      setTimeout(() => {
        if (this.killSwitchActive) {
          console.log('KILL SWITCH: Terminating process...');
          process.exit(0);
        }
      }, 5000);
    }
    return this.killSwitchActive;
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.memoryMonitorInterval) clearInterval(this.memoryMonitorInterval);
    if (this.patternDetectionInterval) clearInterval(this.patternDetectionInterval);
    if (this.aggressiveCleanupInterval) clearInterval(this.aggressiveCleanupInterval);
    if (this.attackEndTimer) clearTimeout(this.attackEndTimer);

    this.ipBlocks.clear();
    this.blockTypes.clear();
    this.challengeHits.clear();
    this.ipRequests.clear();
    this.attackPatterns.clear();
    this.trustedFingerprints.clear();
    this.recentBlocks = [];
    this.wsFlushHistory = [];
    this.mitigationActions = [];
  }
}

export const ddosShield = (client) => {
  return new DDoSShield(client);
};
