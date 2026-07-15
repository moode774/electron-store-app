export const DELIVERY_PROOF_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const DELIVERY_PROOF_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

export interface DeliveryProofDraft {
  photoUri?: string | null;
  photoMimeType?: string | null;
  photoSize?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  locationTimestamp?: number | null;
}

const SUPPORTED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

export function hasValidDeliveryCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && (latitude as number) >= -90
    && (latitude as number) <= 90
    && (longitude as number) >= -180
    && (longitude as number) <= 180;
}

export function hasFreshDeliveryLocation(
  locationTimestamp: number | null | undefined,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(locationTimestamp)) return false;
  const age = now - (locationTimestamp as number);
  return age >= -60_000 && age <= DELIVERY_PROOF_LOCATION_MAX_AGE_MS;
}

export function getDeliveryProofValidationError(
  draft: DeliveryProofDraft,
  now = Date.now(),
): string | null {
  if (!draft.photoUri?.trim()) return 'التقط صورة واضحة للتسليم أولًا.';

  if (draft.photoMimeType && !SUPPORTED_PHOTO_MIME_TYPES.has(draft.photoMimeType.toLowerCase())) {
    return 'صيغة الصورة غير مدعومة. استخدم صورة JPEG أو PNG.';
  }

  if (Number.isFinite(draft.photoSize) && (draft.photoSize as number) > DELIVERY_PROOF_MAX_PHOTO_BYTES) {
    return 'حجم صورة الإثبات كبير جدًا. التقط صورة بحجم أقل من 10 ميجابايت.';
  }

  if (!hasValidDeliveryCoordinates(draft.latitude, draft.longitude)) {
    return 'حدّث موقعك الحالي لإرفاقه بإثبات التسليم.';
  }

  if (!hasFreshDeliveryLocation(draft.locationTimestamp, now)) {
    return 'موقع إثبات التسليم قديم. حدّث الموقع ثم حاول مجددًا.';
  }

  return null;
}

export function createDeliveryIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
