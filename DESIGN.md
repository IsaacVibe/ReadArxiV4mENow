---
name: RAVEN
description: A calm, evidence-led desktop research workspace.
colors:
  ground: '#f5f3f6'
  surface: '#ffffff'
  surface-alt: '#f0edf2'
  reader: '#faf9fb'
  text: '#2c2730'
  muted: '#645e69'
  border: '#ded8e1'
  control-border: '#8d858f'
  primary: '#924a63'
  primary-hover: '#7e3d54'
  on-primary: '#ffffff'
  primary-soft: '#f4e8ed'
  sage: '#42665c'
  selected: '#eaf2ee'
  selected-border: '#537a75'
  reference: '#365981'
  reference-bg: '#e5edf8'
  focus: '#4b70a2'
  danger: '#b92737'
  danger-soft: '#fcecef'
  warning: '#835b21'
  warning-soft: '#faf0dc'
  dark-ground: '#1d1b22'
  dark-surface: '#25212a'
  dark-surface-alt: '#302b35'
  dark-reader: '#211e26'
  dark-text: '#eee8f0'
  dark-muted: '#bdb3c1'
  dark-border: '#48414f'
  dark-control-border: '#8e8195'
  dark-primary: '#dfa5bd'
  dark-primary-hover: '#edbdd0'
  dark-on-primary: '#2c1c25'
  dark-primary-soft: '#3b2935'
  dark-sage: '#accfc1'
  dark-selected: '#293d36'
  dark-selected-border: '#85b1a4'
  dark-reference: '#b0ccf0'
  dark-reference-bg: '#2b3850'
  dark-focus: '#88abda'
  dark-danger: '#ff9ba9'
  dark-danger-soft: '#432830'
  dark-warning: '#e7bd77'
  dark-warning-soft: '#3d3326'
typography:
  workspace-title:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 23px
    fontWeight: 650
    lineHeight: 1.25
  reader-title:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 21px
    fontWeight: 650
    lineHeight: 1.3
  paper-title:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.75
  body-large:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.75
  body-largest:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.75
  document-title:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.6
  label:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 12px
    fontWeight: 400
  button:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 14px
    fontWeight: 550
    lineHeight: 1.25
  code:
    fontFamily: ui-monospace, 'SFMono-Regular', Consolas, monospace
    fontSize: .86em
  action:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 13px
    fontWeight: 550
  filter:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 16px
    fontWeight: 550
    lineHeight: 1.35
  filter-count:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 14px
    fontWeight: 400
  input:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 14px
    fontWeight: 400
  compact-metadata:
    fontFamily: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif
    fontSize: 11px
    fontWeight: 400
rounded:
  '3': 3px
  '4': 4px
  '5': 5px
  '6': 6px
  '7': 7px
  '8': 8px
  '9': 9px
  '10': 10px
  '12': 12px
spacing:
  '4': 4px
  '6': 6px
  '8': 8px
  '10': 10px
  '12': 12px
  '14': 14px
  '16': 16px
  '18': 18px
  '20': 20px
  '24': 24px
  '28': 28px
  '32': 32px
  '40': 40px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    typography: '{typography.button}'
    rounded: '{rounded.8}'
    padding: 7px 12px
    height: 34px
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    typography: '{typography.button}'
    rounded: '{rounded.8}'
    padding: 7px 12px
    height: 34px
  button-subtle:
    backgroundColor: '{colors.primary-soft}'
    textColor: '{colors.primary}'
    typography: '{typography.button}'
    rounded: '{rounded.8}'
    padding: 7px 12px
    height: 34px
  button-icon:
    textColor: '{colors.muted}'
    rounded: '{rounded.6}'
    padding: 6px
    size: 30px
  button-text:
    textColor: '{colors.primary}'
    rounded: '0'
    padding: 3px 4px
    height: 28px
    typography: '{typography.action}'
  search-field:
    backgroundColor: '{colors.reader}'
    textColor: '{colors.text}'
    rounded: '{rounded.8}'
    padding: 0 12px
    height: 40px
  workspace-navigation:
    backgroundColor: '{colors.surface-alt}'
    rounded: '{rounded.9}'
    padding: 4px
  filter-chip:
    textColor: '{colors.muted}'
    rounded: '{rounded.6}'
    padding: 7px 10px
    height: 38px
    typography: '{typography.filter}'
  paper-row:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    padding: 16px 24px 14px
    typography: '{typography.paper-title}'
  reference-mark:
    backgroundColor: '{colors.reference-bg}'
    textColor: '{colors.reference}'
    rounded: '{rounded.5}'
    padding: 4px 7px
