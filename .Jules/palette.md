## 2026-05-28 - Added Accessibility to Expand/Collapse Component
**Learning:** In React components containing toggleable UI elements with descriptive supplementary text (e.g., 'click to expand'), combining `aria-expanded` with `aria-hidden='true'` on the descriptive text makes screen reader output much cleaner and less redundant.
**Action:** Always verify if a button using `aria-expanded` contains visual helper text that duplicates the accessibility state, and hide it from screen readers if it does.
