# Golden Masters

This directory contains golden master artifacts for regression testing.

## Structure

```
golden-masters/
├── input/          # Input artifacts (approved phase outputs)
│   └── todo-app-brief.md    # Challenger brief for a todo app
├── expected/       # Expected output artifacts (verified by humans)
│   └── todo-app-product-brief.md   # Expected Analyst output
└── README.md       # This file
```

## How It Works

1. **Input**: An approved artifact from phase N.
2. **Expected**: The verified correct output from phase N+1.
3. **Regression test**: Re-run the framework against the input and compare the actual output to the expected output using structural diff.

## Similarity Scoring

The structural diff compares:
- Frontmatter fields present
- Required sections (H2/H3 headings)
- Story/task count similarity (±20% variance allowed)
- Component count
- Table and code block counts

Default threshold: **85% structural similarity**.

## Adding New Golden Masters

1. Place the input artifact in `input/` with a descriptive name.
2. Generate the expected output through the framework.
3. Have a human verify the expected output quality.
4. Place the verified output in `expected/` with a matching name prefix.

Example: `input/ecommerce-brief.md` → `expected/ecommerce-product-brief.md`

## Updating Golden Masters

When the framework legitimately changes its output format:
1. Regenerate expected outputs.
2. Have a human verify the new outputs.
3. Replace the files in `expected/`.
4. Document the change in the commit message.
