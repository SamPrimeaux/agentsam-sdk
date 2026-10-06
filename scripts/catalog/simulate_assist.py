#!/usr/bin/env python3
"""Developer/reference implementation for the deterministic AgentSam Assist resolver.

The production CLI should implement equivalent behavior in JS/TS against the same JSON.
"""

from __future__ import annotations
import argparse, json
from pathlib import Path


def load(path):
    return json.loads(path.read_text())


def matches(rule, answers):
    for key, expected in rule.get("when", {}).items():
        if answers.get(key) != expected:
            return False
    for key, allowed in rule.get("when_any", {}).items():
        if answers.get(key) not in allowed:
            return False
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    qdata = load(repo / "packages/catalog/assist/questions.json")
    rdata = load(repo / "packages/catalog/assist/rules.json")

    answers = {}
    for q in qdata["questions"]:
        print(f"\n{q['prompt']}")
        for i, (_, label) in enumerate(q["options"], 1):
            print(f"  {i}. {label}")
        while True:
            raw = input("> ").strip()
            try:
                idx = int(raw) - 1
                value, label = q["options"][idx]
                answers[q["id"]] = value
                break
            except Exception:
                print("Choose one of the numbered options.")

    hits = [r for r in rdata["rules"] if matches(r, answers)]
    hits.sort(key=lambda r: r.get("priority", 0), reverse=True)

    result = {
        "answers": answers,
        "recommendations": [
            {"id": r["id"], **r["recommend"], "priority": r.get("priority", 0)}
            for r in hits
        ]
    }

    if args.json:
        print(json.dumps(result, indent=2))
        return 0

    print("\nAgentSam Assist\n")
    if not hits:
        print("No exact deterministic rule matched yet.")
        print("This should produce a safe general recommendation or ask one more bounded question in the production CLI.")
        return 2

    best = hits[0]["recommend"]
    print(f"Recommended: {best['title']}")
    if best.get("why"):
        print("\nWhy:")
        for x in best["why"]:
            print(f"  - {x}")
    if best.get("alternatives"):
        print("\nAlternatives:")
        for x in best["alternatives"]:
            print(f"  - {x}")
    if best.get("start"):
        print("\nStart:")
        for x in best["start"]:
            print(f"  {x}")
    if best.get("learn"):
        print("\nLearn:")
        for x in best["learn"]:
            print(f"  {x}")

    if len(hits) > 1:
        print("\nAlso relevant:")
        for r in hits[1:4]:
            print(f"  - {r['recommend']['title']} ({r['id']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
