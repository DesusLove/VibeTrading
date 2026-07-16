from typing import Any

"""Pydantic response models shared across API route modules."""


from pydantic import BaseModel, Field


class Artifact(BaseModel):
    """Artifact file metadata."""

    name: str = Field(..., description="File name")
    path: str = Field(..., description="File path")
    type: str = Field(..., description="File type: csv, json, txt, etc.")
    size: int = Field(..., description="Size in bytes")
    exists: bool = Field(..., description="Whether the file exists")


class BacktestMetrics(BaseModel):
    """Backtest summary metrics."""

    model_config = {"extra": "allow"}

    final_value: float = Field(..., description="Ending portfolio value")
    total_return: float = Field(..., description="Total return")
    annual_return: float = Field(..., description="Annualized return")
    max_drawdown: float = Field(..., description="Max drawdown")
    sharpe: float = Field(..., description="Sharpe ratio")
    win_rate: float = Field(..., description="Win rate")
    trade_count: int = Field(..., description="Number of trades")


class RAGSelection(BaseModel):
    """RAG routing result."""

    selected_api: str = Field(..., description="Selected API code")
    selected_name: str = Field(..., description="Selected API name")
    selected_score: float = Field(..., description="Match score")


class RunInfo(BaseModel):
    """Compact run row for list views."""

    run_id: str
    status: str
    created_at: str
    prompt: str | None = None
    total_return: float | None = None
    sharpe: float | None = None
    codes: list[str] = Field(default_factory=list)
    start_date: str | None = None
    end_date: str | None = None


class RunResponse(BaseModel):
    """API response payload for a single run."""


    status: str = Field(..., description="Run status: success, failed, aborted")
    run_id: str = Field(..., description="Run identifier")
    elapsed_seconds: float = Field(..., description="Execution time in seconds")
    reason: str | None = Field(None, description="Failure reason when available")

    planner_output: dict[str, Any | None] = Field(None, description="Planner output")
    strategy_spec: dict[str, Any | None] = Field(None, description="Strategy specification")
    rag_selection: RAGSelection | None = Field(None, description="Selected RAG metadata")

    metrics: BacktestMetrics | None = Field(None, description="Backtest metrics")
    artifacts: list[Artifact] = Field(default_factory=list, description="Run artifacts")
    run_card: dict[str, Any | None] = Field(None, description="Trust Layer run card payload")
    llm_usage: dict[str, Any | None] = Field(None, description="Provider-reported AgentLoop usage summary")

    equity_curve: list[dict[str, Any | None]] = Field(None, description="Equity preview")
    trade_log: list[dict[str, Any | None]] = Field(None, description="Trade preview")

    artifacts_equity_csv: list[dict[str, Any | None]] = Field(None, description="Full equity rows")
    artifacts_metrics_csv: list[dict[str, Any | None]] = Field(None, description="Full metrics rows")
    artifacts_trades_csv: list[dict[str, Any | None]] = Field(None, description="Full trade rows")
    validation: dict[str, Any | None] = Field(None, description="Statistical validation results")

    run_directory: str = Field(..., description="Run directory path")
    run_stage: str | None = Field(None, description="UI-facing run stage")
    run_context: dict[str, Any | None] = Field(None, description="Normalized request context")
    price_series: dict[str, list[Dict[str, Any | None]]] = Field(None, description="Grouped OHLC series")
    indicator_series: dict[str, Dict[str, list[Dict[str, Any | None]]]] = Field(
        None,
        description="Grouped indicator overlays",
    )
    trade_markers: list[dict[str, Any | None]] = Field(None, description="Trade markers for charts")
    run_logs: list[dict[str, Any | None]] = Field(None, description="Structured stdout/stderr lines")