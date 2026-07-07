const { calculateStatus, buildBookingRequestMessage } = require('../src/utils');
const { formatPhoneForFusion } = require('../src/fusion-api');
function assert(condition, message) { if (!condition) { throw new Error(message); } }
try {
  console.log('Running Loyalty Logic Tests...');
  const level0 = calculateStatus(0);
  assert(level0.current.name === 'Новичок', 'Failed at 0');
  const level15000 = calculateStatus(15000);
  assert(level15000.current.name === 'Ценитель', 'Failed at 15000');
  const level80000 = calculateStatus(80000);
  assert(level80000.current.name === 'Легенда', 'Failed at 80000');

  assert(formatPhoneForFusion('89001234567') === '+79001234567', 'Phone should be normalized with a leading +');
  assert(formatPhoneForFusion('+79001234567') === '+79001234567', 'Phone should preserve the plus prefix');

  const bookingMessage = buildBookingRequestMessage({
    id: 42,
    user_name: 'Иван',
    date: '2026-07-10',
    time: '19:00',
    guests: 4,
    comment: 'У окна'
  });
  assert(bookingMessage.includes('Бронирование #42'), 'Booking message should include booking id');
  assert(bookingMessage.includes('Иван'), 'Booking message should include user name');
  assert(bookingMessage.includes('2026-07-10 19:00'), 'Booking message should include date and time');

  console.log('✅ All Tests Passed!');
} catch (error) {
  console.error('❌ Test Failed:', error.message);
  process.exit(1);
}
