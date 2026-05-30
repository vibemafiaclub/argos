
## 2024-05-30 - [Memoizing List Components in react-window]
**Learning:** Virtualized lists (`react-window`) still re-render internal `Row` components when their parent updates. If the rows are complex or numerous (e.g. `EventList`), rendering them frequently can still cause performance degradation.
**Action:** Use `React.memo` with a custom comparator (e.g. `areEqual` from `react-window`) for rows passed to virtualized lists to stop unnecessary re-renders. Also apply `React.memo` to deeply nested simple row components like `StatListRow` if they are rendered frequently without prop changes.
