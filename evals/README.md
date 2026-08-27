# Agent usability eval

This eval measures whether a coding agent can discover the public SDK from the
installed package without reading SDK source files.

Give the agent the ten prompts in `tasks.json` and ask it to write one
TypeScript file per task, named `<task-id>.ts`. The agent may inspect package
declarations and the package README, but not `src`, `openapi`, tests, generator
code, or the reference answers.

Score an answer directory with:

```bash
pnpm build
node scripts/score-agent-eval.mjs path/to/answers
```

The scorer reports two independent results per task:

- `compile`: the answer type-checks against the published package entrypoint.
- `semantic`: lightweight required/forbidden markers indicate that it used the
  intended resource, terminal operation, and behavior.

The semantic checks are intentionally conservative heuristics, not a substitute
for human review. Review incorrect answers for invented methods, raw HTTP paths,
snake-case options, misunderstood references, eager pagination, and branching
on error messages.

`evals/reference` is a checked-in 10/10 baseline that proves the tasks and
scorer remain compatible with the current package. It is not an agent score.
