import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDeliveryIdempotencyKey,
  DELIVERY_PROOF_LOCATION_MAX_AGE_MS,
  getDeliveryProofValidationError,
  hasFreshDeliveryLocation,
  hasValidDeliveryCoordinates,
} from './deliveryProofValidation.ts';

test('accepts a fresh JPEG proof with valid coordinates', () => {
  const now = 1_700_000_000_000;
  assert.equal(getDeliveryProofValidationError({
    photoUri: 'file:///proof.jpg',
    photoMimeType: 'image/jpeg',
    photoSize: 1024,
    latitude: 15.3694,
    longitude: 44.191,
    locationTimestamp: now - 1_000,
  }, now), null);
});

test('rejects missing photo, invalid coordinates, and stale locations', () => {
  const now = 1_700_000_000_000;
  assert.match(getDeliveryProofValidationError({
    latitude: 15,
    longitude: 44,
    locationTimestamp: now,
  }, now) ?? '', /صورة/);

  assert.equal(hasValidDeliveryCoordinates(91, 44), false);
  assert.equal(hasValidDeliveryCoordinates(15, 181), false);
  assert.equal(hasFreshDeliveryLocation(now - DELIVERY_PROOF_LOCATION_MAX_AGE_MS - 1, now), false);
});

test('rejects unsupported and oversized proof photos', () => {
  const now = 1_700_000_000_000;
  const baseDraft = {
    photoUri: 'file:///proof.heic',
    latitude: 15.3694,
    longitude: 44.191,
    locationTimestamp: now,
  };

  assert.match(getDeliveryProofValidationError({
    ...baseDraft,
    photoMimeType: 'image/heic',
  }, now) ?? '', /غير مدعومة/);

  assert.match(getDeliveryProofValidationError({
    ...baseDraft,
    photoMimeType: 'image/jpeg',
    photoSize: 16 * 1024 * 1024,
  }, now) ?? '', /10 ميجابايت/);
});

test('creates UUID-shaped idempotency keys', () => {
  assert.match(
    createDeliveryIdempotencyKey(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
