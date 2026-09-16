# Thoock visual direction

## Canonical references

Thoock's interface should use these sources in this order:

1. **Thoock's existing primary button** defines the primary-action material: dark charcoal, restrained vertical bevel, crisp inner highlight, soft cast shadow, and a tactile pressed state.
2. **[ryuda.me](https://ryuda.me/)** defines the broader material language: compact proportions, layered borders, subtle inset and raised surfaces, warm restrained shadows, and purposeful micro-interactions.
3. **The supplied Sentinel login reference and the latest user-approved Thoock login capture** define the login page's composition only: a focused form on the left, an editorial message near the top of the right panel, and a large application screen entering from the lower-right with an open-laptop perspective.

Generated Thoock concept images are layout-planning artifacts. They are not canonical design-system references and must not override the sources above.

## Guardrails

- Keep Thoock's emerald identity; do not copy the portfolio's beige palette.
- Primary buttons use the shared `button-primary` material and the same 12px control radius as inputs and selects. Pill shapes are reserved for badges, switches, progress indicators, and other compact status controls.
- Raised controls need a visible edge, top highlight, and short cast shadow. Inset controls need a shallow internal shadow.
- Motion should communicate press, selection, loading, or content change. Keep it short and respect reduced-motion settings.
- Login artwork stays subordinate to the form and message. Its screen can crop beyond the viewport; it must not become a framed poster or a literal laptop illustration.

## Component scale

| Token | Size | Usage |
| --- | ---: | --- |
| Compact control | 32px | Small table and toolbar actions |
| Default control | 40px | Buttons, inputs, selects, tabs, and icon actions |
| Large control | 44px | Rare emphasis without changing typography |
| Control radius | 12px | Interactive form controls and buttons |
| Compact radius | 10px | Small controls nested inside toolbars |
| Panel radius | 16px | Cards, dialogs, sheets, and workspace panels |
| Page title | 30px | One primary heading per application page or auth panel |
| Dialog title | 18px | Dialog and sheet headings |
| Section title | 16px | Card and content-section headings |
| Body | 14px | Forms, descriptions, navigation, and table content |
| Caption | 12px | Supporting metadata and secondary labels |

Page code should select a shared component size instead of overriding control height, radius, or font size locally.

## Sidebar

- Expanded width is 256px; collapsed width is 72px.
- Navigation rows use the 44px large-control height, 12px radius, 16px sidebar padding, and 20px icons so the selected surface remains broad like the reference.
- The sidebar itself is an off-white physical surface with a softly lit top edge and a narrow cast shadow at its right boundary.
- The active route uses a three-stop mint face, firm green edge, glossy top highlight, lower bevel, short green-tinted cast shadow, green icon, and semibold label. It should read as a tactile raised control, not as a flat selected-row tint.
- Inactive rows remain quiet. Hover adds shallow elevation; press changes to an inset shadow.
- Dark mode uses brighter neutral navigation labels and a restrained green active highlight; it must never reuse the high-opacity light-mode gloss.
- Collapse is controlled by the shadcn-style sidebar trigger in the application header. The former full-width bottom action is intentionally removed.
- Collapsed navigation uses shadcn tooltips with a directional arrow and readable 14px labels.
- Sidebar tooltips share one component and one spacing scale. The sidebar edge and brand divider are single hairlines; never stack utility borders with decorative shadow lines.
