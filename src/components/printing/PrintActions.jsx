import { useState } from "react";
import { Button } from "@mui/material";
import PrintPreview from "./PrintPreview.jsx";

export default function PrintActions({
  type,
  documentId,
  label = "Print Receipt",
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="small"
        disabled={!window.api?.printing}
        onClick={() => setOpen(true)}
        aria-label={`${label} ${documentId}`}
      >
        {label}
      </Button>
      {open && (
        <PrintPreview
          type={type}
          documentId={documentId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
