import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import cors from "cors";
import { Chess } from "chess.js";

// Get __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- State Management ---
class MatchmakingQueue {
  queues = new Map(); // tier -> Map<mode, PlayerEntry[]>
  playerMap = new Map(); // userId -> { tier, mode }

  add(tier: string, mode: string, playerEntry: any) {
    if (!this.queues.has(tier)) this.queues.set(tier, new Map());
    if (!this.queues.get(tier).has(mode)) this.queues.get(tier).set(mode, []);
    this.queues.get(tier).get(mode).push({ ...playerEntry, joinedAt: Date.now() });
    this.playerMap.set(playerEntry.userId, { tier, mode });
  }

  remove(userId: string) {
    const location = this.playerMap.get(userId);
    if (!location) return;
    const { tier, mode } = location;
    const pool = this.queues.get(tier)?.get(mode);
    if (pool) {
      const index = pool.findIndex((p: any) => p.userId === userId);
      if (index !== -1) pool.splice(index, 1);
    }
    this.playerMap.delete(userId);
  }

  getPool(tier: string, mode: string) {
    return this.queues.get(tier)?.get(mode) || [];
  }

  isQueued(userId: string) { return this.playerMap.has(userId); }
  getPosition(userId: string) {
    const location = this.playerMap.get(userId);
    if (!location) return -1;
    const pool = this.getPool(location.tier, location.mode);
    return pool.findIndex((p: any) => p.userId === userId) + 1;
  }
}

class ActiveMatchStore {
  matches = new Map(); // matchId -> matchState
  playerMap = new Map(); // userId -> matchId

  create(matchId: string, matchData: any) {
    this.matches.set(matchId, { ...matchData, createdAt: Date.now() });
    for (const uid of Object.keys(matchData.players)) {
      this.playerMap.set(uid, matchId);
    }
  }

  get(matchId: string) { return this.matches.get(matchId); }
  getByPlayer(userId: string) {
    const matchId = this.playerMap.get(userId);
    return matchId ? this.matches.get(matchId) : null;
  }
  delete(matchId: string) {
    const match = this.matches.get(matchId);
    if (match) {
      for (const uid of Object.keys(match.players)) this.playerMap.delete(uid);
    }
    this.matches.delete(matchId);
  }
  isInMatch(userId: string) { return this.playerMap.has(userId); }
}

const queue = new MatchmakingQueue();
const activeMatches = new ActiveMatchStore();

// --- Services ---
const WAGER_TIERS: Record<string, number> = {
  micro: 0.25,
  standard: 1.00,
  pro: 5.00,
  elite: 25.00,
};

