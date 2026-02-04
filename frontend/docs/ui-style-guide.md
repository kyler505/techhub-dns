# UI Style Guide (Modernization)

This repo is migrating UI styling to token-based Tailwind classes while keeping the existing premium/light look with maroon accents.

Source of truth:
- `frontend/src/index.css` defines the theme CSS variables (e.g. `--background`, `--foreground`, `--accent`, `--border`, `--ring`).
- `frontend/tailwind.config.js` maps Tailwind color names (e.g. `background`, `foreground`, `border`, `ring`, `accent`, `card`) to those variables, plus the `maroon-*` palette.

## Design Tokens (Tailwind)

Prefer token classes over hard-coded Tailwind colors (`slate-*`, `gray-*`, `white`, hex, etc.). Tokens automatically stay in sync with the premium theme.

Common tokens:
- Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-accent`, `bg-primary`, `bg-destructive`
- Text: `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `text-accent-foreground`, `text-destructive`
- Borders/inputs: `border-border`, `border-input`
- Focus rings: `ring-ring`, `ring-offset-background`, plus `focus-visible:ring-*`

When exceptions are OK:
- Data visualization colors (charts) where semantic mapping matters.
- Status-only colors (success/warning) when kept consistent and preferably encapsulated (e.g. `Badge` variants).
- Brand accents using the `maroon-*` palette when you intentionally want the TAMU maroon (don’t mix random slates/grays alongside).
- Third-party embedded UI that is not easily tokenized.

## Primitives (`src/components/ui/*`)

Use these by default instead of styling raw elements:
- `frontend/src/components/ui/button.tsx` (`Button`) for all buttons/links-as-buttons.
- `frontend/src/components/ui/card.tsx` (`Card`, `CardHeader`, `CardTitle`, etc.) for panels/surfaces.
- `frontend/src/components/ui/badge.tsx` (`Badge`) for small status/labels.
- `frontend/src/components/ui/dialog.tsx` (`Dialog*`) for modals.
- `frontend/src/components/ui/tabs.tsx` (`Tabs*`) for tabbed navigation.
- `frontend/src/components/ui/table.tsx` (`Table*`) for tables.

Add a new primitive only when:
- It will be reused in 2+ places (or it wraps an accessibility-heavy pattern).
- It can be fully token-styled (no hard-coded page-specific colors).
- It follows the existing conventions: `forwardRef`, `className` passthrough, `cn(...)`, and `cva(...)` for variants when appropriate.

### Repo-Level Utility Classes

`frontend/src/index.css` includes a few intentionally global utility classes. Use them as-is (don’t fork per-page variants):
- `card-premium` (premium card surface)
- `btn-lift` (subtle hover lift for buttons)
- `glass` (sticky header glass effect)
- `shimmer` (skeleton/loading background)
- `status-live` (live indicator dot)
- `gradient-subtle` (subtle page background)

## Do / Don’t

### Surfaces

Do:
```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">Title</CardTitle>
  </CardHeader>
  <CardContent className="text-sm text-muted-foreground">…</CardContent>
</Card>
```

Don’t:
```tsx
<div className="bg-white border border-slate-200 rounded-lg">…</div>
```

### Typography

Do:
```tsx
<h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
<p className="text-sm text-muted-foreground">Live operational snapshot.</p>
```

Don’t:
```tsx
<h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
<p className="text-sm text-slate-500">Live operational snapshot.</p>
```

### Focus Rings

Do (or rely on `Button`/other primitives which already include this):
```tsx
<input
  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background
             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
/>
```

Don’t:
```tsx
<input className="focus:outline-none" />
```

### Status Colors

Do:
```tsx
<Badge variant="success">Enabled</Badge>
<Badge variant="warning">Needs review</Badge>
<Badge variant="destructive">Failed</Badge>
```

Don’t (ad-hoc, inconsistent shades):
```tsx
<span className="bg-green-400 text-white px-2 py-1 rounded">Enabled</span>
```

For banners/alerts, prefer semantic tokens:
```tsx
<div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
  <p className="font-medium">Failed to load data</p>
</div>
```

### Empty / Error States

Do (clear, low-noise, action when useful):
```tsx
<div className="rounded-lg border border-border bg-card p-6 text-center">
  <p className="text-sm font-medium text-foreground">No delivery runs</p>
  <p className="mt-1 text-sm text-muted-foreground">Create one to start tracking orders.</p>
  <Button className="mt-4">Create run</Button>
</div>
```

Don’t:
```tsx
<div className="text-gray-500">No data.</div>
```

## Accessibility Basics

- Keep keyboard focus visible: use `focus-visible:*` utilities (and don’t remove outlines without replacing them).
- Reduced motion: `frontend/src/index.css` includes a `prefers-reduced-motion` fallback; avoid motion-only affordances and keep page transitions subtle.
- Contrast: prefer `text-foreground` for primary content; use `text-muted-foreground` for secondary/supporting text only.

## New UI Checklist

- Uses token classes for colors (`bg-*`, `text-*`, `border-*`, `ring-*`); avoids `slate-*`/`gray-*`/`bg-white` unless there’s a justified exception.
- Uses existing primitives in `frontend/src/components/ui/*` before introducing new styled elements.
- Focus states work with keyboard (`Tab`), using `focus-visible` ring tokens.
- Empty/loading/error states are present, consistent, and actionable.
- Motion respects reduced-motion users and doesn’t gate important information.
