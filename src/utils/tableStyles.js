// Shared by MUI tables and the dashboard's native HTML table.
// Print documents use their own stylesheet in a separate document.
export const tableStyles = {
  "& > thead > tr": { backgroundColor: "#E5E7EB" },
  "& > thead > tr > th, & > thead > tr > td": {
    backgroundColor: "#E5E7EB",
    color: "#111827",
    fontWeight: 600,
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  },
  "& > thead > tr > *, & > tbody > tr > *": {
    padding: "12px 16px",
  },
  "& > tbody > tr:nth-of-type(odd)": { backgroundColor: "#FFFFFF" },
  "& > tbody > tr:nth-of-type(even)": { backgroundColor: "#F9FAFB" },
  "& > tbody > tr:nth-of-type(n):hover": { backgroundColor: "#F3F4F6" },
  // Opaque backgrounds keep sticky action cells readable while scrolling.
  "& > tbody > tr > th, & > tbody > tr > td": {
    backgroundColor: "inherit",
  },
};

export const tableComponents = {
  MuiTable: { styleOverrides: { root: tableStyles } },
  MuiTableContainer: {
    styleOverrides: {
      root: { overflowX: "auto", maxWidth: "100%", minWidth: 0 },
    },
  },
};
