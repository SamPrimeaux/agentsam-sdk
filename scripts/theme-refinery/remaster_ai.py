#!/usr/bin/env python3
"""Provider adapters for the AgentSam theme-remaster pipeline.

Provider SDKs are imported lazily so audit/plan modes need no extra packages.
API keys are read from the environment and are never written to generated files.
"""

from __future__ import annotations

import base64
import json
import os
import re
from pathlib import Path
from typing import Any


class RemasterAIError(RuntimeError):
    pass


def _clean_json(text: str) -> Any:
    value = (text or "").strip()
    value = re.sub(r"^```(?:json)?\\s*", "", value, flags=re.I)
    value = re.sub(r"\\s*```$", "", value)
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise RemasterAIError(f"model did not return valid JSON: {exc}") from exc


def choose_provider(requested: str, kind: str) -> str:
    requested = (requested or "auto").lower()
    if requested in {"openai", "gemini"}:
        return requested
    if requested != "auto":
        raise RemasterAIError(f"unknown {kind} provider: {requested}")

    if kind == "text":
        if os.getenv("OPENAI_API_KEY"):
            return "openai"
        if os.getenv("GEMINI_API_KEY"):
            return "gemini"
    else:
        if os.getenv("GEMINI_API_KEY"):
            return "gemini"
        if os.getenv("OPENAI_API_KEY"):
            return "openai"

    raise RemasterAIError(
        f"no API key available for {kind}; set OPENAI_API_KEY or GEMINI_API_KEY"
    )


def generate_text_json(prompt: str, provider: str = "auto") -> Any:
    provider = choose_provider(provider, "text")

    if provider == "openai":
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RemasterAIError("pip install openai") from exc

        client = OpenAI()
        response = client.responses.create(
            model=os.getenv("OPENAI_TEXT_MODEL", "gpt-6-luna"),
            input=prompt,
        )
        return _clean_json(response.output_text)

    try:
        from google import genai
    except ImportError as exc:
        raise RemasterAIError("pip install google-genai") from exc

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    response = client.models.generate_content(
        model=os.getenv("GEMINI_TEXT_MODEL", "gemini-3.8-flash"),
        contents=prompt,
    )
    return _clean_json(response.text)


def _openai_size(aspect_ratio: str) -> str:
    return {
        "1:1": "1024x1024",
        "4:5": "1024x1280",
        "3:4": "1024x1360",
        "16:9": "1536x864",
        "3:2": "1536x1024",
        "21:9": "1792x768",
    }.get(aspect_ratio, "1536x1024")


def generate_image(
    prompt: str,
    output_path: Path,
    *,
    provider: str = "auto",
    aspect_ratio: str = "3:2",
) -> dict[str, str]:
    provider = choose_provider(provider, "image")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if provider == "openai":
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RemasterAIError("pip install openai") from exc

        model = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2.5-sunburst")
        client = OpenAI()
        result = client.images.generate(
            model=model,
            prompt=prompt,
            size=_openai_size(aspect_ratio),
            quality=os.getenv("OPENAI_IMAGE_QUALITY", "medium"),
        )
        payload = result.data[0].b64_json
        if not payload:
            raise RemasterAIError("OpenAI image response contained no b64_json")
        output_path.write_bytes(base64.b64decode(payload))
        return {"provider": "openai", "model": model}

    try:
        from google import genai
    except ImportError as exc:
        raise RemasterAIError("pip install google-genai") from exc

    model = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    interaction = client.interactions.create(
        model=model,
        input=prompt,
        response_format={
            "type": "image",
            "mime_type": "image/jpeg",
            "aspect_ratio": aspect_ratio,
            "image_size": os.getenv("GEMINI_IMAGE_SIZE", "1K"),
        },
    )
    image = getattr(interaction, "output_image", None)
    if not image or not getattr(image, "data", None):
        raise RemasterAIError("Gemini image response contained no output_image")
    output_path.write_bytes(base64.b64decode(image.data))
    return {"provider": "gemini", "model": model}


def optimize_to_webp(source: Path, destination: Path, *, quality: int = 84) -> tuple[int, int]:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RemasterAIError("pip install Pillow") from exc

    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = image.convert("RGB")
        max_edge = int(os.getenv("THEME_MEDIA_MAX_EDGE", "2400"))
        if max(image.size) > max_edge:
            image.thumbnail((max_edge, max_edge))
        image.save(destination, "WEBP", quality=quality, method=6)
        return image.size


def stock_prompt(
    *,
    theme_name: str,
    demo_brand: str,
    image_direction: str,
    slot_label: str,
    context: str,
    aspect_ratio: str,
) -> str:
    return f"""
Create original stock/editorial photography for a fictional website demo.

Theme: {theme_name}
Fictional demo brand: {demo_brand}
Visual direction: {image_direction}
Asset role: {slot_label}
Page/context: {context}
Aspect ratio: {aspect_ratio}

Requirements:
- polished commercial/editorial photography suitable for a premium website template
- fully fictional scene; no real company identity or recognizable public figure
- no logos, trademarks, watermarks, brand marks, UI screenshots, or copyrighted characters
- no readable text or signage in the image
- no existing customer imagery and no attempt to imitate a named company's campaign
- clean composition with useful negative space where a web layout may overlay copy
- believable materials, lighting, anatomy, and perspective
- avoid generic AI gloss; favor restrained art direction and natural detail
""".strip()
