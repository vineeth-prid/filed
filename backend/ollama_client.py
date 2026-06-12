"""
Ollama local-LLM client for the Filed Insight Engine.

Replaces the Emergent/cloud LLM integration with a self-hosted Ollama instance
running on the same VPS.  No API key required — only the Ollama daemon must
be running and the chosen model downloaded.

Quick setup on the VPS:
    curl -fsSL https://ollama.com/install.sh | sh
    ollama pull llama3.2          # or mistral, phi3, gemma2, etc.
    # Ollama listens on http://localhost:11434 by default.

Set in backend/.env:
    OLLAMA_BASE_URL=http://localhost:11434   (default)
    OLLAMA_MODEL=llama3.2                   (default)
    OLLAMA_TIMEOUT=120                      (seconds)
"""
from __future__ import annotations

import json
import logging
import re

import httpx

from config import settings

logger = logging.getLogger("filed.ollama")


class OllamaError(RuntimeError):
    pass


async def chat(system_prompt: str, user_prompt: str) -> str:
    """
    Send a chat-completion request to the local Ollama daemon.
    Returns the model's reply as a plain string.
    Raises OllamaError on connection failure, timeout, or HTTP error.
    """
    url = f"{settings.ollama_base_url}/api/chat"
    payload = {
        "model": settings.ollama_model,
        "stream": False,
        "options": {
            "temperature": 0.3,    # deterministic enough for factual comparisons
            "num_predict": 512,    # cap output tokens to control latency
        },
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
    except httpx.ConnectError as exc:
        raise OllamaError(
            f"Cannot reach Ollama at {settings.ollama_base_url}. "
            "Make sure the Ollama service is running: `systemctl status ollama`."
        ) from exc
    except httpx.TimeoutException as exc:
        raise OllamaError(
            f"Ollama request timed out after {settings.ollama_timeout}s. "
            "Try a smaller model or increase OLLAMA_TIMEOUT."
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise OllamaError(
            f"Ollama returned HTTP {exc.response.status_code}: {exc.response.text[:200]}"
        ) from exc

    try:
        data = resp.json()
        return data["message"]["content"]
    except (KeyError, ValueError) as exc:
        raise OllamaError(f"Unexpected Ollama response format: {resp.text[:200]}") from exc


async def health_check() -> dict:
    """Return {ok, model, base_url} — useful for the admin dashboard."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            model_ready = any(settings.ollama_model in m for m in models)
            return {
                "ok": True,
                "base_url": settings.ollama_base_url,
                "model": settings.ollama_model,
                "model_ready": model_ready,
                "available_models": models,
            }
    except Exception as exc:
        return {
            "ok": False,
            "base_url": settings.ollama_base_url,
            "model": settings.ollama_model,
            "error": str(exc),
        }


def parse_json_array(text: str) -> list[str]:
    """
    Extract the first JSON array from a text blob.
    Models sometimes wrap the array in prose; this strips it out.
    """
    match = re.search(r"\[.*?\]", text, re.S)
    if match:
        try:
            result = json.loads(match.group(0))
            return [str(s).strip() for s in result if str(s).strip()]
        except json.JSONDecodeError:
            pass
    # Last-resort: parse bullet / numbered lines
    lines = []
    for ln in text.splitlines():
        ln = ln.strip().lstrip("-•*0123456789.) \t")
        if ln:
            lines.append(ln)
    return lines[:5]
