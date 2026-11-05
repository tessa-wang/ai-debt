# Data schema

The site renders entirely from the JSON files in [`data/`](../data). Adding a
company or a deal never requires touching code: edit the data, run the
validator, commit.

| File | What it holds | Edited |
|---|---|---|
| `companies.json` | Every company on the map | Weekly |
| `deals.json` | Every deal (the arrows) | Weekly |
| `changelog.json` | One entry per weekly update | Weekly |
| `meta.json` | Site-wide "last updated" date and schema version | Weekly |
| `layout.json` | Pinned positions for the biggest companies | Rarely |

The rules below are enforced by [`scripts/validate.py`](../scripts/validate.py),
which runs on every push and pull request.

## Conventions

- **Money** is in **billions of US dollars** as a plain number: `105` means
  $105B, `1250` means $1.25T, `0.5` means $500M.
- **Dates** are `YYYY-MM-DD`, or `YYYY-MM` when only the month is known.
- **IDs** are lowercase slugs: letters, digits and single hyphens
  (`openai`, `nvidia-openai-lease-guarantee`). IDs never change once
  published, because changelog entries and shared links point to them.
- **`"TODO"`** marks a value still to be researched. It is allowed in
  dates and source fields. The validator lists every TODO but does not fail
  unless run with `--no-todo`.
- **Unknown fields** are flagged as warnings, so typos like `ammount_usd_b`
  get caught.

## companies.json

