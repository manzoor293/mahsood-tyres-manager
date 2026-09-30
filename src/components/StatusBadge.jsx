import { Chip } from "@mui/material";
import { paymentStatusStyle } from "../utils/paymentStatus.js";

export default function StatusBadge({ status, label = status, sx, ...props }) {
  return (
    <Chip
      {...props}
      size="small"
      label={label}
      sx={[
        {
          height: "auto",
          borderRadius: "7px",
          verticalAlign: "middle",
          maxWidth: "100%",
          fontSize: "12px",
          fontWeight: 600,
          lineHeight: 1.25,
          textTransform: "uppercase",
          "& .MuiChip-label": {
            padding: "4px 8px",
            whiteSpace: "normal",
            overflowWrap: "normal",
            textAlign: "center",
          },
          ...paymentStatusStyle(status),
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}
