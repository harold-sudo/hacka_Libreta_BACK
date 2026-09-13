export type Frequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

/** Interest is a one-time percentage of principal. All arithmetic uses cents. */
export function calculateLoan(
  capital: number,
  interestRate: number,
  count: number,
) {
  if (
    !Number.isFinite(capital) ||
    capital <= 0 ||
    capital > 999999999.99 ||
    !Number.isFinite(interestRate) ||
    interestRate < 0 ||
    interestRate > 1000 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 52
  )
    throw new Error(
      'Revisa capital, interés (0–1000%) y número de cuotas (1–52).',
    );
  const cents = BigInt(Math.round(capital * 100));
  const rate = BigInt(Math.round(interestRate * 100));
  const interest = (cents * rate + 5000n) / 10000n;
  const total = cents + interest;
  const n = BigInt(count);
  if (cents < n)
    throw new Error('El capital debe permitir al menos 0,01 por cuota.');
  const amounts = Array.from(
    { length: count },
    (_, i) => Number(total / n + (BigInt(i) < total % n ? 1n : 0n)) / 100,
  );
  const principals = Array.from(
    { length: count },
    (_, i) => Number(cents / n + (BigInt(i) < cents % n ? 1n : 0n)) / 100,
  );
  if (amounts[0] > 999999999.99)
    throw new Error('El importe por cuota supera el máximo permitido.');
  return {
    interest: Number(interest) / 100,
    total: Number(total) / 100,
    amounts,
    principals,
  };
}

/** Monthly dates keep the original day, clamped to the target month's end. */
export function installmentDate(
  start: string,
  frequency: Frequency,
  index: number,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start))
    throw new Error('Introduce una fecha válida.');
  const date = new Date(start + 'T00:00:00.000Z');
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== start
  )
    throw new Error('Introduce una fecha válida.');
  if (frequency === 'MONTHLY') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + index);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  } else {
    const days = { DAILY: 1, WEEKLY: 7, BIWEEKLY: 14 }[frequency];
    if (!days) throw new Error('Frecuencia inválida.');
    date.setUTCDate(date.getUTCDate() + days * index);
  }
  return date.toISOString().slice(0, 10);
}
