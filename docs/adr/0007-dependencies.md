# ADR 0007 — Task dependencies

GitHub issue dependencies are the link. The later task is blocked by the earlier task. Reconciliation reads `blockedBy`. Adding or removing a predecessor writes that same link back to GitHub. One80Compass does not keep a second list.

The relationship is finish-to-start. The later task starts the day after the earlier task finishes. A date edit that would break that rule does not move the later tasks by itself. The plan shows each proposed move. Approving writes those dates to the GitHub Start and Finish fields. Rejecting writes only the task that was edited and leaves the overlap visible. A task with no dates is not given dates by that approval. The dependencies tab shows it as not scheduled.

A task cannot block itself, and a link that would loop through other tasks is refused.

Schedule baselines are portal snapshots. See ADR 0008.
