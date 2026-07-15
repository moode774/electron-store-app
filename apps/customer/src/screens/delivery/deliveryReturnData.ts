import {
  DeliveryPhysicalReturnJob,
  getMyDeliveryReturns,
  supabase,
  updateDeliveryReturnStatus,
} from '@marketplace/shared-hooks';

import { createDeliveryIdempotencyKey } from './deliveryProofValidation';

export const RETURN_PROOF_BUCKET = 'return-proofs';
export const RETURN_PROOF_MAX_BYTES = 10 * 1024 * 1024;

export type DeliveryReturnTargetStatus = 'picked_up' | 'received';

export interface DeliveryReturnAddress {
  id: string;
  label: string;
  full_address: string;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface DeliveryReturnMerchant {
  id: string;
  store_name: string;
  address: string | null;
  city: string | null;
  store_phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface DeliveryReturnJob extends DeliveryPhysicalReturnJob {
  address: DeliveryReturnAddress | null;
  merchant: DeliveryReturnMerchant | null;
}

export interface DeliveryReturnProofPhoto {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

interface UploadDeliveryReturnProofInput {
  userId: string;
  requestId: string;
  idempotencyKey: string;
  photo: DeliveryReturnProofPhoto;
}

interface CompleteDeliveryReturnStepInput {
  requestId: string;
  targetStatus: DeliveryReturnTargetStatus;
  proofPath: string;
  latitude: number;
  longitude: number;
  idempotencyKey: string;
}

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isDuplicateObjectError(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  return String(error.statusCode ?? '') === '409' || /duplicate|already exists/i.test(error.message ?? '');
}

function resolvePhotoFormat(photo: DeliveryReturnProofPhoto): { extension: 'jpg' | 'png'; contentType: string } {
  const mimeType = photo.mimeType?.toLowerCase();
  const sourceName = `${photo.fileName ?? ''} ${photo.uri}`.toLowerCase().split('?')[0];

  if (mimeType === 'image/png' || (!mimeType && sourceName.endsWith('.png'))) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (
    mimeType === 'image/jpeg'
    || mimeType === 'image/jpg'
    || (!mimeType && (sourceName.endsWith('.jpg') || sourceName.endsWith('.jpeg')))
  ) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  throw new Error('صيغة إثبات الإرجاع غير مدعومة. التقط صورة JPEG أو PNG.');
}

function friendlyReturnError(error: unknown): Error {
  const source = error && typeof error === 'object'
    ? error as { code?: string; message?: string; details?: string }
    : {};
  const raw = `${source.message ?? ''} ${source.details ?? ''}`.trim();
  const lower = raw.toLowerCase();

  if (source.code === 'PGRST202' || /schema cache|could not find the function/.test(lower)) {
    return new Error('ميزة مهام الإرجاع لم تُفعّل على الخادم بعد.');
  }
  if (/only the assigned courier/.test(lower)) {
    return new Error('هذه المهمة غير مسندة إلى حساب المندوب الحالي.');
  }
  if (/illegal courier return transition/.test(lower)) {
    return new Error('تغيّرت حالة مهمة الإرجاع. حدّث القائمة ثم نفّذ الخطوة المتاحة.');
  }
  if (/proof object was not found|invalid return proof/.test(lower)) {
    return new Error('لم يتحقق الخادم من صورة الإثبات. التقط صورة جديدة ثم حاول مجددًا.');
  }
  if (/idempotency key was reused/.test(lower)) {
    return new Error('تعارضت محاولة سابقة مع هذا الإثبات. التقط صورة جديدة وأعد المحاولة.');
  }
  if (/approved delivery authorization required|actor_not_active|account.*blocked|user.*blocked/.test(lower)) {
    return new Error('حساب المندوب غير متاح لتنفيذ مهام الإرجاع حاليًا.');
  }
  if (/row-level security|permission denied/.test(lower)) {
    return new Error('لا يملك حساب المندوب صلاحية تنفيذ هذه الخطوة أو رفع إثباتها.');
  }

  return new Error(raw || 'تعذّر تحديث مهمة الإرجاع.');
}

export function createDeliveryReturnIdempotencyKey(): string {
  return createDeliveryIdempotencyKey();
}

export async function loadDeliveryReturnJobs(): Promise<DeliveryReturnJob[]> {
  let jobs: DeliveryPhysicalReturnJob[];
  try {
    jobs = await getMyDeliveryReturns();
  } catch (error) {
    throw friendlyReturnError(error);
  }

  if (!jobs.length) return [];
  // Destination context comes from the assigned-custody RPC. A courier must
  // not depend on public customer/store catalogue policies after accepting an
  // operational return task.
  return jobs.map((job) => ({
    ...job,
    address: job.address ? {
      id: job.address.id,
      label: job.address.label || 'عنوان العميل',
      full_address: job.address.full_address || '',
      city: job.address.city || null,
      area: job.address.area || null,
      latitude: numberOrNull(job.address.latitude),
      longitude: numberOrNull(job.address.longitude),
    } : null,
    merchant: job.merchant ? {
      id: job.merchant.id,
      store_name: job.merchant.store_name || 'المتجر',
      address: job.merchant.address || null,
      city: job.merchant.city || null,
      store_phone: job.merchant.store_phone || null,
      latitude: numberOrNull(job.merchant.latitude),
      longitude: numberOrNull(job.merchant.longitude),
    } : null,
  }));
}

export async function getDeliveryReturnStatus(requestId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('return_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle();
  if (error) return null;
  return typeof data?.status === 'string' ? data.status : null;
}

export async function uploadDeliveryReturnProof({
  userId,
  requestId,
  idempotencyKey,
  photo,
}: UploadDeliveryReturnProofInput): Promise<string> {
  const { extension, contentType } = resolvePhotoFormat(photo);
  const proofPath = `${userId}/return-proofs/${requestId}/${idempotencyKey}.${extension}`;
  const response = await fetch(photo.uri);
  const body = await response.arrayBuffer();

  if (body.byteLength < 1) {
    throw new Error('تعذّرت قراءة صورة إثبات الإرجاع. التقط صورة جديدة.');
  }
  if (body.byteLength > RETURN_PROOF_MAX_BYTES) {
    throw new Error('حجم صورة إثبات الإرجاع أكبر من 10 ميجابايت.');
  }

  const { error } = await supabase.storage
    .from(RETURN_PROOF_BUCKET)
    .upload(proofPath, body, { contentType, upsert: false });
  if (error && !isDuplicateObjectError(error)) throw friendlyReturnError(error);
  return proofPath;
}

export async function completeDeliveryReturnStep({
  requestId,
  targetStatus,
  proofPath,
  latitude,
  longitude,
  idempotencyKey,
}: CompleteDeliveryReturnStepInput): Promise<void> {
  try {
    await updateDeliveryReturnStatus({
      request_id: requestId,
      status: targetStatus,
      proof_path: proofPath,
      latitude,
      longitude,
      idempotency_key: idempotencyKey,
    });
  } catch (error) {
    throw friendlyReturnError(error);
  }
}
