import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import bareServerPkg from '@tomphttp/bare-server-node';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import { randomBytes } from 'crypto';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'process';
import BetterSqlite3Session from 'better-sqlite3-session-store';
import httpProxy from 'http-proxy';

import { createCorsConfig, createSecurityHeaders, createUploadGuard } from './middleware/http-security.js';
import { ddosShield } from './security/ddos-shield.js';
import { toIPv4, systemState, createGateMiddleware, createMemoryProtection, checkCircuitBreaker, checkSystemPressure, cleanupSecurityMaps, isTrustedWS, adjustPowDifficulty } from './middleware/security.js';
import { authLimiter, createApiLimiter, createAiLimiter, signupLimiter, localStorageLimiter, pfpLimiter } from './middleware/rate-limit.js';
import { updateIPReputation } from './middleware/security.js';
import challengeRouter from './routes/challenge.js';
import aiRouter from './routes/ai.js';
import moviesRouter from './routes/movies.js';
import videoRouter from './routes/video.js';
import musicRouter from './routes/music.js';
import mochiRouter from './routes/mochi.js';
import db from './db.js';

import { signupHandler } from './api/signup.js';
import { signinHandler } from './api/signin.js';
import { signoutHandler } from './api/signout.js';
import { getMeHandler, updateProfileHandler, uploadAvatarHandler, uploadBannerHandler, getPublicProfileHandler } from './api/user.js';
import { getSettingsHandler, saveSettingsHandler } from './api/settings.js';
import { addCommentHandler, getCommentsHandler, deleteCommentHandler, cleanupMaliciousCommentsHandler } from './api/comments.js';
import { likeHandler, getLikesHandler } from './api/likes.js';
import { adminUserActionHandler } from './api/admin-user-action.js';
import { getAdminUsersHandler, getAdminUserHandler, getAdminStaffHandler } from './api/admin-users.js';
import { createIpBanMiddleware } from './middleware/ip-ban.js';
import { getChangelogHandler, createChangelogHandler, deleteChangelogHandler } from './api/changelog.js';
import { getFeedbackHandler, createFeedbackHandler, deleteFeedbackHandler } from './api/feedback.js';
import {
  reportPresenceHandler,
  getLiveSitesHandler,
  listAnnouncementsHandler,
  getActiveAnnouncementHandler,
  createAnnouncementHandler,
  setAnnouncementActiveHandler,
} from './api/admin-presence.js';

const { createBareServer } = bareServerPkg;
const SqliteStore = BetterSqlite3Session(session);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '.env.production') });

if (!process.env.TOKEN_SECRET) throw new Error('TOKEN_SECRET must be set');
if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY must be set');
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}

const bare = createBareServer('/bare/', { websocket: { maxPayloadLength: 4096 } });
const barePremium = createBareServer('/api/bare-premium/', { websocket: { maxPayloadLength: 4096 } });
const app = express();

app.set('trust proxy', ['127.0.0.1', '::1']);

const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
const shield = ddosShield(discordClient);

discordClient.login(process.env.BOT_TOKEN).catch(err => console.error('Discord bot login failed:', err.message));
shield.registerCommands(discordClient);
discordClient.systemState = systemState;

const apiLimiter = createApiLimiter(shield);
const aiLimiter = createAiLimiter(shield);

app.use(createSecurityHeaders());
app.use(cookieParser());
app.use(compression({ level: 6, threshold: 1024 }));
app.use(cors(createCorsConfig()));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb', parameterLimit: 100 }));

app.use(session({
  store: new SqliteStore({ client: db }),
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : randomBytes(32).toString('hex')),
  resave: false,
  saveUninitialized: false,
  name: 'pz.sid',
  cookie: {
    secure: 'auto',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  },
  rolling: true,
}));

app.use(createMemoryProtection(shield));
app.use(createIpBanMiddleware());
app.use(createGateMiddleware(shield));

const AUTH_PATHS = new Set(['/api/signin', '/api/signup', '/api/bot-challenge', '/api/bot-verify', '/api/verify-email']);
app.use('/api/', (req, res, next) => AUTH_PATHS.has(req.path) ? authLimiter(req, res, next) : apiLimiter(req, res, next));
app.use('/bare/', apiLimiter);

app.use('/scram/', express.static(scramjetPath));
app.use('/baremux/', express.static(baremuxPath));
app.use('/epoxy/', express.static(epoxyPath));
app.use('/uploads', createUploadGuard(), express.static(path.join(__dirname, '../uploads'), { dotfiles: 'deny', index: false }));

app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '../dist/sw.js'));
});

app.use('/api', challengeRouter);
app.use('/api/generate', aiLimiter, express.json({ limit: '10mb' }), aiRouter);
app.use('/api/tmdb', moviesRouter);
app.use('/api/video', videoRouter);
app.use('/api/music', musicRouter);

app.post('/api/signup', signupLimiter, signupHandler);
app.post('/api/signin', signinHandler);
app.post('/api/signout', signoutHandler);

app.get('/api/me', getMeHandler);
app.put('/api/me', updateProfileHandler);
app.post('/api/me/avatar', pfpLimiter, uploadAvatarHandler);
app.post('/api/me/banner', pfpLimiter, uploadBannerHandler);
app.get('/api/user/:username', getPublicProfileHandler);

app.get('/api/settings', getSettingsHandler);
app.put('/api/settings', localStorageLimiter, saveSettingsHandler);

app.get('/api/changelog', getChangelogHandler);
app.post('/api/changelog', createChangelogHandler);
app.delete('/api/changelog/:id', deleteChangelogHandler);