```json
{
  "companies": [
    {
      "id": "openai",
      "name": "OpenAI",
      "kind": "ai_lab",
      "value_usd_b": 852,
      "value_as_of": "2026-03",
      "value_note": "Last priced round (Mar 2026).",
      "parent_id": null,
      "note": "Last priced at $852B. Microsoft holds about 27% after the recapitalization."
    }
  ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | Unique slug. |
| `name` | string | yes | Display name. |
| `kind` | string | yes | `public`, `private` or `ai_lab`. AI labs are drawn as hubs. |
| `value_usd_b` | number or `null` | yes | Market cap (public) or latest valuation (private). `null` draws a dashed outline. |
| `value_as_of` | date or `"TODO"` | yes | When the value was measured. Warns if over a year old. |
| `value_note` | string or `null` | yes | Where the value comes from; required in practice when the value is `null`. |
| `parent_id` | id or `null` | yes | Owning company, e.g. `xai` → `spacex`. Must exist; no loops. Children are drawn next to their parent. |
| `note` | string | yes | One or two sentences on the company's role in the web. |

## deals.json

```json
{
  "deals": [
    {
      "id": "nvidia-openai-lease-guarantee",
      "from": "nvidia",
      "to": "openai",
      "category": "financing",
      "amount_usd_b": 105,
      "amount_note": "up to",
      "status": "signed",
      "date_announced": "2026-04",
      "date_updated": "2026-10-31",
      "summary": "Nvidia guarantees up to $105B of OpenAI's lease obligations on its Ohio data centers.",
      "sources": [
        {
          "title": "Article or filing title",
          "publisher": "Reuters",
          "url": "https://…",
          "date": "2026-04-14"
        }
      ]
    }
  ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `id` | string | yes | Unique slug, by convention `from-to-what`. |
| `from` | company id | yes | Who pays, invests, commits or guarantees. Must exist. |
| `to` | company id | yes | Who receives it. Must exist and differ from `from`. |
| `category` | string | yes | See [categories](#categories). |
| `amount_usd_b` | number or `null` | yes | Headline amount. `null` if undisclosed. Warns above $1T. |
| `amount_note` | string or `null` | yes | Qualifier shown before the amount: `up to`, `about`, `at least`, `over`, `est.`. When `amount_usd_b` is `null`, the note is shown instead (e.g. `undisclosed`, `tens of billions`). |
| `status` | string | yes | See [statuses](#statuses). |
| `date_announced` | date or `"TODO"` | yes | First public report or announcement. Drives the timeline. |
| `date_updated` | date or `"TODO"` | yes | Last time the record changed. Must not be before `date_announced`. |
| `summary` | string | yes | One sentence, **in our own words**, never copied from an article. Warns above 280 characters. |
| `sources` | array | yes | At least one. Each has `title`, `publisher`, `url` (http/https) and `date`. Prefer filings and press releases, then original reporting. |

**Arrow direction** follows the money or the commitment:

| Deal | from → to |
|---|---|
| Equity investment | investor → company |
| Chip purchase or lease | buyer → chipmaker |
| Cloud or compute contract | customer → provider |
| Loan or bond | lender → borrower |
| Guarantee | guarantor → guaranteed party |
| Financed lease | lessee → lessor (the chip owner) |

### Categories

| Value | Meaning | Line |
|---|---|---|
| `chips` | GPU, TPU and custom accelerator purchases or leases | pink, dotted |
| `investment` | Equity stakes, funding rounds, warrants, capacity backstops | green, dashed |
| `cloud` | Cloud capacity or data-centre compute commitments | blue, solid |
| `financing` | Loans, bonds, lease guarantees, financed GPU leases | orange, dash-dot |

### Statuses

| Value | Meaning | Drawn |
|---|---|---|
| `reported` | In the press, not confirmed by the companies | faded |
| `announced` | Publicly announced; terms may not be final | normal |
| `signed` | Binding agreement in place (often visible in filings) | normal |
| `closed` | Completed: money moved or shares issued | normal |
| `cancellable` | Signed, but mostly cancellable on short notice | faded |
| `cancelled` | Called off | hidden unless "Show cancelled" is ticked |

Statuses normally move forward: `reported → announced → signed → closed`.
When the validator is given the previous data (`--previous-ref` or
`--previous-dir`; CI does this automatically), it warns if a deal moves
backwards, if a cancelled deal comes back, or if a deal disappears. Don't
delete deals that fell through: mark them `cancelled` so the history stays.

## changelog.json

```json
{
  "entries": [
    {
      "date": "2026-11-07",
      "headline": "2 new deals, 3 updated, 5 valuations refreshed.",
      "summary": ["One to three plain sentences on what mattered this week."],
      "changes": [
        { "deal_id": "meta-oracle-compute", "change": "added", "note": "New reported deal." },
        { "company_id": "nvidia", "change": "updated", "note": "value $5.2T -> $5.4T" }
      ]
    }
  ]
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `date` | date | yes | The update's date (usually a Saturday). Warns on duplicates. |
| `headline` | string | yes | One line. |
| `summary` | array of strings | no | Bullets for the "What changed this week" box. |
| `changes` | array | yes | Each item has exactly one of `deal_id` or `company_id`, a `change` of `added`, `updated` or `removed`, and a `note`. |

`scripts/diff_deals.py` drafts this entry for you; see
[WEEKLY_UPDATE.md](WEEKLY_UPDATE.md#reviewing-and-publishing).

## meta.json

```json
{ "schema_version": 1, "last_updated": "2026-11-05", "data_as_of": "2026-10-31" }
```

`last_updated` is shown in every page header. Bump it with every update.
`schema_version` changes only if this document changes in a way that
breaks old files.

## layout.json

```json
{ "anchors": { "nvidia": { "x": 0.5, "y": 0.155 } } }
```

Pinned positions for the largest companies, as fractions (0–1) of the map's
width and height. They keep the map recognisable from week to week. Every
other company is placed by the force simulation around them, and the
simulation is deterministic, so the same data always gives the same picture.
On phones the map is portrait and the anchors are transposed (x and y
swapped).

Add an anchor when a new company becomes a major hub. Remove one if the
company leaves the map (the validator warns about anchors for unknown ids).

## Design notes

- **Circle size** uses a square-root scale, so *area* is proportional to value.
- **Line width** uses a square-root scale on `amount_usd_b`; undisclosed
  amounts get the thinnest line.
- **Colour plus pattern.** The four category colours (`#e87ba4`, `#199e70`,
  `#3987e5`, `#d95926`) were checked with a colour-vision-deficiency
  validator against the dark background, comparing every pair: worst
  normal-vision separation ΔE 15.1 and worst red-green (protan/deutan)
  separation ΔE 8.3, both at or above the usual targets (15 and 8).
  Blue-yellow colour blindness (tritanopia) separates some pairs less well
  (ΔE 4.0), and the pink is deliberately a little brighter than usual so it
  glows on the dark background. That is why each category also has its own
  dash pattern, so no information relies on colour alone.
  In Windows high-contrast mode the lines become plain text colour and only
  the patterns remain.
