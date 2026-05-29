## 2024-05-29 - [Expandable sections need ARIA attributes]
**Learning:** Found an accordion/expandable pattern in `overview-stats.tsx` that lacked `aria-expanded` and `aria-controls`. The content block was also missing an `id` tying back to `aria-controls`.
**Action:** Applied standard disclosure pattern by providing `aria-expanded` to the toggler button, assigning an `id` to the toggled content, and adding `aria-controls="<id>"` to link them.
