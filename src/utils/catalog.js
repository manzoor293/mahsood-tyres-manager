export async function catalogRequest(request) {
  const result = await request();
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    throw error;
  }
  return result.data;
}

export function catalogApi() {
  if (!window.api?.products) throw new Error('Open Mahsood Tyre Manager in the desktop application to manage products.');
  return window.api;
}

export function priceInput(paise) {
  return `${Math.trunc(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
}

export function parsePrice(value) {
  const input = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(input)) return null;
  const [rupees, fraction = ''] = input.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function formatPrice(paise) {
  return `Rs. ${new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2,
  }).format(paise / 100)}`;
}
