// backend/src/protocols.ts
export const rules = [
  'Always ground in pgvector historical data',
  'Temperature 0.2 for determinism',
  'Require auth context for sensitive CC attacks',
  'No speculate; flag if low confidence'
];