---

# Design System: RAVEN

## Overview

**Creative North Star: "The Annotated Research Desk"**

RAVEN presents a quiet working desk for screening scientific papers and reading their evidence. Berry actions, sage selection and blue references organize attention on cool pale paper; the dark theme recreates the same relationships with plum neutrals rather than simply inverting the light palette.

Compact system-sans controls support dense bilingual metadata. Long-form material receives a wider rhythm, adjustable reading size and restrained section rules. Persistent numbered references connect the working selection to the reading document.

**Key Characteristics:**
- Dense, legible paper rows with stable daily identities.
- A calmer document surface with adjustable reading size.
- Semantic light and dark palettes, shared across every component.
- Flat working surfaces; shadows reserved for floating controls.

This is a scan of the implemented desktop system. `src/index.css` is the runtime authority; the frontmatter records its light primitives and their `dark-` counterparts. The source uses `--radius` for the shared 8px control corner. Component token heights express their observed minimum height unless the component has a fixed height. Product capabilities and evidence-coverage policy belong in `PRODUCT.md`, not the theme.

## Colors

The palette is muted and functional. Every unprefixed color is the light value; `dark-<name>` is the value applied to the same CSS custom property under the dark root attribute. These are paired semantic roles, not two palettes to mix.

### Primary

- **Research Berry** (`primary`, `primary-hover`, `on-primary`, `primary-soft`): primary actions, mode selection, active tabs, text actions and generation feedback. The light primary is the user's berry; the dark primary is a pale berry tuned for plum surfaces.

### Secondary

- **Evidence Sage** (`sage`, `selected`, `selected-border`): selected rows, collection toolbar, summaries and positive coverage feedback. `selected-border` exists in the CSS palette but is currently not applied to rows; do not invent a selection stroke.
- **Reference Blue** (`reference`, `reference-bg`, `focus`): daily identities, session reference markers, category tags, informative feedback and keyboard outlines. Focus remains distinct from selection.

### Tertiary

- **Recovery Ochre** (`warning`, `warning-soft`): recoverable request failures and partial or abstract-only coverage.
- **Error Rose** (`danger`, `danger-soft`): error semantics; the save error uses `danger`. The soft error token is present in the palette but currently has no component assignment.

### Neutral

- **Cool Paper / Plum Ground** (`ground`, `surface`, `surface-alt`, `reader`): app background, controls/library, subdued controls and document background respectively.
- **Research Ink** (`text`, `muted`): principal content and supporting metadata.
- **Rules and Controls** (`border`, `control-border`): quiet section rules and stronger interactive boundaries.

**The Semantic Pair Rule.** Switch complete semantic theme sets; keep action, selection, reference and feedback roles consistent in both themes.

The sidecar's eight-step tonal ramps are synthesized preview strips, not additional runtime palette decisions.

## Typography

**Body and interface font:** the platform system-sans stack recorded in frontmatter, including Chinese fallbacks. There is no separate display face or marketing display scale.

**Code font:** the frontmatter monospace stack. Scientific formula rendering remains supplied by the existing math renderer.

### Hierarchy

