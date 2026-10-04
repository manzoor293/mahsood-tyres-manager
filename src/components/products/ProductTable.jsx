import { pairPrice, stockLabel } from '../../utils/units.js';
import StatusBadge from "../StatusBadge.jsx";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { formatPrice } from "../../utils/catalog.js";

export default function ProductTable({
  rows,
  onEdit,
  onActivate,
  onDeactivate,
  busy,
}) {
  return (
    <TableContainer
      sx={{ maxHeight: "60vh" }}
      tabIndex={0}
      aria-label="Products table, scroll for more columns"
    >
      <Table
        stickyHeader
        size="small"
        aria-label="Products"
        sx={{
          minWidth: 1450,
        }}
      >
        <TableHead>
          <TableRow>
            {[
              "SKU",
              "Brand",
              "Model",
              "Size",
              "Category",
              "Pattern",
              "Tyre Type",
              "Selling Price / Pair",
              "Current Stock",
              "Minimum Stock",
              "Status",
              "Actions",
            ].map((label) => (
              <TableCell
                key={label}
                align={
                  ["Selling Price / Pair", "Current Stock", "Minimum Stock"].includes(
                    label,
                  )
                    ? "right"
                    : "left"
                }
                sx={label === "Actions" ? { right: 0, zIndex: 3 } : {}}
              >
                {label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((product) => (
            <TableRow
              key={product.id}
              hover
              data-product-id={product.id}
              sx={{ opacity: product.active ? 1 : 0.75 }}
            >
              <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>
                {product.sku}
              </TableCell>
              {[
                product.brand_name,
                product.model,
                product.size,
                product.category_name,
                product.pattern,
                product.tyre_type,
              ].map((value, index) => (
                <TableCell
                  key={index}
                  sx={{ maxWidth: 220, overflowWrap: "anywhere" }}
                >
                  {value || "—"}
                </TableCell>
              ))}
              <TableCell
                align="right"
                sx={{
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {pairPrice(product) === null ? "Unavailable" : formatPrice(pairPrice(product))}
              </TableCell>
              <TableCell
                align="right"
                sx={{
                  color:
                    product.stock_quantity <= product.minimum_stock
                      ? "#b45309"
                      : "text.primary",
                  fontWeight: 600,
                }}
              >
                {stockLabel(product.stock_quantity)}
              </TableCell>
              <TableCell align="right">{stockLabel(product.minimum_stock)}</TableCell>
              <TableCell>
                <StatusBadge
                  size="small"
                  label={product.active ? "Active" : "Inactive"}
                  color={product.active ? "success" : "default"}
                  variant="outlined"
                />
              </TableCell>
              <TableCell
                sx={{
                  whiteSpace: "nowrap",
                  position: "sticky",
                  right: 0,
                  bgcolor: "inherit",
                  borderLeft: "1px solid #e2e8f0",
                }}
              >
                <Button
                  size="small"
                  onClick={() => onEdit(product)}
                  disabled={busy}
                  aria-label={`Edit ${product.sku}`}
                >
                  Edit
                </Button>
                {!product.active && (
                  <Button
                    size="small"
                    disabled={busy}
                    onClick={() => onActivate(product)}
                    aria-label={`Activate ${product.sku}`}
                  >
                    Activate
                  </Button>
                )}
                {Boolean(product.active) && (
                  <Button
                    size="small"
                    color="warning"
                    disabled={busy}
                    onClick={() => onDeactivate(product)}
                    aria-label={`Deactivate ${product.sku}`}
                  >
                    Deactivate
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
