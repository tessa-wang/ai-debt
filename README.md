# The AI Money Web

**An interactive, weekly-updated map of the money flowing between the companies building AI.**

🔗 **Live site:** https://tessa-wang.github.io/ai-debt/
---

## What this is

AI companies are increasingly financing each other. Chipmakers invest in their customers, AI labs sign multi-hundred-billion-dollar cloud contracts, and data centers are funded with debt, guarantees and GPU leases. Many analysts call this *circular financing*.

This site tracks those relationships in one diagram and updates it every week as new deals are announced, closed, changed or cancelled.

## Features

- **Interactive network diagram.** Companies are sized by market value or latest private valuation. Arrows show the direction money or commitments flow.
- **Four deal types.** Chips and hardware, equity investments, cloud and compute contracts, and debt, guarantees and leases. Each has its own colour and line style.
- **Company panels.** Click any company to see every deal going in and out, with amounts, status and sources.
- **Timeline slider.** Watch the web grow month by month.
- **Weekly changelog.** See exactly what changed each week.
- **Sources on every deal.** Each relationship links to the reporting or filing behind it.

## How it works

```
Weekly research  →  Python validation  →  Human review  →  Published site
(Claude, Saturdays)   (scripts/)          (pull request)    (GitHub Pages)
```

1. **Research.** Every Saturday, an AI research task reviews the week's news and SEC filings and drafts updates to the data files.
2. **Validation.** Python scripts check the update for errors, such as unknown companies, missing sources or implausible amounts, and generate a changelog entry from the differences.
3. **Review.** A person reviews the changes before they go live.
4. **Publish.** Merging the update republishes the site automatically through GitHub Pages.

## Tech stack

| Layer | Tools |
|---|---|
| Data pipeline | Python 3 (standard library only) |
| Visualization | JavaScript, D3.js |
| Data | JSON files in `data/` |
| Hosting and CI | GitHub Pages, GitHub Actions |

## Project structure

```
├── index.html          Main interactive diagram
├── changelog.html      Weekly changes
├── about.html          Methodology and limitations
├── assets/             CSS and JavaScript
├── data/
│   ├── companies.json  Companies and valuations
│   ├── deals.json      Every deal, with status and sources
│   └── changelog.json  Weekly change history
├── scripts/
│   ├── validate.py     Checks data before publishing
│   └── diff_deals.py   Drafts the weekly changelog
└── docs/               Data schema and weekly update instructions
```

## Run it locally

```bash
git clone https://github.com/tessa-wang/ai-debt.git
cd ai-debt
python3 -m http.server 8000
```

Then open http://localhost:8000. A local server is needed because browsers block loading the data files directly from your disk.

To check the data:

```bash
python3 scripts/validate.py
```

## Limitations

- **Reported vs. confirmed.** Some deals are based on news reports rather than official filings. These are marked "reported" and drawn faded.
- **Values change daily.** Market values are snapshots as of the date shown on the site.
- **Not financial advice.** This is an educational project and should not be used to make investment decisions.

See the [About page](https://tessa-wang.github.io/ai-debt/about.html) for the full methodology.

## Credits

Built by **[Tessa Wang](https://github.com/tessa-wang)** and **[YOUR NAME](https://github.com/YOUR-USERNAME)**.

Inspired by Bloomberg's 2025 graphic of circular AI financing.

## License

[MIT](LICENSE)
