export function total(expenses) {
  return expenses.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100;
}
export function validExpense(description, amount) {
  return (
    typeof description === 'string' &&
    description.trim().length > 0 &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0
  );
}
