"""SM-2 spaced repetition algorithm."""
from datetime import datetime, timedelta, date, timezone
from typing import Optional, Tuple

# Default intervals (days) per level
INTERVALS = [0, 1, 3, 7, 15, 30, 60, 120]


def sm2_review(
    quality: int,
    level: int,
    correct: int,
    incorrect: int,
    last_review: Optional[datetime] = None,
) -> Tuple[int, int, int, datetime, datetime]:
    """
    Apply SM-2 algorithm.

    Returns: (new_level, new_correct, new_incorrect, last_review, next_review)
    - quality 0: reset to level 0, schedule next review for tomorrow
    - quality 1: advance level, schedule at INTERVALS[new_level]
    """
    now = datetime.now(timezone.utc)
    today = now.date()

    if quality == 0:
        new_level = max(0, level - 1) if level > 0 else 0
        new_correct = correct
        new_incorrect = incorrect + 1
        days_until_next = 1
    else:
        new_level = level + 1
        new_correct = correct + 1
        new_incorrect = incorrect
        idx = min(new_level, len(INTERVALS) - 1)
        days_until_next = INTERVALS[idx]

    next_review_date = today + timedelta(days=days_until_next)
    next_review = datetime.combine(next_review_date, datetime.min.time(), tzinfo=timezone.utc)

    return new_level, new_correct, new_incorrect, now, next_review
