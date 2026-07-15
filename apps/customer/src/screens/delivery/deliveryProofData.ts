import { supabase } from '@marketplace/shared-hooks';

const DELIVERY_PROOF_BUCKET = 'orders';

export interface DeliveryProofPhoto {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

interface UploadDeliveryProofPhotoInput {
  userId: string;
  orderId: string;
  idempotencyKey: string;
  photo: DeliveryProofPhoto;
}

interface CompleteDeliveryWithProofInput {
  orderId: string;
  photoPath: string;
  latitude: number;
  longitude: number;
  idempotencyKey: string;
}

function resolvePhotoFormat(photo: DeliveryProofPhoto): { extension: 'jpg' | 'png'; contentType: string } {
  const mimeType = photo.mimeType?.toLowerCase();
  const sourceName = `${photo.fileName ?? ''} ${photo.uri}`.toLowerCase().split('?')[0];

  if (mimeType === 'image/png' || sourceName.endsWith('.png')) {
    return { extension: 'png', contentType: 'image/png' };
  }

  return { extension: 'jpg', contentType: 'image/jpeg' };
}

function isDuplicateObjectError(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  return String(error.statusCode ?? '') === '409' || /duplicate|already exists/i.test(error.message ?? '');
}

function isMissingCompletionRpc(error: { code?: string; message?: string; details?: string } | null): boolean {
  if (!error) return false;
  const message = `${error.message ?? ''} ${error.details ?? ''}`;
  return error.code === 'PGRST202'
    || (
      /complete_delivery_with_proof/i.test(message)
      && /schema cache|could not find|does not exist/i.test(message)
    );
}

export async function uploadDeliveryProofPhoto({
  userId,
  orderId,
  idempotencyKey,
  photo,
}: UploadDeliveryProofPhotoInput): Promise<string> {
  const { extension, contentType } = resolvePhotoFormat(photo);
  const photoPath = `${userId}/delivery-proofs/${orderId}/${idempotencyKey}.${extension}`;
  const response = await fetch(photo.uri);
  const body = await response.arrayBuffer();

  if (body.byteLength === 0) {
    throw new Error('تعذّر قراءة صورة إثبات التسليم. التقط صورة جديدة وحاول مجددًا.');
  }

  const { error } = await supabase.storage
    .from(DELIVERY_PROOF_BUCKET)
    .upload(photoPath, body, { contentType, upsert: false });

  if (error && !isDuplicateObjectError(error)) throw error;
  return photoPath;
}

export async function completeDeliveryWithProof({
  orderId,
  photoPath,
  latitude,
  longitude,
  idempotencyKey,
}: CompleteDeliveryWithProofInput): Promise<void> {
  const { error } = await supabase.rpc('complete_delivery_with_proof', {
    p_order_id: orderId,
    p_photo_url: photoPath,
    p_latitude: latitude,
    p_longitude: longitude,
    p_idempotency_key: idempotencyKey,
    p_signature_url: null,
  });

  if (isMissingCompletionRpc(error)) {
    throw new Error('ميزة إثبات التسليم لم تُفعّل على الخادم بعد. لم تتغير حالة الطلب ولم يُسجّل التسليم.');
  }
  if (error) throw error;
}
