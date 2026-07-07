import { formatDateTimeLabel, seatWord } from '../../shared/constants';
import type { BookingTable } from '../../types';

interface BookingSidebarProps {
  selectedTable: BookingTable | null;
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  onOpenModal: () => void;
}

function BookingSidebar({
  selectedTable,
  sidebarOpen,
  onCloseSidebar,
  onOpenModal
}: BookingSidebarProps) {
  return (
    <>
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={onCloseSidebar}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-card">
          <button className="sidebar-close" type="button" onClick={onCloseSidebar}>
            ×
          </button>
          <div
            className={`sidebar-image ${selectedTable?.photo ? 'has-photo' : ''}`}
            style={selectedTable?.photo ? { backgroundImage: `url(${selectedTable.photo})` } : undefined}
          >
            <span className="sidebar-image-label">
              {selectedTable ? `Стол ${selectedTable.label}` : 'Выберите стол'}
            </span>
          </div>
          <div className="sidebar-body">
            <div className="sidebar-title">
              {selectedTable ? `Стол ${selectedTable.label}` : 'Выберите стол'}
            </div>
            <div className="sidebar-subtitle">
              {selectedTable
                ? `${selectedTable.seats} ${seatWord(selectedTable.seats)}`
                : 'Нажмите на стол на схеме'}
            </div>

            <div className="sidebar-info">
              <div>
                <strong className={selectedTable?.status === 'available' ? 'good' : 'bad'}>
                  {selectedTable
                    ? selectedTable.status === 'available'
                      ? 'Свободно'
                      : 'Занято'
                    : '—'}
                </strong>
                <small>Текущий статус</small>
              </div>
            </div>

            {selectedTable ? (
              <div className="sidebar-timeline">
                <div>
                  <strong>
                    {selectedTable.status === 'reserved'
                      ? formatDateTimeLabel(selectedTable.occupied_until || selectedTable.reserved_until)
                      : formatDateTimeLabel(selectedTable.next_booking_at)}
                  </strong>
                  <small>
                    {selectedTable.status === 'reserved' ? 'Предположительно освободится' : 'Следующая бронь'}
                  </small>
                </div>
              </div>
            ) : null}

            <button
              className="action-button"
              type="button"
              disabled={!selectedTable || selectedTable.status !== 'available'}
              onClick={onOpenModal}
            >
              Забронировать
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export default BookingSidebar;
