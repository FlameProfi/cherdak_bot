const LOYALTY_LEVELS = [
  { name: 'Новичок', threshold: 0, discount: 5 },
  { name: 'Ценитель', threshold: 15000, discount: 10 },
  { name: 'Мастер', threshold: 40000, discount: 15 },
  { name: 'Легенда', threshold: 80000, discount: 20 },
];

function calculateStatus(totalSpent) {
  let current = LOYALTY_LEVELS[0];
  let next = null;

  for (let i = 0; i < LOYALTY_LEVELS.length; i++) {
    if (totalSpent >= LOYALTY_LEVELS[i].threshold) {
      current = LOYALTY_LEVELS[i];
      next = LOYALTY_LEVELS[i + 1] || null;
    } else {
      break;
    }
  }

  return { current, next };
}

module.exports = {
  LOYALTY_LEVELS,
  calculateStatus
};
