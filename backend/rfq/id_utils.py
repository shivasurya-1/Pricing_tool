"""Ports src/lib/id.ts's number-generation helpers exactly."""

import re


def next_rfq_number(existing: list[str]) -> str:
    nums = []
    for n in existing:
        m = re.search(r"(\d+)$", n)
        if m:
            nums.append(int(m.group(1)))
    max_n = max(nums) if nums else 100
    return f"RFQ-2026-{max_n + 1:05d}"


def next_quotation_number(existing: list[str]) -> str:
    nums = []
    for n in existing:
        m = re.search(r"(\d+)$", n)
        if m:
            nums.append(int(m.group(1)))
    max_n = max(nums) if nums else 1000
    return f"Q-2026-{max_n + 1:04d}"
