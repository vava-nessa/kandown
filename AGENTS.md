# Agent Instructions

This app is a file-based kandown engine backed by plain markdown.
It installs on the user project with `npx kandown init`.
That installs the CLI Tool and the `.kandown` folder.
Task files in `.kandown/tasks/` are the source of truth; board columns live in `.kandown/kandown.json` under `board.columns`.

If the user mentions **tasks**, **kandown**, **backlog**, or any task-related work — read `AGENT_KANDOWN.md` first to understand how the Kandown task system works.
read the readme.md file for more information.



## editing UI text int he web application : 
- only edit in ENGLISH as the default. 
- if the user request to edit in another language, edit all corresponding language files in `src/lib/i18n/locales/`. 
- The source of truth is english and must always be english, translations needs to be done based on english.
- When the users says "translate all" just compare the english version with a file in the locales folder and translate the missing keys. then proceed to do the same with another language, until you have translated all languages.
