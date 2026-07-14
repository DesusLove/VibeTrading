<div align="center">
  <img src="assets/icon.png" width="140" alt="VibeTrading Logo"/>
  <h1>VibeTrading</h1>
  <p><b>AI-native quantitative trading research platform</b></p>

  [![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org)
  [![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
  [![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
  [![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)
  <br>
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square)](https://github.com/DesusLove/VibeTrading/pulls)
  [![GitHub Stars](https://img.shields.io/github/stars/DesusLove/VibeTrading?style=flat-square&logo=github)](https://github.com/DesusLove/VibeTrading/stargazers)
</div>

---

VibeTrading is an **AI-powered trading research platform** that combines LLM agents with quantitative backtesting, factor research, and multi-broker connectivity. Research ideas, discover alpha, and deploy strategies — all through natural language or a real-time web dashboard.

---

## ✨ Features

<details open>
<summary><b>🧠 AI Research Agent</b></summary>
<br>
Chat-driven market analysis, strategy development, and backtesting. Just ask "what factors drive MSFT returns?" or "backtest a mean-reversion strategy on SPY".
</details>

<details>
<summary><b>📊 Alpha Zoo — 460+ Factors</b></summary>
<br>
Pre-built library of academic alpha factors with benchmarks, correlation matrices, and performance attribution — ready to screen, combine, and deploy.
</details>

<details>
<summary><b>🔗 Multi-Broker Trading</b></summary>
<br>
Paper trade across Robinhood, Interactive Brokers, Alpaca, Binance, OKX, Tiger Brokers, and more — all from a unified interface.
</details>

<details>
<summary><b>⚙️ Backtesting Engine</b></summary>
<br>
PIT-safe fundamental data, multi-asset support, Monte Carlo simulation, and factor attribution. Walk-forward validation built in.
</details>

<details>
<summary><b>🐝 Swarm Intelligence</b></summary>
<br>
Deploy multi-agent investment committees, quant desks, and risk committees that debate, vote, and manage portfolios collaboratively.
</details>

<details>
<summary><b>🌐 Data Layer</b></summary>
<br>
18+ free market data sources with automatic failover, intelligent caching, and global coverage — stocks, crypto, FX, futures, and options.
</details>

<details>
<summary><b>📈 Web Dashboard</b></summary>
<br>
Real-time chat, run details, correlation matrices, strategy comparison, and portfolio tracking — built with React 19 and ECharts.
</details>

<details>
<summary><b>💬 IM Channels</b></summary>
<br>
Deploy agents to Telegram, Discord, Slack, WeChat, and 12+ other messaging platforms.
</details>

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     IM Channels (Telegram, Discord, etc.)    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                   Web Dashboard (React 19)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ SSE / REST
┌───────────────────────────▼─────────────────────────────────┐
│              API Server (FastAPI + LangChain)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Research  │  │ Strategy │  │  Risk    │  │  Portfolio │  │
│  │  Agent    │  │  Agent   │  │  Agent   │  │   Agent    │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                 Data & Execution Layer                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  18+     │  │  Alpha   │  │Backtest  │  │  Brokers   │  │
│  │ Sources  │  │   Zoo    │  │ Engine   │  │ (8+)       │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### pip install

```bash
pip install vibe-trading-ai
vibe-trading init
vibe-trading
```

Open **http://localhost:8000** and start researching.

### Docker

```bash
docker compose up
```

### From Source

```bash
git clone https://github.com/DesusLove/VibeTrading.git
cd VibeTrading
pip install -e .
vibe-trading init
vibe-trading
```

### Development Mode

For live reload during development:
```bash
vibe-trading dev  # Backend + frontend with hot reload
vibe-trading setup # Rebuild frontend assets
vibe-trading serve # Production build server
```

---

## 🧱 Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11+, FastAPI, LangChain, LangGraph |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, ECharts |
| **Data** | pandas, NumPy, scikit-learn, DuckDB |
| **Infrastructure** | Docker, SSE streaming, MCP protocol |

--- 

## 📁 Project Structure 

```
agent/         Python backend — API server, MCP tools, CLI, skills, tools
├── src/       Core source code (agents, tools, skills, data layer)
├── cli/       Command-line interface (interactive chat, commands)
├── backtest/  Backtesting engine and utilities
├── skills/    Agent skills (research, strategy, risk, portfolio agents)
├── tests/     Unit and integration tests
└── runs/      Strategy run artifacts and logs

frontend/      React 19 dashboard — chat UI, real-time charts, strategy viewer
├── src/       React components and state management
├── public/    Static assets
└── dist/      Production build (generated by setup)

scripts/       Utility scripts for data ingestion, maintenance, deployment
tools/         Dev tooling — linting, formatting, CI helpers, code generation
wiki/          Documentation site (Markdown-based, GitHub Pages compatible)
```

## 🏗️ Architecture Overview

VibeTrading follows a modular architecture with clear separation of concerns:

1. **Agent Layer** (`agent/src/agent/*`): Specialized AI agents (Research, Strategy, Risk, Portfolio)
2. **Tool Layer** (`agent/src/tools/*`): 100+ tools for data, analysis, execution, and research
3. **Skill Layer** (`agent/src/skills/*`): Domain-specific capabilities (technical analysis, crypto, fundamentals)
4. **Data Layer** (`agent/src/providers/*`): 18+ market data sources with intelligent fallback
5. **Execution Layer** (`agent/src/live/*`): Multi-broker connectivity (Robinhood, IBKR, Alpaca, crypto exchanges)
6. **API Layer** (`agent/src/api/*`): FastAPI endpoints serving the frontend and CLI
7. **Frontend** (`frontend/src/*`): React 19 dashboard with real-time updates via Server-Sent Events

## 🔧 Development Workflow

### Backend Development
```bash
# Start backend API server with auto-reload
vibe-trading dev --backend-only

# Run tests
pytest agent/tests/

# Lint and format
ruff check agent/
ruff format agent/
```

### Frontend Development
```bash
# Start frontend dev server (Vite)
cd frontend && npm run dev

# Build for production
cd frontend && npm run build
```

### Docker Development
```bash
# Development with hot reload
docker compose -f docker-compose.dev.yml up

# Production build
docker compose up --build
```

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">
  <a href="https://github.com/DesusLove/VibeTrading/issues">Report Bug</a> ·
  <a href="https://github.com/DesusLove/VibeTrading/issues">Request Feature</a> ·
  <a href="https://github.com/DesusLove/VibeTrading/pulls">Submit PR</a>
  <br><br>
  <sub>Built with ❤️ for traders who code</sub>
</div>
