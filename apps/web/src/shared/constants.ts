import type { BookingForm } from '../types';

export const REVIEW_URL = 'https://yandex.ru/maps/-/CTq6aD2X';

export const EMPTY_BOOKING_FORM: BookingForm = {
  date: '',
  time: '',
  name: '',
  phone: '',
  guests: '',
  comment: ''
};

export function seatWord(seats: number | string): string {
  if (Number(seats) === 1) return 'место';
  if (Number(seats) <= 4) return 'места';
  return 'мест';
}

export function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function formatBookingDay(dateValue: string | null | undefined, timeValue?: string | null): string {
  if (!dateValue) return 'Дата не указана';

  const normalizedTime = timeValue || '00:00';
  const candidate = dateValue.includes('T') ? dateValue : `${dateValue}T${normalizedTime}`;
  const date = new Date(candidate);

  if (Number.isNaN(date.getTime())) {
    return `${dateValue}${timeValue ? ` ${timeValue}` : ''}`;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: timeValue ? '2-digit' : undefined,
    minute: timeValue ? '2-digit' : undefined
  }).format(date);
}
