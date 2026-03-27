# ⚔️ Skill Duel

A real-time, multiplayer competitive gaming platform where players can wager virtual currency on their skills across various mini-games. Built for fast-paced, head-to-head action with a robust matchmaking system and Elo-based rankings.

## 🌟 Features

* **Real-Time Matchmaking:** Instantly connect with opponents based on selected game modes and wager amounts using WebSockets.
* **Custom Wagers:** Bet virtual currency on your skills with predefined tiers ($1, $5, $25) or custom amounts.
* **5 Unique Game Modes:**
  * 🧠 **Trivia:** Test your general knowledge.
  * ⌨️ **Type:** Race to type words the fastest.
  * 🧮 **Math:** Solve quick arithmetic problems.
  * 🧩 **Memory:** Recall patterns and sequences.
  * 📝 **Word:** Unscramble or guess words.
* **Competitive Ranking:** Built-in Elo rating system that adjusts after every match.
* **Player Profiles:** Track win rates, total matches, Elo, and wallet balance.
* **Daily Tournaments:** Compete in massive 100-player pools for large prize pools.
* **Secure Authentication:** Powered by Firebase Auth (Google Sign-In).

## 🏗️ Tech Stack

* **Frontend:** React 18, Vite, Tailwind CSS, Framer Motion (Animations), Lucide React (Icons)
* **Backend:** Node.js, Express.js
* **Real-Time Communication:** Socket.io
* **Database & Auth:** Firebase Firestore, Firebase Authentication

## ⚙️ Architecture

Skill Duel utilizes a Full-Stack architecture running on a single Node.js instance:
1. **Express Server (`server.ts`):** Handles Socket.io connections, matchmaking queues, active match state, and game logic validation.
2. **Vite Middleware:** Serves the React frontend during development and static files in production.
3. **Firebase Integration:** Client-side authentication and persistent storage for user profiles, transaction history, and leaderboards.

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* Firebase Project (Auth & Firestore enabled)

### Environment Variables
Create a `.env` file in the root directory (or use the provided `firebase-applet-config.json` if running in AI Studio):
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Installation & Running
```bash
# Install dependencies
npm install

# Run the development server (Frontend + Backend)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🎮 How to Play
1. **Sign In:** Authenticate using your Google account.
2. **Fund Wallet:** Add virtual funds to your wallet via the Wallet tab.
3. **Select Mode & Wager:** Choose your preferred mini-game and set your wager amount.
4. **Match & Win:** Defeat your opponent in real-time to claim the prize pool and boost your Elo!