- **Workspace title:** the compact library heading; paired with the slightly smaller reader heading.
- **Paper title:** fully wrapping screening title, medium weight and line height (1.55). Do not clamp away title formulas. Supporting authors and identifiers use the label scale; numbers use tabular figures. Screening titles, source titles and one-sentence summaries share the LaTeX renderer.
- **Document title:** used for conversation and overview headings. Source titles use (1.15em), weight (600), line height (1.6), and wrap anywhere.
- **Body:** the reader and user-question blocks default to the standard frontmatter body size. Markdown line height is (1.75); source metadata remains (12px). The header page-scale control scales the entire workspace from (80%) through (200%), including all text, icons, controls, spacing and formulas. It remembers its value in this browser; the old reader-only size control is removed.
- **Label:** common metadata and toolbars; dense secondary badges use (11px), while filter counts and dates use (14px). Main button text uses its own frontmatter role. The RAVEN wordmark is (20px), weight (750), line height (1.2), letter spacing (.035em).

Markdown headings scale relative to body size: h1 (1.6em), h2 (1.35em), h3 (1.15em), all weight (650) and line height (1.5). Heading margins are (1.7em 0 .7em); paragraphs use (.9em 0). Code is (.86em); code blocks use line height (1.65). Do not propagate the compact metadata size into reading prose. The frontmatter body-large and body-largest samples are illustrative type sizes, not separate runtime controls.

## Layout

Keep persistent copy to titles, actions and factual state. Do not add descriptive subtitles, welcome paragraphs, feature steps or duplicate composer instructions. An empty reader has one short heading and one action. Source coverage appears after retrieval; detailed provenance remains expandable per answer.

The application fills the dynamic viewport and keeps the header and composer outside the independently scrolling paper and document regions. At wide desktop sizes the header has a minimum height (76px), padding (14px 24px) and gap (24px). Common pane gutters are (24px); paper rows have frontmatter padding and a (12px) checkbox/content gap. Library and reader headings begin (20px) below their surface top. The date shares the library title row; totals use a single (16px) label.

The screening mode starts with (52fr 8px 48fr) columns; reading mode starts with (32fr 8px 68fr). Changing mode restores that mode's starting split. The divider supports pointer resizing from (28%) to (70%) library share; keyboard arrows adjust by (2 percentage points), Home selects the minimum and End the maximum. The settings reset action reapplies the current mode's starting ratio.

At effective workspace widths up to (1200px), the header gap becomes (14px), its inline padding (18px) and the library/heading row gutters become (20px). At widths below (1100px), the exact container query is `max-width: 1099px`: one work surface is visible, the divider disappears, screening shows the library and reading shows the reader. Container queries account for both window resizing and the page-scale control. The header can wrap. Selection and conversation state persist across the surface switch.

Reading documents have width (100%) with no centered line-width cap and padding (28px 24px 40px), so selected papers, summaries, highlights and conversations use the available pane width. The application compensates its viewport height for CSS zoom so the composer remains visible. Source entries separate with a (28px) margin and (26px) top padding plus a thin rule. Messages separate by (32px). This specification covers desktop and narrow desktop; it adds no mobile acceptance requirements.

## Elevation & Depth

Working surfaces are flat. Background tones and (1px) rules distinguish library, reader, controls, source entries and content states. The only shared shadow belongs to the settings popover and the floating return-to-latest control. Its exact light/dark values are in the sidecar, extracted from `--shadow`.

**The Flat Desk Rule.** Reserve elevation for floating controls; maintain paper rows and documents as continuous working surfaces.

State transitions animate background, text and border colors for (140ms ease-out); the divider animates its rule for the same duration. Loading icons rotate over (1.1s linear infinite). Reduced motion removes both transitions and spinner animation. There are no entrance reveals or decorative motion sequences.

## Shapes

