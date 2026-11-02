import test from 'node:test';
import assert from 'node:assert/strict';
import { total, validExpense } from './expenses.mjs';
test('adds amounts without a floating-point penny error', () =>
  assert.equal(total([{ amount: 0.1 }, { amount: 0.2 }]), 0.3));
test('empty expense list has zero total', () => assert.equal(total([]), 0));
test('rejects empty descriptions, zero, negative and nonnumeric amounts', () => {
  for (const [d, a] of [
    ['', 2],
    ['x', 0],
    ['x', -3],
    ['x', 'hello'],
  ])
    assert.equal(validExpense(d, a), false);
});
test('accepts a positive expense', () => assert.equal(validExpense('Bus', 2.5), true));
