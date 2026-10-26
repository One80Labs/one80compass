# ADR 0008 — Schedule baselines

A baseline is a portal snapshot of the active tasks and their Start and Finish dates. GitHub stays the source of the live schedule. The snapshot is stored on the baseline record. A task with no dates is stored with empty dates. The snapshot is not rewritten after it is saved.

An administrator creates Baseline 1. That record is approved immediately. An employee proposes each later baseline with an explanation. The proposal captures the plan at that moment. An administrator approves it, which assigns the next number, or rejects it with an explanation. Approved baselines stay, including the ones between the original and the latest. A rejected proposal stays as a record and is not a numbered baseline.

Comparison is against Baseline 1 or the latest approved baseline. A task with no dates in the snapshot and both dates now is Newly scheduled. A task that is not in the snapshot is Added after baseline. A task in the snapshot that is no longer on the plan is Removed since baseline. A task that already had dates does not get a day-count variance when those dates move. Removed tasks stay out of the progress calculation.