const findMatch = (newPlayer: any, pool: any[]) => {
  if (pool.length < 2) return null;
  const candidates = pool
    .filter(p => p.userId !== newPlayer.userId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  for (const candidate of candidates) {
    const eloDiff = Math.abs(newPlayer.elo - candidate.elo);
    if (eloDiff <= 150) return candidate; // Simplified Elo band for now
  }
  return null;
};

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Express Auth Middleware and Wallet APIs removed since server cannot access Firestore.
  // Clients will update their own Firestore documents directly.

  // Socket Auth Middleware
  io.use(async (socket: any, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error('No token provided');
      
      // In this environment, we trust the client to provide their UID and data
      // since firebase-admin cannot access the provisioned project.
      const uid = socket.handshake.auth?.uid;
      if (!uid) throw new Error('No UID provided');
      
      socket.userId = uid;
      socket.email = socket.handshake.auth?.email || '';
      socket.elo = socket.handshake.auth?.elo || 1200;
      socket.balance = socket.handshake.auth?.balance || 10.00;
      socket.username = socket.handshake.auth?.username || 'Player';
      
      next();
    } catch (err: any) {
      console.error('Socket auth failed:', err.message);
      next(new Error('Unauthorized'));
    }
  });

  io.on("connection", (socket: any) => {
    console.log(`✅ Connected: ${socket.username} (${socket.userId})`);

    socket.on("join_queue", async ({ wager, mode }: { wager: number, mode: string }) => {
      if (queue.isQueued(socket.userId) || activeMatches.isInMatch(socket.userId)) {
        return socket.emit('queue_error', { error: 'Already in queue or match' });
      }

      const wagerAmount = Number(wager) || 0;
      if (wagerAmount <= 0) {
        return socket.emit('queue_error', { error: 'Invalid wager amount' });
      }

      if (socket.balance < wagerAmount) {
        return socket.emit('queue_error', { error: 'Insufficient balance' });
      }

      const tier = wagerAmount.toFixed(2); // Use wager amount as the queue tier
      const player = { userId: socket.userId, socketId: socket.id, elo: socket.elo, username: socket.username };
      queue.add(tier, mode, player);

      socket.emit('queue_joined', { tier, mode, wagerAmount, position: queue.getPosition(socket.userId) });

      const pool = queue.getPool(tier, mode);
      const opponent = findMatch(player, pool);

      if (opponent) {
        queue.remove(player.userId);
        queue.remove(opponent.userId);

        const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const chess = new Chess();

        activeMatches.create(matchId, {
          matchId, gameMode: mode, wagerAmount, 
          fen: chess.fen(),
          history: [],
          turn: 'w',
          players: {
            [player.userId]: { socketId: player.socketId, username: player.username, elo: player.elo, color: 'w', ready: false },
            [opponent.userId]: { socketId: opponent.socketId, username: opponent.username, elo: opponent.elo, color: 'b', ready: false },
          }
        });

        const matchFound = (opp: any, color: string) => ({ 
          matchId, 
          gameMode: mode, 
          wagerAmount, 
          color,
          opponent: { username: opp.username, elo: opp.elo } 
        });

        io.to(player.socketId).emit('match_found', matchFound(opponent, 'w'));
        io.to(opponent.socketId).emit('match_found', matchFound(player, 'b'));
      }
    });

    socket.on("make_move", ({ matchId, move }: { matchId: string, move: any }) => {
      const match = activeMatches.get(matchId);
      if (!match) return;

      const player = match.players[socket.userId];
      if (!player || player.color !== match.turn) return;

      const chess = new Chess(match.fen);
      try {
        const result = chess.move(move);
        if (result) {
          match.fen = chess.fen();
          match.history.push(result);
          match.turn = chess.turn();

          // Broadcast move to both players
          Object.values(match.players).forEach((p: any) => {
            io.to(p.socketId).emit('move_made', { 
              move: result, 
              fen: match.fen,
              turn: match.turn 
            });
          });

          // Check for game end
          if (chess.isGameOver()) {
            resolveMatch(matchId, chess);
          }
        }
      } catch (e) {
        socket.emit('move_error', { error: 'Invalid move' });
      }
    });

    async function resolveMatch(matchId: string, chess: Chess) {
      const match = activeMatches.get(matchId);
      if (!match) return;

      const p1Id = Object.keys(match.players)[0];
      const p2Id = Object.keys(match.players)[1];
      const p1 = match.players[p1Id];
      const p2 = match.players[p2Id];

      let winnerId: string | null = null;
      if (chess.isCheckmate()) {
        winnerId = chess.turn() === 'w' ? (p1.color === 'b' ? p1Id : p2Id) : (p1.color === 'w' ? p1Id : p2Id);
      } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
        winnerId = null;
      }

      // Emit match_complete so clients can update their own Firestore documents
      let p1EloChange = 0, p2EloChange = 0;
      let p1BalanceChange = -match.wagerAmount, p2BalanceChange = -match.wagerAmount;

      if (winnerId === p1Id) {
        p1EloChange = 15; p2EloChange = -10;
        p1BalanceChange += match.wagerAmount * 1.8;
      } else if (winnerId === p2Id) {
        p1EloChange = -10; p2EloChange = 15;
        p2BalanceChange += match.wagerAmount * 1.8;
      } else {
        // Draw: refund
        p1BalanceChange += match.wagerAmount;
        p2BalanceChange += match.wagerAmount;
      }

      Object.keys(match.players).forEach(uid => {
        const eloChange = uid === p1Id ? p1EloChange : p2EloChange;
        const balanceChange = uid === p1Id ? p1BalanceChange : p2BalanceChange;
        const payout = uid === winnerId ? match.wagerAmount * 1.8 : (winnerId === null ? match.wagerAmount : 0);
        
        io.to(match.players[uid].socketId).emit('match_complete', {
          matchId, won: uid === winnerId, draw: winnerId === null,
          payout, eloChange, balanceChange
        });
      });
      
      activeMatches.delete(matchId);
    }

    socket.on("player_ready", ({ matchId }: { matchId: string }) => {
      const match = activeMatches.get(matchId);
      if (!match) return;
      const player = match.players[socket.userId];
      if (!player) return;
      player.ready = true;

      if (Object.values(match.players).every((p: any) => p.ready)) {
        match.startedAt = Date.now();
        io.to(Object.values(match.players).map((p: any) => p.socketId)).emit('match_start', { matchId, startTime: Date.now() + 3000 });
      } else {
        socket.emit('waiting_for_opponent', { message: 'Waiting for opponent...' });
      }
    });

    socket.on("leave_queue", () => queue.remove(socket.userId));
    socket.on("disconnect", () => queue.remove(socket.userId));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
