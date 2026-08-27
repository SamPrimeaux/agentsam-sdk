"""Unicode micro-animations for Agent Sam terminal output.

All frame sets are padded to a shared width/height so Live redraws do not jump.
"""

from __future__ import annotations


def normalize_frames(raw: list[str]) -> list[str]:
    cleaned = [block.strip("\n") for block in raw]
    rows = [block.split("\n") for block in cleaned]
    height = max(len(lines) for lines in rows)
    width = max(len(line) for lines in rows for line in lines)
    out: list[str] = []
    for lines in rows:
        padded = list(lines) + [""] * (height - len(lines))
        out.append("\n".join(line.ljust(width) for line in padded))
    return out


# Original two-pose walker, expanded into a loopable stride.
WALKER_RAW = [
    """
  ·
  ○
  │╲
  │ ○
  ○ ░
  ░
""",
    """
   ·
   ○
   │╲
  ○  ○
   ░
  ░
""",
    """
    ·
    ○
    │╲
   ○ │
    ○
   ░
""",
    """
     ·
    ○
    ╱│
   ○ │
    ○
    ░
""",
    """
    ·
   ○
   ╱│
  ○  │
   ○ ░
    ░
""",
    """
   ·
  ○
  ╱│
 ○  │
  ○ ░
  ░
""",
    """
  ·
  ○
  │╲
 ○  ○
  ○ ░
  ░
""",
    """
 ·
  ○
  │╲
  │ ○
  ○ ░
 ░
""",
]

# Nucleus pulse — "Agent Sam is thinking"
THINK_RAW = [
    """
  ·     ·
     ○
  ·     ·
""",
    """
  ✦     ·
    (○)
  ·     ✦
""",
    """
  ·     ✦
    (●)
  ✦     ·
""",
    """
    ✦
   ( ◯ )
    ✦
""",
    """
  ✦     ✦
    (●)
  ✦     ✦
""",
    """
  ·     ✦
    (○)
  ✦     ·
""",
]

# Comet used while a ship/index batch is in flight
COMET_RAW = [
    "SAM ·            ═══════>",
    "SAM  ·           ═══════>",
    "SAM   •          ═══════>",
    "SAM    ●         ═══════>",
    "SAM     •        ═══════>",
    "SAM      ·       ═══════>",
    "SAM       ·      ═══════>",
    "SAM        •     ═══════>",
    "SAM         ●    ═══════>",
    "SAM          •   ═══════>",
    "SAM           ·  ═══════>",
    "SAM            · ═══════>",
]

# Braille spinner — dense, cheap, works in most modern terminals
BRAILLE = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

# Moon phases for a quieter heartbeat
MOON = ["○", "◔", "◑", "◕", "●", "◕", "◑", "◔"]

WALKER = normalize_frames(WALKER_RAW)
THINK = normalize_frames(THINK_RAW)
COMET = [line.ljust(max(len(s) for s in COMET_RAW)) for line in COMET_RAW]
