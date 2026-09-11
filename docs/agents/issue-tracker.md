# Issue tracker: GitHub

Issues and specs live in `ezadzzz/standby-insights` on GitHub. Use `gh` and verify the repository from the Git remote.

- Read: `gh issue view <number> --comments`; also inspect labels.
- List: `gh issue list --state open --json number,title,body,labels`.
- Create: `gh issue create --title "..." --body-file <file>`.
- Comment: `gh issue comment <number> --body-file <file>`.
- Labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close: `gh issue close <number>` after integrated implementation satisfies acceptance criteria.

Use `--body-file` for multiline issue, comment, and PR text. Publishing to the tracker means creating a GitHub issue. Fetching a ticket means reading its issue, comments, and labels.

**PRs as a request surface: no.**
