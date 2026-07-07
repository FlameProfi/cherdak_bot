import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { formatDateTimeLabel, seatWord } from '../../shared/constants'
import type { BookingState } from '../../types'
import { BENCH_LAYOUT, TABLE_LAYOUT } from './layout'

interface BookingPlanProps {
  bookingState: BookingState | null;
  selectedCode: string;
  isLoading: boolean;
  onSelectTable: (tableCode: string) => void;
}

function BookingPlan({ bookingState, selectedCode, isLoading, onSelectTable }: BookingPlanProps) {
  const [viewMode, setViewMode] = useState<'scheme' | 'list'>('scheme');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const sortedTables = useMemo(() => {
    return [...(bookingState?.tables || [])].sort((left, right) =>
      left.code.localeCompare(right.code, 'ru')
    );
  }, [bookingState]);

  function handleZoomIn() {
    setZoom((current) => Math.min(2, Number((current + 0.15).toFixed(2))));
  }

  function handleZoomOut() {
    setZoom((current) => Math.max(0.75, Number((current - 0.15).toFixed(2))));
  }

  function handleCenter() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function renderStatus(tableStatus: string) {
    return tableStatus === 'available' ? 'Свободно' : 'Занято';
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    setOffset({
      x: dragState.originX + (event.clientX - dragState.startX),
      y: dragState.originY + (event.clientY - dragState.startY)
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="map booking-map-surface">
      <div className="scheme-switcher">
        <button
          type="button"
          className={`scheme-tab ${viewMode === 'list' ? 'active' : ''}`}
          onClick={() => setViewMode('list')}
        >
          список
        </button>
        <button
          type="button"
          className={`scheme-tab ${viewMode === 'scheme' ? 'active' : ''}`}
          onClick={() => setViewMode('scheme')}
        >
          схема
        </button>
      </div>

      <div className={`booking-view booking-view-scheme ${viewMode === 'scheme' ? 'active' : 'inactive'}`}>
        <div className="plan">
          <div
            className={`plan-viewport ${isDragging ? 'dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="plan-scene"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            >
              <div className="wall top" />
              <div className="wall right" />
              <div className="wall bottom" />
              <div className="wall top-left-bridge" />
              <div className="inner-wall left-vert" />
              <div className="inner-wall left-bottom" />
              <div className="inner-wall mid-vert" />
              <div className="inner-wall mid-bottom" />
              <div className="bar-l-shape" />
              <div className="bar-stand" />
              <div className="bar-caption">Барная стойка</div>
              <div className="room-note">Вешалка для одежды</div>
              <div className="hanger-target" />
              <div className="path-label wc">WC</div>
              <div className="path-label entry">Вход</div>
              <div className="grate top" />
              <div className="grate bottom" />
              <div className="bench bench-a" style={BENCH_LAYOUT.A}>PS4</div>
              <div className="bench bench-b" style={BENCH_LAYOUT.B}>PS4</div>

              {bookingState?.tables.map((table) => {
                const position =
                  TABLE_LAYOUT[table.code] ||
                  bookingState.layout[table.code] || { left: '0%', top: '0%' };
                const shapeClass = `shape-${table.code.toLowerCase()}`;

                return (
                  <button
                    key={table.code}
                    className={`table-card ${table.status} ${shapeClass} ${
                      selectedCode === table.code ? 'selected' : ''
                    }`}
                    style={{ left: position.left, top: position.top }}
                    type="button"
                    onClick={() => onSelectTable(table.code)}
                  >
                    <span className="table-shadow" />
                    <span className="chair chair-top" />
                    <span className="chair chair-right" />
                    <span className="chair chair-bottom" />
                    <span className="chair chair-left" />
                    <span className="table-core">
                      <span className="label">{table.label}</span>
                      <span className="meta sr-only">
                        {table.seats} {seatWord(table.seats)}
                      </span>
                    </span>
                  </button>
                );
              })}

              <div className="floor-label">Сервис бронирования – 4ERDAK</div>
              <div className="booking-counters">
                <span>{bookingState?.freeCount ?? 0} свободно</span>
                <span>{bookingState?.takenCount ?? 0} занято</span>
              </div>
            </div>
          </div>

          <div className="zoom-controls">
            <button type="button" aria-label="Увеличить" onClick={handleZoomIn}>+</button>
            <button type="button" aria-label="Уменьшить" onClick={handleZoomOut}>−</button>
          </div>
          <div className="locate-control">
            <button type="button" aria-label="Центрировать схему" onClick={handleCenter}>⌖</button>
          </div>
        </div>
      </div>

      <div className={`booking-view booking-view-list ${viewMode === 'list' ? 'active' : 'inactive'}`}>
        <div className="booking-table-list">
          {sortedTables.map((table) => (
            <button
              key={table.code}
              type="button"
              className={`booking-list-card ${selectedCode === table.code ? 'selected' : ''}`}
              onClick={() => onSelectTable(table.code)}
            >
              <div className="booking-list-card-head">
                <strong>{table.label}</strong>
                <span className={`booking-list-status ${table.status}`}>
                  {renderStatus(table.status)}
                </span>
              </div>
              <div className="booking-list-meta">
                <span>{table.seats} {seatWord(table.seats)}</span>
                <span>
                  {table.status === 'reserved'
                    ? `Освободится ${formatDateTimeLabel(table.occupied_until || table.reserved_until)}`
                    : `Следующая бронь ${formatDateTimeLabel(table.next_booking_at)}`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <div className="loading-panel booking-loading">Обновляем схему...</div> : null}
    </section>
  );
}

export default BookingPlan;