app.get('/api/feedback', getFeedbackHandler);
app.post('/api/feedback', createFeedbackHandler);
app.delete('/api/feedback/:id', deleteFeedbackHandler);

app.post('/api/comment', addCommentHandler);
app.get('/api/comments', getCommentsHandler);
app.post('/api/comment/delete', deleteCommentHandler);

app.post('/api/likes', likeHandler);
app.get('/api/likes', getLikesHandler);

app.post('/api/admin/user-action', adminUserActionHandler);
app.post('/api/admin/cleanup-comments', cleanupMaliciousCommentsHandler);
app.get('/api/admin/staff', getAdminStaffHandler);
app.get('/api/admin/users', getAdminUsersHandler);
app.get('/api/admin/users/:id', getAdminUserHandler);
app.get('/api/admin/live-sites', getLiveSitesHandler);
app.get('/api/admin/announcements', listAnnouncementsHandler);
app.post('/api/admin/announcements', createAnnouncementHandler);
app.post('/api/admin/announcements/:id/active', setAnnouncementActiveHandler);

app.post('/api/presence', reportPresenceHandler);
app.get('/api/announcements/active', getActiveAnnouncementHandler);

app.use(mochiRouter);

const mochiWsProxy = httpProxy.createProxyServer({
  target: 'http://localhost:3005',
  ws: true,
});

mochiWsProxy.on('error', (err) => {
  console.error('[mochi ws proxy error]', err.message);
});

const IS_DEV = process.env.NODE_ENV !== 'production';
const VITE_PORT = parseInt(process.env.VITE_PORT || '5173');

if (IS_DEV) {
  const { createProxyMiddleware } = await import('http-proxy-middleware');
  app.use('/', createProxyMiddleware({ target: `http://localhost:${VITE_PORT}`, changeOrigin: true, ws: false }));
} else {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const wsConnections = new Map();
const MAX_WS_PER_IP = 100;
const MAX_TOTAL_WS = 5000;

const server = createServer((req, res) => {
  shield.trackRequest(toIPv4(null, req));
  if (bare.shouldRoute(req)) bare.routeRequest(req, res);
  else if (barePremium.shouldRoute(req)) barePremium.routeRequest(req, res);
  else app.handle(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const url = req.url;
  const ip = toIPv4(null, req);

  shield.trackRequest(ip);

  if (url.startsWith('/!!/') || url.startsWith('/!cover!/')) {
    mochiWsProxy.ws(req, socket, head);
    return;
  }

  if (checkCircuitBreaker(ip, shield)) {
    shield.incrementBlocked(ip, 'circuit_open');
    return socket.destroy();
  }

  const current = wsConnections.get(ip) || 0;
  if (current >= MAX_WS_PER_IP || systemState.totalWS >= MAX_TOTAL_WS) {
    shield.incrementBlocked(ip, 'ws_cap');
    updateIPReputation(ip, -5);
    return socket.destroy();
  }

  const isWispUrl = url.startsWith('/wisp/') || /^\/api\/(wisp-premium|alt-wisp-\d+)\//.test(url);
  const isBareUrl = bare.shouldRoute(req) || barePremium.shouldRoute(req);

  if (!isWispUrl && !isBareUrl) return socket.destroy();

  if (isWispUrl && systemState.state === 'ATTACK' && !isTrustedWS(req)) {
    shield.incrementBlocked(ip, 'ws_attack_block');
    return socket.destroy();
  }

  wsConnections.set(ip, current + 1);
  systemState.activeConnections++;
  systemState.totalWS++;
  shield.trackWS(ip, 1);

  const cleanup = () => {
    const n = wsConnections.get(ip) || 1;
    if (n <= 1) wsConnections.delete(ip); else wsConnections.set(ip, n - 1);
    systemState.activeConnections--;
    systemState.totalWS--;
    shield.trackWS(ip, -1);
  };
  socket.once('close', cleanup);
  socket.once('error', cleanup);

  if (bare.shouldRoute(req)) return bare.routeUpgrade(req, socket, head);
  if (barePremium.shouldRoute(req)) return barePremium.routeUpgrade(req, socket, head);

  if (!url.startsWith('/wisp/')) req.url = '/wisp/' + url.replace(/^\/api\/(wisp-premium|alt-wisp-\d+)\//, '');
  wisp.routeRequest(req, socket, head);
});

const port = parseInt(process.env.PORT || '3000');
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.requestTimeout = 120000;

setInterval(() => {
  checkSystemPressure(shield);
  adjustPowDifficulty(shield);
  shield.checkAttackConditions('system', systemState);
  cleanupSecurityMaps();
}, 10000);

server.listen({ port }, () => {
  const addr = server.address();
  console.log(`Listening on http://localhost:${addr.port}`);
  console.log(`\thttp://${hostname()}:${addr.port}`);
  if (IS_DEV) console.log(`\tProxying to Vite on port ${VITE_PORT}`);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', err => { shield.sendLog(`💥 Uncaught: ${err.message}`, null); console.error(err); });
process.on('unhandledRejection', reason => { shield.sendLog(`⚠️ Unhandled rejection: ${reason}`, null); console.error(reason); });

function shutdown() {
  console.log('Shutting down...');
  if (shield.isUnderAttack) shield.endAttackAlert(systemState);
  mochiWsProxy.close();
  server.close(() => { bare.close(); process.exit(0); });
  setTimeout(() => { bare.close(); process.exit(1); }, 5000);
}
