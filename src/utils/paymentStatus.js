const paymentStatusColors = {
  paid: '#16A34A',
  unpaid: '#DC2626',
  partial: '#F59E0B',
};

export function paymentStatusStyle(status) {
  const backgroundColor = paymentStatusColors[status];
  return backgroundColor ? { backgroundColor, color: status === 'unpaid' ? '#FFFFFF' : '#111827' } : {};
}
