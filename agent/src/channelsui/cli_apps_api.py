from typing import Any

"""CLI app mention normalization for the WebSocket channel."""



def normalize_cli_app_mentions(content: Any, metadata: dict[str, Any] | None = None) -> list[str]:
    """Normalize CLI app mentions into a stable list of names."""

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