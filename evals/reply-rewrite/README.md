# Reply rewrite

This entry prepares requests and grades imported responses. It does not invoke Pi,
read credentials, or call a paid model. The requests import the current production
prompt. Cases are synthetic examples of the preservation requirements in the
approved reply-rewrite task; they are not captured user data.

| Target             | Provider     | Model         | Thinking | Requested tier |
| ------------------ | ------------ | ------------- | -------- | -------------- |
| Production rewrite | openai-codex | gpt-6.1-terra | max      | priority       |

From `evals/`, prepare one case first:

```powershell
node reply-rewrite/run.ts --out $env:TEMP/rewrite-eval --case conditions-and-uncertainty --samples 1
```

After the production runner is connected, the main agent can submit each row's
`sourceText` and `systemPrompt` through that runner. Keep `caseId` and `sample` in
the result rows. Import a JSONL file with `{caseId, sample, text, model,
actualServiceTier?}` using `--responses <file>`. `--model`, `--custom-prompt`,
`--case <comma-separated-ids>`, `--samples`, and `--baseline <earlier-output-dir>`
control the prepared run and comparison. The default is three samples per case.

The grader checks protected Markdown and selected literal values. Its passing
result does not prove semantic fidelity. A person must apply each case's rubric
and mark a case failed when at least half its samples lose or change a required
meaning. Compare baseline and candidate on the same model and settings. Include
the ordinary clear control case to catch unnecessary expansion. Record actual
runner usage and cost with the imported results; preparation costs zero.

Add a case before changing the prompt. Give it a source, a concrete preservation
rubric, and only the literal checks that help detect that failure. Real-model
baseline and candidate runs remain necessary before claiming prompt quality.
