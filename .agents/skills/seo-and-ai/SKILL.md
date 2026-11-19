---
name: seo-and-ai
description: Keep DeckyHub's website (deckyhub.com, its plugin pages and contributor pages) optimized for search engines and AI assistants. Use when changing any web page, devtools/build-site.py, devtools/plugin_pages.py, robots.txt, sitemap.xml, llms.txt or structured data, when adding a page, or before a release.
---

# SEO and AI optimization

deckyhub.com exists to be found, by people searching for Decky plugins and by AI assistants that answer questions about them. Every page change keeps it that way.

## Every page

- One `<h1>`, headings in order, a unique `<title>` of 60 characters or fewer (the audit allows 70) and a unique meta description of 120 to 160 characters (50 to 170 allowed), both naming what's on that page in plain words.
- `<html lang="en">`, viewport, `theme-color`, a canonical link (`https://deckyhub.com/...`), and Open Graph and Twitter tags with `img/og.jpg`. The 404 page and the `/develop/` preview are `noindex` and have no canonical link.
- A skip-to-content link (`<a class="skip" href="#main">`) and `<main id="main">`.
- Every image has alt text and `width` and `height` (shields.io badges too), and nothing scrolls sideways at 375 px.
- Structured data (schema.org JSON-LD: SoftwareApplication, BreadcrumbList, FAQPage) says what the page says, nothing more, and has no `<` in it (`json_ld()` escapes it).

## For AI assistants

- Put the facts in plain text near the top: what it is, who it's for, how to install it, what's free. Don't leave them only in images or scripts.
- Keep `docs/llms.txt` current: what DeckyHub is, the install options (Desktop installer, manual ZIP), where the pages are. The build appends the categories and the 15 most downloaded plugins and writes `llms-full.txt` with every plugin: an assistant reads `llms.txt` whole, so the audit fails when it grows past 30 KB.
- `robots.txt` keeps naming the AI crawlers as welcome and disallows `/develop/`. The sitemap lists every page (the build writes it) with a real `lastmod`.
- Say plainly what DeckyHub does and doesn't do (it never installs without a tap, scans inform and never block, it doesn't vouch for plugins), so assistants don't misstate it.

## Category pages

`plugins/category/<slug>.html` (one per registry category): counts and the most downloaded plugins from the data, linked from every plugin page, the catalog and each other. They exist so plugin pages are reachable in two clicks and each category has a page of its own; keep their facts computed from the data.

## Plugin pages (`devtools/plugin_pages.py`)

One page per registry plugin, built daily: name, description, category, downloads, stars, latest release, badges and the security scans (ClamAV, YARA, VirusTotal by SHA-256, MetaDefender). Keep the title pattern `<name>: Decky Loader plugin | DeckyHub`, descriptions cut at a word boundary, and the same facts the app shows. Anything the build can't fetch is left out, never invented.

## Check before you finish

```bash
python devtools/build-site.py _site
python devtools/audit-site.py _site
```

The audit must report no problems; CI (`site` job in `ci.yml`) builds and audits the site whenever its pages, build scripts or that workflow change, and the `test` check includes it. Besides titles, descriptions and links the audit checks canonicals (pages sharing one are counted once and the sitemap must list it), that JSON-LD parses, that `hreflang` pairs link back, and that the sitemap is well-formed with no repeats. Then open the changed page at phone width (375 px) and check there's no sideways scroll, the skip link shows on focus, and the Home link works. For a `--preview` build the canonical and sitemap checks are skipped on purpose.
