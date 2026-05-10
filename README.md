# pi-harness-factory

Create, switch, and manage persona-based harness profiles for Pi Coding Agent.

## Concept

`pi-harness-factory` turns Pi into a small factory for project-specific harness characters.
Each harness profile defines a persona, allowed tools, safety guards, workflow preferences,
UI status, durable memory hints, recommended Pi packages, and allowed capabilities.

## Representative harness templates

Templates are the top-level agent archetypes. Each template has its own knobs, so users do not build profiles from unlimited free-form text.

- `coder` — implementation agent. Knobs: style strictness, TDD policy, change scope, validation policy.
- `reviewer` — review agent. Knobs: review depth, edit policy, severity format, focus.
- `researcher` — evidence agent. Knobs: citation strictness, source preference, uncertainty policy, artifact policy.
- `devops` — operations agent. Knobs: autonomy level, destructive policy, diagnostic style, deployment policy.
- `pm-writer` — planning/docs agent. Knobs: clarification style, document depth, output policy, technicality.

Template definitions live in `templates/*.template.json`.

Templates can also recommend existing Pi packages. A generated harness stores both `packages.allowed` and `capabilities`, so installing a package is separate from letting a harness use that package's capabilities.

## MVP profiles

- `safe-coder` — cautious everyday implementation mode with safety gates.
- `code-reviewer` — read-only review mode focused on actionable findings.
- `researcher` — evidence-first research mode with uncertainty handling.

## Install

Try from a local checkout without installing permanently:

```bash
pi -e ./
```

Install from GitHub:

```bash
pi install git:github.com/sungwon-kim/pi-harness-factory
```

Install from npm, after publishing:

```bash
pi install npm:pi-harness-factory
```

## Commands

```text
/factory help
/factory list
/factory create
/factory create coder
/factory preview <profile-id>
/factory preview
/factory use <profile-id>
/factory use
/factory switch <profile-id>
/factory <profile-id>
/factory active
```

`/facory` is also registered as a typo alias for `/factory`.

Example:

```text
/factory list
/factory create coder
/factory safe-coder
/factory use safe-coder
/factory switch safe-coder
```

`/factory create coder` asks Coder-specific questions:

- coding style strictness
- TDD policy
- change scope
- validation policy
- optional additional rules

It previews the generated profile before saving, including recommended packages and install commands.

For Coder, the first recommended packages are:

- `pi-lens` for code diagnostics and LSP/lint feedback.
- `context-mode` for large test/build/log output processing.
- `pi-ask-user` for structured clarification questions.

The active project profile is stored at:

```text
.pi/harness-factory/active.json
```

## What the MVP enforces

- Blocks tools listed in the active profile's `tools.blocked`.
- Enforces read-only mode for `write` and `edit` when enabled.
- Asks before sensitive file access, such as `.env`, private keys, credentials, or secrets.
- Asks before dangerous shell commands, such as recursive delete, `sudo`, force push, or `chmod 777`.
- Shows the active harness label in the Pi status area.
- Records recommended packages, allowed packages, and capability bindings in generated profiles.

## Roadmap

- `/factory clone`, `/factory edit`, `/factory delete`.
- Project-local generated extension files.
- Import/export `.harness.json` bundles.
- Preset marketplace/catalog support.
- Optional integration with package managers such as `pi-depo`.
