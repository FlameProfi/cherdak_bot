import { Link } from 'react-router-dom';
import BookingModal from '../components/booking/BookingModal';
import BookingPlan from '../components/booking/BookingPlan';
import BookingSidebar from '../components/booking/BookingSidebar';
import FeedbackBanner from '../components/ui/FeedbackBanner';
import useBooking from '../hooks/useBooking';

function BookingPage() {
  const {
    bookingState,
    selectedCode,
    selectedTable,
    sidebarOpen,
    modalOpen,
    form,
    feedback,
    isLoading,
    selectTable,
    closeSidebar,
    openModal,
    closeModal,
    updateField,
    submitBooking
  } = useBooking();

  return (
    <div className="booking-page">
      <FeedbackBanner feedback={feedback} />
      <Link to="/" className="booking-back-link">
        {'<'} назад
      </Link>

      <div className="booking-shell">
        <BookingSidebar
          selectedTable={selectedTable}
          sidebarOpen={sidebarOpen}
          onCloseSidebar={closeSidebar}
          onOpenModal={openModal}
        />

        <BookingPlan
          bookingState={bookingState}
          selectedCode={selectedCode}
          isLoading={isLoading}
          onSelectTable={selectTable}
        />
      </div>

      {modalOpen ? (
        <BookingModal
          selectedTable={selectedTable}
          form={form}
          onCloseModal={closeModal}
          onUpdateField={updateField}
          onSubmitBooking={submitBooking}
        />
      ) : null}
    </div>
  );
}

export default BookingPage;
