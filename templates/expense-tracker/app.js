import { total, validExpense } from './expenses.mjs';
const expenses = [];
const $ = (id) => document.getElementById(id);
function render() {
  $('total').textContent = total(expenses).toFixed(2);
  $('items').replaceChildren();
  for (const item of expenses) {
    const li = document.createElement('li'),
      name = document.createElement('span'),
      amount = document.createElement('strong');
    name.textContent = item.description;
    amount.textContent = item.amount.toFixed(2);
    li.append(name, amount);
    $('items').append(li);
  }
}
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const description = $('description').value.trim(),
    amount = Number($('amount').value);
  if (!validExpense(description, amount)) {
    $('error').textContent = 'Enter a description and a positive amount.';
    return;
  }
  expenses.push({ description, amount });
  $('form').reset();
  $('error').textContent = '';
  render();
});
$('download').onclick = () => {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(expenses, null, 2)], { type: 'application/json' }),
    ),
    a = document.createElement('a');
  a.href = url;
  a.download = 'expenses.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
