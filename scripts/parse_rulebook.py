#!/usr/bin/env python3
"""Parse the FIBA/FCBQ 2026 rulebook text into a structured JSON model.

Usage:
    python3 scripts/parse_rulebook.py /tmp/regles_nl.txt scripts/rulebook-2026.json

Reads the plain-text output of `pdftotext docs/sources/regles_fcbq_2026.pdf` and emits a
nested model: rules -> articles -> sub-articles, with titles.
"""
import json
import re
import sys

RULE_RE = re.compile(r"^REGLA\s+(?:N[úu]m\.?\s*)?(\d+)\b[ \-–—]*(.*)$", re.IGNORECASE)
ART_RE = re.compile(r"^Art\.\s*(\d+)\s*\.?\s*(.*)$")
SUB_RE = re.compile(r"^(\d+)\.(\d+)\s*\.?\s*$")
PAGE_RE = re.compile(r"^Regles FIBA 2026 .*")
FOOTER_RE = re.compile(r"^(TAULA DE|ANNEX\b|SENYALS\b|L’ACTA\b)")
NUM_ONLY = re.compile(r"^\d+$")


def is_heading_noise(line: str) -> bool:
    if not line:
        return True
    if PAGE_RE.match(line) or NUM_ONLY.match(line):
        return True
    return False


def next_content(lines, i):
    """Return the next non-empty, non-noise line index at or after i."""
    while i < len(lines):
        s = lines[i].strip()
        if s and not NUM_ONLY.match(s) and not PAGE_RE.match(s):
            return i
        i += 1
    return None


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as fh:
        lines = fh.read().splitlines()

    # Skip the front matter (TOC + figure list) up to the first rule in the body.
    body_start = 0
    for idx, line in enumerate(lines):
        if line.strip() == "REGLA Núm. 1 - EL JOC":
            body_start = idx
            break
    lines = lines[body_start:]

    rules = []
    current_rule = None
    current_article = None

    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line:
            continue

        rule_m = RULE_RE.match(line)
        if rule_m and ("REGLA" in line.upper()) and not line.upper().startswith("REGLA Núm. 6 FALTES"):
            num = int(rule_m.group(1))
            title = rule_m.group(2).strip(" -–—")
            if not title:
                j = next_content(lines, i + 1)
                if j is not None:
                    title = lines[j].strip()
            if current_rule is None or current_rule["numero"] != num:
                current_rule = {"numero": num, "titulo": title, "articles": []}
                rules.append(current_rule)
                current_article = None
            continue

        art_m = ART_RE.match(line)
        if art_m and current_rule is not None:
            num = int(art_m.group(1))
            title = art_m.group(2).strip()
            if not title:
                j = next_content(lines, i + 1)
                if j is not None:
                    title = lines[j].strip()
            current_article = {"numero": num, "titulo": title, "apartats": []}
            current_rule["articles"].append(current_article)
            continue

        sub_m = SUB_RE.match(line)
        if sub_m and current_article is not None:
            parts = [p for p in sub_m.groups() if p]
            sub = ".".join(parts)
            # Only accept sub-articles that belong to the current article.
            if parts[0] != str(current_article["numero"]):
                continue
            j = next_content(lines, i + 1)
            title = lines[j].strip() if j is not None else ""
            current_article["apartats"].append({"num": sub, "titulo": title})
            continue

    with open(dst, "w", encoding="utf-8") as fh:
        json.dump({"rules": rules}, fh, ensure_ascii=False, indent=2)

    total_arts = sum(len(r["articles"]) for r in rules)
    total_subs = sum(len(a["apartats"]) for r in rules for a in r["articles"])
    print(f"rules={len(rules)} articles={total_arts} sub-articles={total_subs}")


if __name__ == "__main__":
    main()
