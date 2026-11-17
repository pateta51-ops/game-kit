{
  "checkScript": "check:chain",
  "first": ["test"],
  "lanes": [["lint", "typecheck"], ["kit:check", "ci:check", "repo-gate"], ["build", "size"]],
  "extra": [],
  "pr": { "first": [], "lanes": [["lint"], ["typecheck"]] },
  "timeoutMinutes": 30,
  "graceSeconds": 20
}