Controls use the small, practical radius scale in frontmatter. Shared buttons and search use the common control corner; filter and icon controls use the smaller control corner. Mode-group and composer shells use the next larger corner. Reference markers use the compact marker corner, metadata tags the smallest corner, checkboxes a compact square corner, user messages/code blocks a modest document corner, and the settings popover the largest corner. The square checkbox remains an actual named input with a visible check. Thin dividers establish document structure; rounded boxes are used for controls and state-bearing content.

## Components

### Buttons

Primary berry actions carry the current task forward. Secondary buttons have a surface fill and stronger control border; subtle buttons use soft berry with a transparent border that becomes primary on hover. All three share the documented button size. Text actions use (13px), weight (550), minimum height (28px) and underline on hover. Icon actions use minimum dimensions (30px), padding (6px), muted ink and a surface-alt hover with primary ink. Disabled buttons use opacity (.48) and a not-allowed cursor; screening paper titles deliberately retain full opacity while disabled.

Global keyboard focus is an outline (2px solid `--focus`) offset (3px). Do not substitute a hover color for this outline.

### Search and fields

The search is fixed at its frontmatter height, with a strong control border and reader background. Its input is (13px); focus applies a (2px) wrapper outline offset (2px). Settings fields use reader background, a (6px) corner, padding (8px 10px), strong control border and (14px) text. The native selects retain readable foreground/background colors in each theme.

The composer uses a (9px) corner, padding (10px 12px), a strong control border, reader fill and the same wrapper focus outline. Its textarea is (14px), line height (1.6), minimum height (42px), vertically resizable to (18vh). Its primary send control is (32px) square. Enter sends, Shift+Enter inserts a new line, and composition events do not send early. Selection and generation state control availability.

### Navigation and filters

The compact mode group uses a surface-alt tray. Its active item has the primary/on-primary pair, while inactive items use muted ink. Reader tabs use a (2px) active underline and primary text, with a (20px) inter-tab gap. Category filters use (16px) labels, (14px) counts, a minimum height of (38px) and wrap with an (8px) gap; selected chips gain primary text, primary border and primary-soft fill. Mode, tab and filter controls expose their pressed state.

### Paper rows and references

Paper rows form a continuous ruled list with no shadow. Hover changes the surface to reader tone; selection uses the sage-tinted selected fill. Each row shows its daily index, truncated screening title, ellipsized author line, arXiv identifier, compact category tags and an external PDF link. The title button opens reading and includes the paper in the selection. Filtering does not renumber the daily identities or discard the existing selection.

Session reference markers use reference-blue ink/fill, tabular numerals and the frontmatter marker corner. Source entries preserve their session number alongside the daily identity; longer source titles and full reading text wrap. Source coverage and request feedback add words and status semantics to their color treatments.

### Popovers and feedback

Settings use a (300px) wide, (20px) padded surface with a (1px) border, largest corner and shared shadow; Escape closes the disclosure. Persistence state sits in the global header. Generation, retry and source-coverage feedback appear beside the affected task. Empty/error states retain a readable heading, explanation and contextual recovery action. Returning to latest appears when the user moves more than (80px) from the conversation end, preserving manual reading position.

Appearance is persisted as light, dark or system. System mode follows the OS preference; the quick theme action explicitly selects the opposite resolved appearance. Reading size is a panel-local preference, separate from global theme and workspace mode.

## Do's and Don'ts

### Do:
- Do bind component colors to the semantic CSS properties and swap the complete dark set together.
- Do keep paper identity, reference numbering and state labels visible alongside color.
- Do preserve the base text hierarchy while scaling the whole workspace together.
- Do preserve keyboard focus, independent pane scrolling and reduced-motion behavior.

### Don't:
- Don't introduce ornamental glass, gradients or decorative imagery into this workspace.
- Don't turn paper rows into lifted cards or recolor selection as the primary action.
- Don't clamp paper titles or reading prose in a way that cuts off scientific formulas.
- Don't treat the desktop documentation as a verified mobile specification.
