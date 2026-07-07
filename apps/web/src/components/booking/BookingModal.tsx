import type { ChangeEvent, FormEvent } from 'react';
import { formatDateTimeLabel, seatWord } from '../../shared/constants';
import type { BookingForm, BookingTable } from '../../types';

interface BookingModalProps {
  selectedTable: BookingTable | null;
  form: BookingForm;
  onCloseModal: () => void;
  onUpdateField: (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  onSubmitBooking: (event: FormEvent<HTMLFormElement>) => void;
}

function BookingModal({
  selectedTable,
  form,
  onCloseModal,
  onUpdateField,
  onSubmitBooking
}: BookingModalProps) {
  if (!selectedTable) return null;

  return (
    <div className="modal-overlay" onClick={onCloseModal}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-kicker">Онлайн-бронирование</div>
            <div className="modal-title">Стол {selectedTable.label}</div>
            <p className="modal-subtitle">
              На {selectedTable.seats} {seatWord(selectedTable.seats)}
            </p>
            {selectedTable.next_booking_at ? (
              <p className="modal-note">
                Следующая бронь: {formatDateTimeLabel(selectedTable.next_booking_at)}
              </p>
            ) : (
              <p className="modal-note">Сейчас стол доступен для новой брони.</p>
            )}
          </div>
          <button className="close-modal" type="button" onClick={onCloseModal}>
            ×
          </button>
        </div>

        <form className="modal-form" onSubmit={onSubmitBooking}>
          <div className="modal-grid">
            <input name="date" type="date" value={form.date} onChange={onUpdateField} required />
            <input name="time" type="time" value={form.time} onChange={onUpdateField} required />
          </div>
          <input
            name="name"
            type="text"
            value={form.name}
            onChange={onUpdateField}
            placeholder="Имя гостя"
            required
          />
          <input
            name="phone"
            type="tel"
            value={form.phone}
            onChange={onUpdateField}
            placeholder="Телефон для подтверждения"
            required
          />
          <div className="modal-grid">
            <select name="guests" value={form.guests} onChange={onUpdateField} required>
              <option value="">Количество гостей</option>
              <option value="1">1 гость</option>
              <option value="2">2 гостя</option>
              <option value="3">3 гостя</option>
              <option value="4">4 гостя</option>
              <option value="5">5 гостей</option>
              <option value="6">6 гостей</option>
            </select>
            <div className="modal-hint-card">
              <strong>Важно</strong>
              <span>Стол блокируется ближе ко времени визита, поэтому до этого за ним могут сидеть другие гости.</span>
            </div>
          </div>
          <textarea
            name="comment"
            value={form.comment}
            onChange={onUpdateField}
            placeholder="Комментарий: праздник, пожелания по посадке, детский стул и т.д."
          />
          <button className="modal-submit" type="submit">
            Отправить заявку на бронь
          </button>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;
