/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, Trophy, User, MessageSquare, BarChart2, 
  ChevronRight, ArrowUpRight, Clock, CheckCircle2, XCircle, LogOut, Wallet, ArrowDownLeft, History, Hexagon, Shield,
  Sword, Users, Settings, Info, Play
} from 'lucide-react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { ethers } from 'ethers';
import { AuthProvider, useAuth } from './context/AuthContext';
import { signInWithGoogle, logOut } from './services/authService';
import { connectSocket, disconnectSocket, emit, on, off } from './services/socketService';
import { collection, query, where, orderBy, getDocs, limit, runTransaction, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './lib/firebase';

// --- Types ---
type ViewState = 'home' | 'matchmaking' | 'pre-match' | 'active-match' | 'post-match' | 'auth' | 'wallet' | 'profile';
type GameMode = 'chess';
type WagerTier = number;
type BotDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

interface UserProfile {
  name: string;
  elo: number;
  winRate: number;
  balance: number;
  streak: number;
}

const CURRENT_USER: UserProfile = {
  name: 'Alex_99',
  elo: 1340,
  winRate: 61,
  balance: 12.40,
  streak: 4
};

const OPPONENT: UserProfile = {
  name: 'SwiftMind_7',
  elo: 1355,
  winRate: 58,
  balance: 0, // not shown
  streak: 0
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { firebaseUser, userProfile, loading } = useAuth();
  const [view, setView] = useState<ViewState>('home');
  const [selectedMode, setSelectedMode] = useState<GameMode>('chess');
  const [selectedWager, setSelectedWager] = useState<number>(1.00);
  const [isPractice, setIsPractice] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('intermediate');

  const [matchScore, setMatchScore] = useState({ you: 0, opp: 0 });
  const [matchData, setMatchData] = useState<any>(null);
  const [queueData, setQueueData] = useState<any>(null);
  const [matchResult, setMatchResult] = useState<any>(null);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);

  useEffect(() => {
    if (!loading && !firebaseUser) {
      setView('auth');
      disconnectSocket();
    } else if (firebaseUser && userProfile && view === 'auth') {
      setView('home');
      connectSocket({
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        elo: userProfile.elo || 1200,
        balance: userProfile.balance || 0,
        username: userProfile.username || 'Player'
      });
    }
  }, [firebaseUser, userProfile, loading]);

  useEffect(() => {
    if (firebaseUser) {
      const handleQueueJoined = (data: any) => {
        setQueueData(data);
        setView('matchmaking');
      };

      const handleMatchFound = (data: any) => {
        setMatchData(data);
        setView('pre-match');
      };

      const handleMatchStart = (data: any) => {
        setMatchData((prev: any) => ({ ...prev, ...data }));
        setView('active-match');
      };

      const handleMatchComplete = async (data: any) => {
        setMatchResult(data);
        // Server doesn't send scores for chess, just win/loss/draw
        setMatchScore({ you: data.won ? 1 : (data.draw ? 0.5 : 0), opp: data.won ? 0 : (data.draw ? 0.5 : 1) });
        setView('post-match');
        
        // Update Firestore directly
        if (firebaseUser) {
          try {
            const userRef = doc(db, 'users', firebaseUser.uid);
            const txRef = doc(collection(db, 'transactions'));
            
            await runTransaction(db, async (t) => {
              const userDoc = await t.get(userRef);
              if (!userDoc.exists()) return;
              
              const currentBalance = userDoc.data()?.balance || 0;
              const currentElo = userDoc.data()?.elo || 1200;
              const totalMatches = userDoc.data()?.totalMatches || 0;
              const winStreak = userDoc.data()?.winStreak || 0;
              
              t.update(userRef, {
                balance: currentBalance + data.balanceChange,
                elo: Math.max(0, currentElo + data.eloChange),
                totalMatches: totalMatches + 1,
                winStreak: data.won ? winStreak + 1 : 0
              });
              
              t.set(txRef, {
                userId: firebaseUser.uid,
                type: data.won ? 'match_win' : (data.draw ? 'match_draw' : 'match_loss'),
                amount: data.balanceChange,
                status: 'completed',
                createdAt: new Date().toISOString()
              });
            });
          } catch (e) {
            console.error("Failed to update match results in Firestore:", e);
          }
        }
      };

      const handleWaiting = () => setWaitingForOpponent(true);
      const handleQueueError = (err: any) => alert(err.error);
      const handleAntiCheat = (err: any) => alert(err.message);

      on('queue_joined', handleQueueJoined);
      on('match_found', handleMatchFound);
      on('match_start', handleMatchStart);
      on('match_complete', handleMatchComplete);
      on('waiting_for_opponent', handleWaiting);
      on('queue_error', handleQueueError);
      on('anti_cheat_flag', handleAntiCheat);

      return () => {
        off('queue_joined', handleQueueJoined);
        off('match_found', handleMatchFound);
        off('match_start', handleMatchStart);
        off('match_complete', handleMatchComplete);
        off('waiting_for_opponent', handleWaiting);
        off('queue_error', handleQueueError);
        off('anti_cheat_flag', handleAntiCheat);
      };
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser && userProfile && userProfile.email === 'Maxi.Fritz2405@gmail.com' && userProfile.role !== 'admin') {
      const bootstrapAdmin = async () => {
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          await setDoc(userRef, { role: 'admin' }, { merge: true });
        } catch (e) {
          console.error("Failed to bootstrap admin:", e);
        }
      };
      bootstrapAdmin();
    }
  }, [firebaseUser, userProfile]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 text-slate-50 flex items-center justify-center">
        <Zap className="w-12 h-12 text-brand-500 animate-pulse" />
      </div>
    );
  }

  const balance = userProfile?.balance || 0;
  const elo = userProfile?.elo || 1200;

  const handleStartMatchmaking = () => {
    if (isPractice) {
      // Practice mode still uses local simulation for now or we can implement bot logic
      setView('matchmaking');
      return;
    }

    if (balance < selectedWager) {
      alert("Insufficient balance!");
      return;
    }

    emit('join_queue', { wager: selectedWager, mode: selectedMode });
  };

  const handleAcceptMatch = () => {
    if (isPractice) {
      setView('active-match');
      return;
    }
    emit('player_ready', { matchId: matchData.matchId });
  };

  const handleMatchComplete = (won: boolean, score: number, oppScore: number) => {
    if (isPractice) {
      setMatchScore({ you: score, opp: oppScore });
      setView('post-match');
      return;
    }
    // Real match completion is handled by socket event 'match_complete'
  };

  return (
    <div className="min-h-screen bg-dark-900 text-slate-50 flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-dark-800 shadow-2xl relative flex flex-col h-screen sm:h-[850px] sm:my-auto sm:rounded-3xl sm:border sm:border-slate-700 overflow-hidden">
        
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-slate-700 bg-dark-800/80 backdrop-blur-md z-10">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setView('home')}
          >
            <div className="bg-brand-500 p-1.5 rounded-lg">
              <Sword className="w-5 h-5 text-dark-900" />
            </div>
            <h1 className="font-bold text-lg tracking-tight text-white">Chess Duel</h1>
          </div>
          {firebaseUser && (
            <div className="flex items-center gap-4">
              {userProfile?.role === 'admin' && (
                <div className="flex items-center gap-1 bg-purple-500/20 text-purple-400 px-2 py-1 rounded-md border border-purple-500/30">
                  <Shield className="w-3 h-3" />
                  <span className="text-xs font-bold uppercase tracking-wider">Admin</span>
                </div>
              )}
              <button 
                onClick={() => setView('wallet')}
                className="flex items-center gap-2 bg-dark-700 hover:bg-dark-600 transition-colors px-3 py-1.5 rounded-full border border-slate-600 cursor-pointer"
              >
                <Wallet className="w-4 h-4 text-brand-400" />
                <span className="font-mono font-bold">{balance.toFixed(2)}</span>
              </button>
            </div>
          )}
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto relative">
          <AnimatePresence mode="wait">
            {view === 'auth' && (
              <AuthView key="auth" />
            )}
            {view === 'home' && (
              <HomeView 
                key="home"
                elo={elo}
                userProfile={userProfile}
                selectedMode={selectedMode}
                setSelectedMode={setSelectedMode}
                selectedWager={selectedWager}
                setSelectedWager={setSelectedWager}
                isPractice={isPractice}
                setIsPractice={setIsPractice}
                botDifficulty={botDifficulty}
                setBotDifficulty={setBotDifficulty}
                onStart={handleStartMatchmaking}
              />
            )}
            {view === 'matchmaking' && (
              <MatchmakingView 
                key="matchmaking"
                mode={selectedMode}
                wager={selectedWager}
                isPractice={isPractice}
                botDifficulty={botDifficulty}
                userProfile={userProfile}
                queueData={queueData}
                onFound={() => setView('pre-match')}
                onCancel={() => {
                  emit('leave_queue');
                  setView('home');
                }}
              />
            )}
            {view === 'pre-match' && (
              <PreMatchView 
                key="pre-match"
                mode={selectedMode}
                wager={selectedWager}
                isPractice={isPractice}
                botDifficulty={botDifficulty}
                userProfile={userProfile}
                matchData={matchData}
                waitingForOpponent={waitingForOpponent}
                onAccept={handleAcceptMatch}
                onDecline={() => {
                  emit('leave_queue');
                  setView('home');
                }}
                elo={elo}
              />
            )}
            {view === 'active-match' && (
              <ActiveMatchView 
                key="active-match"
                mode={selectedMode}
                isPractice={isPractice}
                botDifficulty={botDifficulty}
                matchData={matchData}
                onComplete={handleMatchComplete}
                userProfile={userProfile}
              />
            )}
            {view === 'post-match' && (
              <PostMatchView 
                key="post-match"
                wager={selectedWager}
                elo={elo}
                userProfile={userProfile}
                matchResult={matchResult}
                score={matchScore.you}
                oppScore={matchScore.opp}
                isPractice={isPractice}
                onHome={() => setView('home')}
                onRematch={() => setView('matchmaking')}
              />
            )}
            {view === 'wallet' && (
              <WalletView 
                key="wallet"
                balance={balance}
                onBack={() => setView('home')}
              />
            )}
            {view === 'profile' && (
              <ProfileView 
                key="profile"
                userProfile={userProfile}
                elo={elo}
                onLogout={() => logOut()}
              />
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <AnimatePresence>
          {['home', 'profile'].includes(view) && (
            <motion.nav 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="border-t border-slate-700 bg-dark-800 p-3 flex justify-around items-center pb-safe"
            >
              <NavButton icon={<Zap />} label="Play" active={view === 'home'} onClick={() => setView('home')} />
              <NavButton icon={<BarChart2 />} label="Leaderboard" />
              <NavButton icon={<MessageSquare />} label="Chat" />
              <NavButton icon={<User />} label="Profile" active={view === 'profile'} onClick={() => setView('profile')} />
            </motion.nav>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Subcomponents ---

function ProfileView({ key, userProfile, elo, onLogout }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="p-4 flex flex-col gap-6 h-full"
    >
      <div className="flex flex-col items-center justify-center mt-8 mb-4">
        <div className="w-24 h-24 bg-slate-700 rounded-full flex items-center justify-center text-4xl font-bold border-4 border-brand-500 shadow-[0_0_20px_rgba(34,197,94,0.2)] mb-4">
          {userProfile?.username?.charAt(0) || 'P'}
        </div>
        <h2 className="text-2xl font-bold">{userProfile?.username || 'Player'}</h2>
        <p className="text-slate-400">{userProfile?.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dark-800 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center">
          <Trophy className="w-6 h-6 text-yellow-400 mb-2" />
          <span className="text-sm text-slate-400">Elo Rating</span>
          <span className="text-xl font-bold">{elo}</span>
        </div>
        <div className="bg-dark-800 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center">
          <Zap className="w-6 h-6 text-brand-400 mb-2" />
          <span className="text-sm text-slate-400">Win Rate</span>
          <span className="text-xl font-bold">{userProfile?.winRate || 0}%</span>
        </div>
        <div className="bg-dark-800 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center">
          <History className="w-6 h-6 text-blue-400 mb-2" />
          <span className="text-sm text-slate-400">Total Matches</span>
          <span className="text-xl font-bold">{userProfile?.totalMatches || 0}</span>
        </div>
        <div className="bg-dark-800 border border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center">
          <Wallet className="w-6 h-6 text-emerald-400 mb-2" />
          <span className="text-sm text-slate-400">Balance</span>
          <span className="text-xl font-bold">${(userProfile?.balance || 0).toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-auto pt-8 pb-4">
        <button 
          onClick={onLogout}
          className="w-full bg-dark-800 border border-red-500/30 text-red-400 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </motion.div>
  );
}

function WalletView({ key, balance, onBack }: { key?: string, balance: number, onBack: () => void }) {
  const [amount, setAmount] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const { firebaseUser } = useAuth();
  
  // Web3 State
  const [web3Address, setWeb3Address] = useState<string | null>(null);
  const [web3Loading, setWeb3Loading] = useState(false);

  useEffect(() => {
    if (!firebaseUser) return;
    const fetchTransactions = async () => {
      try {
        const q = query(
          collection(db, 'transactions'),
          where('userId', '==', firebaseUser.uid),
          limit(50)
        );
        const snapshot = await getDocs(q);
        const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort on client to avoid composite index requirement
        txs.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTransactions(txs.slice(0, 10));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'transactions');
      }
    };
    fetchTransactions();
  }, [firebaseUser, balance]); // Re-fetch when balance changes

  const connectWeb3 = async () => {
    if (!(window as any).ethereum) {
      alert("Please install MetaMask or another Web3 wallet.");
      return;
    }
    try {
      setWeb3Loading(true);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      if (accounts.length > 0) {
        setWeb3Address(accounts[0]);
      }
    } catch (err: any) {
      console.error("Web3 connection error:", err);
      alert("Failed to connect Web3 wallet.");
    } finally {
      setWeb3Loading(false);
    }
  };

  const handleWeb3Transaction = async (type: 'deposit' | 'withdraw') => {
    if (!firebaseUser || !web3Address) return;
    if (!(window as any).ethereum) return;
    
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      let txHash = "mock_tx_hash_" + Date.now();
      
      if (type === 'deposit') {
        // Convert USD amount to ETH (mock rate: 1 ETH = $3000)
        const ethAmount = (amount / 3000).toFixed(6);
        
        // Send a real transaction to a dummy treasury address
        const tx = await signer.sendTransaction({
          to: "0x000000000000000000000000000000000000dEaD",
          value: ethers.parseEther(ethAmount)
        });
        
        // Wait for confirmation
        await tx.wait();
        txHash = tx.hash;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      const txRef = doc(collection(db, 'transactions'));
      
      await runTransaction(db, async (t) => {
        const userDoc = await t.get(userRef);
        if (!userDoc.exists()) throw new Error('User not found');
        const currentBalance = userDoc.data()?.balance || 0;
        
        if (type === 'withdraw' && currentBalance < amount) {
          throw new Error('Insufficient funds');
        }
        
        const newBalance = type === 'deposit' ? currentBalance + amount : currentBalance - amount;
        
        t.update(userRef, { balance: newBalance });
        t.set(txRef, {
          userId: firebaseUser.uid,
          type: type === 'deposit' ? 'web3_deposit' : 'web3_withdrawal',
          amount: type === 'deposit' ? amount : -amount,
          txHash: type === 'deposit' ? txHash : undefined,
          walletAddress: web3Address,
          status: 'completed',
          createdAt: new Date().toISOString()
        });
      });
      
      alert(`Successfully ${type === 'deposit' ? 'deposited' : 'withdrew'} $${amount.toFixed(2)} via Web3`);
    } catch (err: any) {
      console.error("Web3 transaction error:", err);
      alert(err.message || "Transaction failed or was rejected.");
    } finally {
      setLoading(false);
    }
  };

  const handleTransaction = async (type: 'deposit' | 'withdraw') => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const txRef = doc(collection(db, 'transactions'));
      
      await runTransaction(db, async (t) => {
        const userDoc = await t.get(userRef);
        if (!userDoc.exists()) throw new Error('User not found');
        const currentBalance = userDoc.data()?.balance || 0;
        
        if (type === 'withdraw' && currentBalance < amount) {
          throw new Error('Insufficient funds');
        }
        
        const newBalance = type === 'deposit' ? currentBalance + amount : currentBalance - amount;
        
        t.update(userRef, { balance: newBalance });
        t.set(txRef, {
          userId: firebaseUser.uid,
          type: type,
          amount: type === 'deposit' ? amount : -amount,
          status: 'completed',
          createdAt: new Date().toISOString()
        });
      });
      
      alert(`Successfully ${type === 'deposit' ? 'deposited' : 'withdrew'} $${amount.toFixed(2)}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6 h-full flex flex-col"
    >
      <div className="flex items-center mb-8">
        <button onClick={onBack} className="p-2 bg-dark-800 rounded-full hover:bg-dark-700 transition-colors mr-4">
          <ChevronRight className="w-6 h-6 rotate-180" />
        </button>
        <h2 className="text-2xl font-bold">Wallet</h2>
      </div>

      <div className="bg-dark-800 border border-slate-700 rounded-2xl p-6 mb-8 text-center">
        <div className="text-slate-400 text-sm uppercase tracking-wider mb-2">Available Balance</div>
        <div className="text-5xl font-mono font-bold text-brand-400">${balance.toFixed(2)}</div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Amount (USD)</label>
          <div className="flex items-center bg-dark-800 border border-slate-700 rounded-xl overflow-hidden focus-within:border-brand-500 transition-colors">
            <span className="pl-4 text-slate-400 font-mono text-lg">$</span>
            <input 
              type="number" 
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full bg-transparent border-none outline-none p-4 font-mono text-xl"
              min="1"
              step="1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => handleTransaction('deposit')}
            disabled={loading || amount <= 0}
            className="flex flex-col items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 text-dark-900 font-bold py-4 rounded-xl transition-colors disabled:opacity-50"
          >
            <ArrowDownLeft className="w-6 h-6" />
            Deposit
          </button>
          <button 
            onClick={() => handleTransaction('withdraw')}
            disabled={loading || amount <= 0 || amount > balance}
            className="flex flex-col items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-white font-bold py-4 rounded-xl border border-slate-600 transition-colors disabled:opacity-50"
          >
            <ArrowUpRight className="w-6 h-6" />
            Withdraw
          </button>
        </div>

        {/* Web3 Section */}
        <div className="mt-6 p-4 bg-dark-800/80 border border-slate-700 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Hexagon className="w-5 h-5 text-blue-400" />
              <span className="font-medium text-slate-200">Web3 Wallet</span>
            </div>
            {web3Address ? (
              <span className="text-xs font-mono bg-dark-900 px-2 py-1 rounded text-slate-400">
                {web3Address.slice(0, 6)}...{web3Address.slice(-4)}
              </span>
            ) : (
              <button 
                onClick={connectWeb3}
                disabled={web3Loading}
                className="text-xs font-bold bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                {web3Loading ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
          
          {web3Address && (
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => handleWeb3Transaction('deposit')}
                disabled={loading || amount <= 0}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm"
              >
                <ArrowDownLeft className="w-4 h-4" />
                Crypto Deposit
              </button>
              <button 
                onClick={() => handleWeb3Transaction('withdraw')}
                disabled={loading || amount <= 0 || amount > balance}
                className="flex items-center justify-center gap-2 bg-dark-700 hover:bg-dark-600 text-blue-400 font-bold py-2.5 rounded-lg border border-blue-900/50 transition-colors disabled:opacity-50 text-sm"
              >
                <ArrowUpRight className="w-4 h-4" />
                Crypto Withdraw
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto pt-8 flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 text-slate-400 mb-4">
          <History className="w-4 h-4" />
          <span className="text-sm font-medium uppercase tracking-wider">Recent Transactions</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {transactions.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-8 bg-dark-800/50 rounded-xl border border-slate-800 border-dashed">
              Transaction history will appear here.
            </div>
          ) : (
            transactions.map(tx => (
              <div key={tx.id} className="flex justify-between items-center p-3 bg-dark-800 rounded-xl border border-slate-700">
                <div>
                  <div className="font-medium text-slate-200 capitalize">{tx.type.replace('_', ' ')}</div>
                  <div className="text-xs text-slate-500">{new Date(tx.createdAt).toLocaleString()}</div>
                </div>
                <div className={`font-mono font-bold ${tx.amount > 0 ? 'text-brand-400' : 'text-slate-300'}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AuthView() {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col items-center justify-center p-8 text-center bg-dark-900"
    >
      <div className="w-24 h-24 bg-brand-500 rounded-3xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(34,197,94,0.4)] rotate-12">
        <Sword className="w-12 h-12 text-dark-900" />
      </div>
      <h2 className="text-4xl font-black mb-4 tracking-tighter text-white uppercase">Chess Duel</h2>
      <p className="text-slate-400 mb-12 text-lg leading-relaxed max-w-xs mx-auto">
        The ultimate arena for high-stakes chess. Wager, compete, and dominate the board.
      </p>
      
      <div className="w-full space-y-4">
        <button 
          onClick={() => signInWithGoogle()}
          className="w-full bg-white text-dark-900 font-bold py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-100 transition-all active:scale-95 shadow-xl"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          <span className="text-lg">Continue with Google</span>
        </button>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold opacity-50">
          Secure • Competitive • Real-time
        </p>
      </div>
    </motion.div>
  );
}

function NavButton({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${active ? 'text-brand-500' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {React.cloneElement(icon as React.ReactElement, { className: 'w-6 h-6' })}
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
}

function HomeView({ elo, userProfile, selectedWager, setSelectedWager, isPractice, setIsPractice, botDifficulty, setBotDifficulty, onStart }: any) {
  const [customWagerInput, setCustomWagerInput] = useState('');
  
  const wagers = [1.00, 5.00, 25.00, 50.00];
  const difficulties: BotDifficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="p-4 flex flex-col gap-6"
    >
      {/* Player Card */}
      <div className="bg-dark-800 rounded-3xl p-6 border border-slate-700/50 shadow-2xl flex items-center justify-between relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="flex items-center gap-5 relative z-10">
          <div className="w-16 h-16 bg-slate-700 rounded-2xl flex items-center justify-center text-2xl font-black border-2 border-brand-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            {userProfile?.username?.charAt(0) || 'P'}
          </div>
          <div>
            <h2 className="font-black text-xl text-white tracking-tight">{userProfile?.username || 'Player'}</h2>
            <div className="flex items-center gap-3 text-sm font-bold text-slate-400">
              <span className="flex items-center gap-1.5 bg-slate-900/50 px-2 py-0.5 rounded-lg border border-slate-700">
                <Trophy className="w-3.5 h-3.5 text-yellow-500"/> {elo}
              </span>
              <span className="text-brand-500">{userProfile?.winRate || 0}% WIN RATE</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end relative z-10">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Balance</div>
          <div className="text-xl font-mono font-black text-white">${userProfile?.balance?.toFixed(2) || '0.00'}</div>
        </div>
      </div>

      {/* Play Section */}
      <div className="bg-dark-800 rounded-3xl border border-slate-700/50 overflow-hidden shadow-2xl">
        <div className="bg-slate-800/30 p-4 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2 rounded-xl border border-brand-500/20">
              <Play className="w-5 h-5 text-brand-500 fill-brand-500" />
            </div>
            <h3 className="font-black text-sm uppercase tracking-widest text-white">New Game</h3>
          </div>
          <div className="flex items-center gap-3 bg-dark-900/50 px-3 py-1.5 rounded-2xl border border-slate-700">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Practice</span>
            <button 
              onClick={() => setIsPractice(!isPractice)}
              className={`w-10 h-5 rounded-full p-1 transition-all ${isPractice ? 'bg-brand-500' : 'bg-slate-700'}`}
            >
              <motion.div 
                layout
                className="w-3 h-3 bg-white rounded-full shadow-lg"
                animate={{ x: isPractice ? 20 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-8">
          {/* Wager or Difficulty Selection */}
          {!isPractice ? (
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Wager</label>
                <span className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Min $1.00</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {wagers.map(w => (
                  <button 
                    key={w}
                    onClick={() => {
                      setSelectedWager(w);
                      setCustomWagerInput('');
                    }}
                    className={`py-3 rounded-2xl border-2 font-mono text-sm font-black transition-all active:scale-95 ${
                      selectedWager === w && customWagerInput === ''
                        ? 'bg-brand-500 text-dark-900 border-brand-400 shadow-[0_0_20px_rgba(34,197,94,0.3)]' 
                        : 'bg-dark-700 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    ${w}
                  </button>
                ))}
              </div>
              <div className={`flex items-center bg-dark-900 border-2 rounded-2xl overflow-hidden transition-all group ${customWagerInput !== '' ? 'border-brand-500 shadow-[0_0_20px_rgba(34,197,94,0.1)]' : 'border-slate-700 focus-within:border-brand-500'}`}>
                <span className="pl-4 text-slate-500 font-mono font-black">$</span>
                <input 
                  type="number" 
                  min="1.00"
                  step="0.50"
                  placeholder="CUSTOM AMOUNT"
                  value={customWagerInput}
                  onChange={(e) => {
                    setCustomWagerInput(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 1) {
                      setSelectedWager(val);
                    }
                  }}
                  className="w-full bg-transparent border-none text-white font-mono font-black text-sm p-4 focus:outline-none placeholder:text-slate-700"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Bot Difficulty</label>
              <div className="grid grid-cols-2 gap-3">
                {difficulties.map(d => (
                  <button 
                    key={d}
                    onClick={() => setBotDifficulty(d)}
                    className={`py-4 rounded-2xl border-2 text-xs font-black transition-all uppercase tracking-widest active:scale-95 ${
                      botDifficulty === d 
                        ? 'bg-brand-500 text-dark-900 border-brand-400 shadow-[0_0_20px_rgba(34,197,94,0.3)]' 
                        : 'bg-dark-700 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onStart}
            className="w-full bg-brand-500 hover:bg-brand-400 text-dark-900 font-black text-xl py-6 rounded-3xl shadow-[0_10px_30px_rgba(34,197,94,0.4)] transition-all flex items-center justify-center gap-3 uppercase tracking-tighter"
          >
            <Sword className="w-6 h-6" />
            {isPractice ? 'Start Practice' : 'Find Opponent'}
          </motion.button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-dark-800 p-5 rounded-3xl border border-slate-700/50">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Active Duels</div>
          <div className="text-2xl font-black text-white">1,284</div>
        </div>
        <div className="bg-dark-800 p-5 rounded-3xl border border-slate-700/50">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Total Wagered</div>
          <div className="text-2xl font-black text-brand-500">$42.5k</div>
        </div>
      </div>

      {/* Tournaments */}
      <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 rounded-2xl border border-indigo-500/30 p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-indigo-200 flex items-center gap-2">
              <Trophy className="w-4 h-4" /> Daily Tournament
            </h3>
            <span className="text-xs font-mono bg-indigo-950 px-2 py-1 rounded text-indigo-300">6h left</span>
          </div>
          <p className="text-sm text-indigo-100/70 mb-3">Prize pool: $500 | 100 players | Custom Wagers</p>
          <button className="text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-4 py-2 rounded-lg transition-colors border border-indigo-500/50 flex items-center gap-1">
            ENTER NOW <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MatchmakingView({ mode, wager, isPractice, botDifficulty, userProfile, queueData, onFound, onCancel }: any) {
  useEffect(() => {
    if (isPractice) {
      const timer = setTimeout(() => {
        onFound();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [onFound, isPractice]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-dark-900/90 backdrop-blur-sm z-50"
    >
      <div className="relative w-32 h-32 mb-8">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-4 border-brand-500/20 border-t-brand-500"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className="w-10 h-10 text-brand-500 animate-pulse" />
        </div>
      </div>
      
      <h2 className="text-2xl font-bold mb-2">{isPractice ? 'Preparing Bot...' : 'Finding Opponent...'}</h2>
      <p className="text-slate-400 mb-8 text-center">
        {isPractice ? `Initializing ${botDifficulty} bot` : `Searching for players near ${userProfile?.elo || 1200} Elo`}<br/>
        <span className="text-sm">Mode: {mode.toUpperCase()} {isPractice ? '' : `| Wager: $${wager.toFixed(2)}`}</span>
      </p>
      
      {queueData && !isPractice && (
        <div className="mb-8 text-brand-400 font-mono text-sm">
          Queue Position: {queueData.position}
        </div>
      )}

      <button 
        onClick={onCancel}
        className="text-slate-400 hover:text-white border border-slate-600 rounded-full px-6 py-2 transition-colors"
      >
        Cancel Search
      </button>
    </motion.div>
  );
}

function PreMatchView({ mode, wager, isPractice, botDifficulty, onAccept, onDecline, elo, userProfile, matchData, waitingForOpponent }: any) {
  const oppName = isPractice ? `${botDifficulty.charAt(0).toUpperCase() + botDifficulty.slice(1)} Bot` : (matchData?.opponent?.username || 'Opponent');
  const oppElo = isPractice ? (botDifficulty === 'beginner' ? 800 : botDifficulty === 'intermediate' ? 1200 : botDifficulty === 'advanced' ? 1600 : 2000) : (matchData?.opponent?.elo || 1200);
  const oppWinRate = isPractice ? (botDifficulty === 'beginner' ? 20 : botDifficulty === 'intermediate' ? 50 : botDifficulty === 'advanced' ? 75 : 95) : 50;
  const oppStreak = isPractice ? 0 : 0;
  const oppInitial = oppName.charAt(0);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="h-full flex flex-col p-4"
    >
      <div className="text-center py-6">
        <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-brand-600 animate-pulse">
          MATCH FOUND ⚡
        </h2>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-8">
        {/* Versus Display */}
        <div className="flex justify-between items-center relative">
          {/* VS Badge */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-dark-900 rounded-full border-2 border-slate-700 flex items-center justify-center font-black italic text-slate-400 z-10">
            VS
          </div>

          {/* You */}
          <div className="flex-1 bg-gradient-to-br from-slate-800 to-dark-800 p-4 rounded-2xl border border-brand-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-brand-500">
                {userProfile?.username?.charAt(0) || 'P'}
              </div>
              <div>
                <div className="font-bold text-brand-400 text-sm">YOU</div>
                <div className="font-bold">{userProfile?.username || 'Player'}</div>
              </div>
              <div className="w-full space-y-1 mt-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Elo</span><span className="text-white font-mono">{elo}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Win%</span><span className="text-white font-mono">{userProfile?.winRate || 0}%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Streak</span><span className="text-orange-400 font-mono flex items-center gap-1"><Zap className="w-3 h-3"/> {userProfile?.winStreak || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="w-4"></div>

          {/* Opponent */}
          <div className="flex-1 bg-gradient-to-bl from-slate-800 to-dark-800 p-4 rounded-2xl border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="w-16 h-16 bg-slate-700 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-red-500">
                {oppInitial}
              </div>
              <div>
                <div className="font-bold text-red-400 text-sm">OPPONENT</div>
                <div className="font-bold">{oppName}</div>
              </div>
              <div className="w-full space-y-1 mt-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Elo</span><span className="text-white font-mono">{oppElo}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Win%</span><span className="text-white font-mono">{oppWinRate}%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Streak</span><span className="text-slate-500 font-mono">{oppStreak}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Match Details */}
        <div className="bg-dark-800 border border-slate-700 rounded-2xl p-4 text-center space-y-2">
          <div className="text-sm text-slate-400 uppercase tracking-wider">Match Details</div>
          <div className="text-lg font-bold">{mode.toUpperCase()} BLITZ</div>
          <div className="flex justify-center gap-6 text-sm">
            <div>
              <span className="text-slate-400">Wager: </span>
              <span className="font-mono font-bold text-white">{isPractice ? 'FREE' : `$${wager.toFixed(2)}`}</span>
            </div>
            {!isPractice && (
              <div>
                <span className="text-slate-400">Winner takes: </span>
                <span className="font-mono font-bold text-brand-400">${(wager * 1.8).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onAccept}
          disabled={waitingForOpponent}
          className={`w-full font-bold text-lg py-4 rounded-xl shadow-[0_4px_20px_rgba(34,197,94,0.4)] transition-colors ${waitingForOpponent ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-brand-500 hover:bg-brand-400 text-dark-900'}`}
        >
          {waitingForOpponent ? 'WAITING FOR OPPONENT...' : 'ACCEPT MATCH'}
        </motion.button>
        <button 
          onClick={onDecline}
          className="w-full bg-transparent border border-slate-600 text-slate-300 hover:bg-slate-800 font-bold text-sm py-3 rounded-xl transition-all"
        >
          DECLINE / SKIP
        </button>
      </div>
    </motion.div>
  );
}

function ActiveMatchView({ isPractice, botDifficulty, matchData, onComplete, userProfile }: any) {
  const [game, setGame] = useState(new Chess());
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [oppTimeLeft, setOppTimeLeft] = useState(600);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [moveFrom, setMoveFrom] = useState<string | null>(null);
  const [optionSquares, setOptionSquares] = useState<any>({});

  // Bot Evaluation Function
  const evaluateBoard = (chess: Chess) => {
    const pieceValues: any = { p: 10, n: 30, b: 30, r: 50, q: 90, k: 900 };
    let totalEvaluation = 0;
    const board = chess.board();
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const piece = board[i][j];
        if (piece) {
          const value = pieceValues[piece.type] || 0;
          totalEvaluation += piece.color === 'w' ? value : -value;
        }
      }
    }
    return totalEvaluation;
  };

  const getBotMove = (chess: Chess, difficulty: string) => {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    if (difficulty === 'beginner') {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // intermediate/advanced/expert: Simple greedy search with some randomness
    let bestMove = null;
    let bestValue = chess.turn() === 'w' ? -Infinity : Infinity;

    // Shuffle moves to add variety
    const shuffledMoves = [...moves].sort(() => Math.random() - 0.5);

    for (const move of shuffledMoves) {
      chess.move(move);
      const boardValue = evaluateBoard(chess);
      chess.undo();

      if (chess.turn() === 'w') {
        if (boardValue > bestValue) {
          bestValue = boardValue;
          bestMove = move;
        }
      } else {
        if (boardValue < bestValue) {
          bestValue = boardValue;
          bestMove = move;
        }
      }
    }

    // intermediate: more randomness
    if (difficulty === 'intermediate' && Math.random() > 0.6) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    
    // advanced: less randomness
    if (difficulty === 'advanced' && Math.random() > 0.8) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    return bestMove || moves[0];
  };

  useEffect(() => {
    if (isPractice) {
      setPlayerColor('w');
      setIsMyTurn(true);
    } else if (matchData && userProfile) {
      const color = matchData.color || (matchData.white === userProfile.uid ? 'w' : 'b');
      setPlayerColor(color);
      setIsMyTurn(color === 'w');
    }

    const handleMoveMade = ({ fen, move, turn }: any) => {
      const newGame = new Chess(fen);
      setGame(newGame);
      const moveSan = typeof move === 'string' ? move : move.san;
      setMoveHistory(prev => [...prev, moveSan]);
      setIsMyTurn(turn === (matchData?.color || (matchData?.white === userProfile?.uid ? 'w' : 'b')));
    };

    on('move_made', handleMoveMade);

    return () => {
      off('move_made', handleMoveMade);
    };
  }, [matchData, userProfile, isPractice]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (isMyTurn) {
        setTimeLeft(t => Math.max(0, t - 1));
      } else {
        setOppTimeLeft(t => Math.max(0, t - 1));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isMyTurn]);

  function getMoveOptions(square: string) {
    const moves = game.moves({
      square: square as any,
      verbose: true,
    });
    if (moves.length === 0) {
      setOptionSquares({});
      return false;
    }

    const newSquares: any = {};
    moves.forEach((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to as any) && game.get(move.to as any).color !== game.get(square as any).color
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 20%, transparent 20%)",
        borderRadius: "50%",
      };
    });
    newSquares[square] = {
      background: "rgba(255, 255, 0, 0.4)",
    };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClick(square: string) {
    if (!isMyTurn) return;

    // from square
    if (!moveFrom) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      return;
    }

    // to square
    const gameCopy = new Chess(game.fen());
    const move = gameCopy.move({
      from: moveFrom,
      to: square,
      promotion: "q",
    });

    if (move === null) {
      const hasOptions = getMoveOptions(square);
      if (hasOptions) setMoveFrom(square);
      else setMoveFrom(null);
      return;
    }

    setGame(gameCopy);
    setMoveHistory(prev => [...prev, move.san]);
    setIsMyTurn(false);
    setMoveFrom(null);
    setOptionSquares({});

    handleMove(gameCopy, move.san);
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (!isMyTurn) return false;

    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      setGame(gameCopy);
      setMoveHistory(prev => [...prev, move.san]);
      setIsMyTurn(false);
      setMoveFrom(null);
      setOptionSquares({});

      handleMove(gameCopy, move.san);
      return true;
    } catch (e) {
      return false;
    }
  }

  function handleMove(gameCopy: Chess, moveSan: string) {
    if (isPractice) {
      setTimeout(() => {
        const botMove = getBotMove(gameCopy, botDifficulty);
        if (botMove) {
          gameCopy.move(botMove);
          const newFen = gameCopy.fen();
          setGame(new Chess(newFen));
          const botMoveSan = typeof botMove === 'string' ? botMove : botMove.san;
          setMoveHistory(prev => [...prev, botMoveSan]);
          setIsMyTurn(true);
          
          if (gameCopy.isGameOver()) {
            const isWin = gameCopy.isCheckmate() && gameCopy.turn() !== playerColor;
            const isDraw = gameCopy.isDraw() || gameCopy.isStalemate() || gameCopy.isThreefoldRepetition();
            
            onComplete({
              won: isWin,
              draw: isDraw,
              payout: 0,
              eloChange: 0,
              balanceChange: 0
            });
          }
        }
      }, 1000);
    } else {
      emit('make_move', {
        matchId: matchData.matchId,
        move: moveSan,
        fen: gameCopy.fen()
      });
    }

    if (gameCopy.isGameOver()) {
      const isWin = gameCopy.isCheckmate() && gameCopy.turn() !== playerColor;
      const isDraw = gameCopy.isDraw() || gameCopy.isStalemate() || gameCopy.isThreefoldRepetition();
      
      onComplete({
        won: isWin,
        draw: isDraw,
        payout: 0,
        eloChange: 0,
        balanceChange: 0
      });
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const oppName = isPractice ? `${botDifficulty} Bot` : (matchData?.opponent?.username || 'Opponent');

  const ChessboardAny = Chessboard as any;

  return (
    <div className="h-full flex flex-col bg-dark-900">
      {/* Opponent Info */}
      <div className="p-4 flex items-center justify-between bg-dark-800/50 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center font-black border border-red-500/30">
            {oppName.charAt(0)}
          </div>
          <div>
            <div className="text-xs font-black text-slate-500 uppercase tracking-widest">Opponent</div>
            <div className="font-bold text-white">{oppName}</div>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl font-mono font-black text-xl border-2 transition-all ${!isMyTurn ? 'bg-red-500/10 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'bg-dark-900 border-slate-700 text-slate-500'}`}>
          {formatTime(oppTimeLeft)}
        </div>
      </div>

      {/* Board Area */}
      <div className="flex-1 flex items-center justify-center p-4 bg-dark-950">
        <div className="w-full max-w-[400px] aspect-square shadow-2xl rounded-lg overflow-hidden border-4 border-slate-800">
          <ChessboardAny 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            onSquareClick={onSquareClick}
            boardOrientation={playerColor === 'w' ? 'white' : 'black'}
            customDarkSquareStyle={{ backgroundColor: '#2d3748' }}
            customLightSquareStyle={{ backgroundColor: '#4a5568' }}
            customSquareStyles={{
              ...optionSquares
            }}
          />
        </div>
      </div>

      {/* Player Info */}
      <div className="p-4 flex items-center justify-between bg-dark-800/50 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center font-black border border-brand-500/30">
            {userProfile?.username?.charAt(0) || 'P'}
          </div>
          <div>
            <div className="text-xs font-black text-slate-500 uppercase tracking-widest">You</div>
            <div className="font-bold text-white">{userProfile?.username || 'Player'}</div>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl font-mono font-black text-xl border-2 transition-all ${isMyTurn ? 'bg-brand-500/10 border-brand-500 text-brand-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]' : 'bg-dark-900 border-slate-700 text-slate-500'}`}>
          {formatTime(timeLeft)}
        </div>
      </div>

      {/* Move History */}
      <div className="h-24 bg-dark-900 p-3 border-t border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <div className="flex gap-2">
          {moveHistory.map((move, i) => (
            <div key={i} className="inline-flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <span className="text-[10px] font-black text-slate-500">{Math.floor(i/2) + 1}{i%2===0 ? '.' : '...'}</span>
              <span className="text-sm font-bold text-white">{move}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PostMatchView({ wager, elo, userProfile, matchResult, onHome, onRematch, score, oppScore, isPractice }: any) {
  const won = isPractice ? score === 1 : matchResult?.won; // Using score as a flag for practice win
  const draw = isPractice ? score === 0.5 : matchResult?.draw;
  const winnings = isPractice ? 0 : matchResult?.payout || 0;
  const eloChange = isPractice ? 0 : matchResult?.eloChange || 0;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="h-full flex flex-col p-6 bg-dark-900"
    >
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <motion.div 
          initial={{ rotate: -10, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className={`w-32 h-32 rounded-3xl flex items-center justify-center mb-8 border-4 shadow-2xl ${
            won ? 'bg-brand-500/20 border-brand-500 shadow-brand-500/20' : 
            draw ? 'bg-slate-500/20 border-slate-500 shadow-slate-500/20' : 
            'bg-red-500/20 border-red-500 shadow-red-500/20'
          }`}
        >
          {won ? <Trophy className="w-16 h-16 text-brand-400" /> : draw ? <Sword className="w-16 h-16 text-slate-400" /> : <XCircle className="w-16 h-16 text-red-400" />}
        </motion.div>
        
        <h1 className="text-5xl font-black text-white mb-4 tracking-tighter uppercase">
          {won ? 'Checkmate!' : draw ? 'Stalemate' : 'Defeat'}
        </h1>
        
        {won && !isPractice && (
          <div className="inline-flex items-center gap-3 bg-brand-500/10 text-brand-400 px-6 py-3 rounded-2xl border border-brand-500/30 font-mono font-black text-2xl mb-10 shadow-lg">
            <ArrowUpRight className="w-6 h-6" />
            +${winnings.toFixed(2)}
          </div>
        )}
        {!won && !draw && !isPractice && (
          <div className="inline-flex items-center gap-3 bg-red-500/10 text-red-400 px-6 py-3 rounded-2xl border border-red-500/30 font-mono font-black text-2xl mb-10 shadow-lg">
            <ArrowDownLeft className="w-6 h-6" />
            -${wager.toFixed(2)}
          </div>
        )}
        {isPractice && (
          <div className="inline-flex items-center gap-3 bg-slate-800 text-slate-400 px-6 py-3 rounded-2xl border border-slate-700 font-black text-sm mb-10 uppercase tracking-widest">
            Practice Mode
          </div>
        )}

        {/* Stats Card */}
        <div className="w-full max-w-sm bg-dark-800 border border-slate-700/50 rounded-3xl p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-700/50">
            <div className="text-left">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">New Rating</div>
              <div className="text-3xl font-black text-white font-mono">{elo + eloChange}</div>
            </div>
            <div className={`flex items-center gap-1 font-black text-lg ${eloChange >= 0 ? 'text-brand-500' : 'text-red-500'}`}>
              {eloChange >= 0 ? '+' : ''}{eloChange} ELO
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Accuracy</span>
              <span className="text-white font-black">84.2%</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Best Move</span>
              <span className="text-brand-500 font-black">Nf3+</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 mt-auto">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onRematch}
          className="w-full bg-brand-500 hover:bg-brand-400 text-dark-900 font-black text-xl py-6 rounded-3xl shadow-[0_10px_30px_rgba(34,197,94,0.4)] transition-all uppercase tracking-tighter"
        >
          {isPractice ? 'Play Again' : 'New Duel'}
        </motion.button>
        <button 
          onClick={onHome}
          className="w-full bg-dark-700 hover:bg-dark-600 text-white font-black text-sm py-5 rounded-3xl transition-all uppercase tracking-widest"
        >
          Back to Lobby
        </button>
      </div>
    </motion.div>
  );
}
