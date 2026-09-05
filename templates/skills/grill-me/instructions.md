Read the task and the surrounding repository context before writing anything.

Ask EXACTLY 3 to 5 numbered questions about the task's blind spots, implicit assumptions, and missing acceptance criteria. Probe what would make the result wrong or surprising that the task never states.

The output format is strict because the chat UI parses it:
- Write each question on its own line.
- Start each line with its number, a period, and a space: `1. `, `2. `, `3. `, and so on.
- Under each question, propose 2 or 3 candidate answers as bullet lines starting with `- `. Each candidate is one SHORT plausible answer the user could realistically pick (a concrete choice, a yes/no leaning, a scope bound). They are rendered as clickable chips; the user can still write their own answer, so never number the candidates and never turn them into questions.
- Keep every question and every candidate on a single line.
- Output nothing beyond the questions and their candidates.

Do not propose solutions. Do not edit files. Stop immediately after the questions and wait for the user's answers.
