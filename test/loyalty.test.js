const { calculateStatus } = require('../src/utils');
function assert(condition, message) { if (!condition) { throw new Error(message); } }
try {
  console.log('Running Loyalty Logic Tests...');
  const level0 = calculateStatus(0);
  assert(level0.current.name === 'Новичок', 'Failed at 0');
  const level15000 = calculateStatus(15000);
  assert(level15000.current.name === 'Ценитель', 'Failed at 15000');
  const level80000 = calculateStatus(80000);
  assert(level80000.current.name === 'Легенда', 'Failed at 80000');
  console.log('✅ All Tests Passed!');
} catch (error) {
  console.error('❌ Test Failed:', error.message);
  process.exit(1);
}
