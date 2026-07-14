<p align="center">
  <img src="assets/icon.png" width="120" alt="Vibe-Trading Logo"/>
</p>

<h1 align="center">VibeTrading</h1>

<p align="center">
  <b>AI-powered quantitative trading research platform</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Backend-FastAPI-009688?style=flat" alt="FastAPI">
  <img src="https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=flat&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat" alt="License">
</p>

---

## Overview

VibeTrading is an AI-native trading research platform that combines LLM-powered agents with quantitative backtesting, factor research, and multi-broker connectivity. Research ideas, run alpha analysis, deploy strategies — all through natural language conversation or the web dashboard.

### Key Features

- **AI Research Agent** — conversational interface for market analysis, strategy development, and backtesting
- **Alpha Zoo** — 460+ academic factors with benchmarks and correlation analysis
- **Multi-Broker Trading** — paper trading via Robinhood, IBKR, Alpaca, Binance, OKX, Tiger, and more
- **Backtesting Engine** — PIT-safe fundamental data, multi-asset support, Monte Carlo attribution
- **Swarm Intelligence** — multi-agent investment committees, quant desks, and risk committees
- **Data Layer** — 18+ free market data sources with automatic fallback, caching, and global coverage
- **Web Dashboard** — real-time chat, run detail, correlation matrix, strategy comparison
- **IM Channels** — Telegram, Discord, Slack, WeChat, and 12 other messaging adapters

### Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, LangChain, LangGraph |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, ECharts |
| Data | pandas, numpy, scikit-learn, DuckDB |
| Infrastructure | Docker, SSE streaming, MCP protocol |

## Quick Start

```bash
pip install vibe-trading-ai
vibe-trading init
vibe-trading
```

Open http://localhost:5899 in your browser.

For Docker:

```bash
docker compose up
```

## Project Structure

```
agent/           — Python backend (API server, MCP, CLI)
frontend/        — React web dashboard
scripts/         — Utility scripts
tools/           — Development tooling
wiki/            — Documentation site
```

## License

MIT
