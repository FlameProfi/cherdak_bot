import { useEffect, useMemo, useState, useTransition } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { createBooking, fetchBookingState } from '../api/site';
import { EMPTY_BOOKING_FORM } from '../shared/constants';
import type {
  BookingForm,
  BookingState,
  BookingTable,
  FeedbackState
} from '../types';

interface UseBookingResult {
  bookingState: BookingState | null;
  selectedCode: string;
  selectedTable: BookingTable | null;
  sidebarOpen: boolean;
  modalOpen: boolean;
  form: BookingForm;
  feedback: FeedbackState;
  isLoading: boolean;
  selectTable: (tableCode: string) => void;
  closeSidebar: () => void;
  openModal: () => void;
  closeModal: () => void;
  updateField: (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => void;
  submitBooking: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

function useBooking(): UseBookingResult {
  const [bookingState, setBookingState] = useState<BookingState | null>(null);
  const [selectedCode, setSelectedCode] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BookingForm>(EMPTY_BOOKING_FORM);
  const [feedback, setFeedback] = useState<FeedbackState>({ type: '', text: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    let bookingStream: EventSource | null = null;

    async function loadBooking() {
      setIsLoading(true);
      try {
        const data = await fetchBookingState();
        if (!cancelled) {
          startTransition(() => {
            setBookingState(data);
            setSelectedCode((current) => current || data.tables[0]?.code || '');
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            type: 'error',
            text:
              error instanceof Error ? error.message : 'Не удалось загрузить схему бронирования.'
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }

      bookingStream = new EventSource('/api/booking/stream');
      bookingStream.addEventListener('booking-state', (event) => {
        const nextState = JSON.parse((event as MessageEvent<string>).data) as BookingState;
        if (!cancelled) {
          startTransition(() => {
            setBookingState(nextState);
            setSelectedCode((current) => current || nextState.tables[0]?.code || '');
          });
        }
      });
    }

    void loadBooking();
    return () => {
      cancelled = true;
      bookingStream?.close();
    };
  }, []);

  const selectedTable = useMemo<BookingTable | null>(() => {
    return bookingState?.tables.find((table) => table.code === selectedCode) || null;
  }, [bookingState, selectedCode]);

  function selectTable(tableCode: string) {
    setSelectedCode(tableCode);
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function openModal() {
    if (!selectedTable || selectedTable.status !== 'available') return;
    setModalOpen(true);
    setFeedback({ type: '', text: '' });
  }

  function closeModal() {
    setModalOpen(false);
  }

  function updateField(
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTable) return;

    setFeedback({ type: '', text: '' });

    try {
      const data = await createBooking({
        ...form,
        table: selectedTable.code
      });

      startTransition(() => {
        setBookingState(data.state);
        setSelectedCode(selectedTable.code);
      });
      setForm(EMPTY_BOOKING_FORM);
      setModalOpen(false);
      setSidebarOpen(true);
      setFeedback({ type: 'success', text: data.message });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Не удалось отправить заявку.'
      });
    }
  }

  return {
    bookingState,
    selectedCode,
    selectedTable,
    sidebarOpen,
    modalOpen,
    form,
    feedback,
    isLoading: isLoading || isPending,
    selectTable,
    closeSidebar,
    openModal,
    closeModal,
    updateField,
    submitBooking
  };
}

export default useBooking;
