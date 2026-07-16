from typing import Any

"""MCP preset mention normalization for the WebSocket channel."""



def normalize_mcp_preset_mentions(content: Any, metadata: dict[str, Any] | None = None) -> list[str]:
    """Normalize MCP preset mentions into a stable list of names."""

    del metadata
    if content is None:
        return []
    if isinstance(content, str):
        raw_items = content.replace(",", " ").split()
    elif isinstance(content, (list, tuple, set)):
        raw_items = [str(item) for item in content]
    else:
        raw_items = [str(content)]
    return [item.lstrip("@").strip() for item in raw_items if item and item.strip()]