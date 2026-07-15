import { supabase } from '@marketplace/shared-hooks';

import { createDeliveryIdempotencyKey } from './deliveryProofValidation';

export const COD_REMITTANCE_PROOF_BUCKET = 'cod-remittance-proofs';
export const COD_REMITTANCE_PROOF_MAX_BYTES = 10 * 1024 * 1024;

export type CodCollectionStatus = 'collected' | 'partially_remitted' | 'remitted' | 'disputed';
export type CodSubmissionStatus = 'pending' | 'approved' | 'rejected' | 'disputed';

export interface CodRemittanceSubmission {
  id: string;
  amount: number;
  reference: string;
  proof_path: string;
  status: CodSubmissionStatus;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface CodCollection {
  id: string;
  order_id: string;
  order_number: string | null;
  delivery_id: string;
  amount_collected: number;
  amount_remitted: number;
  amount_outstanding: number;
  amount_pending_review: number;
  status: CodCollectionStatus;
  collected_at: string;
  remitted_at: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  submissions: CodRemittanceSubmission[];
}

export interface CodRemittanceProofFile {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

interface UploadCodRemittanceProofInput {
  userId: string;
  collectionId: string;
  idempotencyKey: string;
  proof: CodRemittanceProofFile;
}

interface SubmitCodRemittanceInput {
  collectionId: string;
  amount: number;
  reference: string;
  proofPath: string;
  idempotencyKey: string;
}

interface CodRemittanceResult {
  id: string;
  collection_id: string;
  amount: number;
  status: CodSubmissionStatus;
  reference: string;
  proof_path: string;
  submitted_at: string;
  idempotent_replay: boolean;
}

type UnknownRecord = Record<string, unknown>;

const COLLECTION_STATUSES = new Set<CodCollectionStatus>([
  'collected',
  'partially_remitted',
  'remitted',
  'disputed',
]);
const SUBMISSION_STATUSES = new Set<CodSubmissionStatus>([
  'pending',
  'approved',
  'rejected',
  'disputed',
]);

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function nullableString(value: unknown): string | null {
  const result = stringValue(value).trim();
  return result || null;
}

function numericValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function submissionStatus(value: unknown): CodSubmissionStatus {
  return SUBMISSION_STATUSES.has(value as CodSubmissionStatus)
    ? value as CodSubmissionStatus
    : 'pending';
}

function collectionStatus(value: unknown): CodCollectionStatus {
  return COLLECTION_STATUSES.has(value as CodCollectionStatus)
    ? value as CodCollectionStatus
    : 'collected';
}

function normalizeSubmission(value: unknown): CodRemittanceSubmission | null {
  const row = asRecord(value);
  const id = stringValue(row.id);
  if (!id) return null;

  return {
    id,
    amount: numericValue(row.amount),
    reference: stringValue(row.reference),
    proof_path: stringValue(row.proof_path),
    status: submissionStatus(row.status),
    review_note: nullableString(row.review_note),
    submitted_at: stringValue(row.submitted_at),
    reviewed_at: nullableString(row.reviewed_at),
  };
}

function normalizeCollection(value: unknown): CodCollection | null {
  const row = asRecord(value);
  const id = stringValue(row.id);
  const orderId = stringValue(row.order_id);
  if (!id || !orderId) return null;

  const amountCollected = numericValue(row.amount_collected);
  const amountRemitted = numericValue(row.amount_remitted);
  const submissions = Array.isArray(row.submissions)
    ? row.submissions.map(normalizeSubmission).filter((item): item is CodRemittanceSubmission => Boolean(item))
    : [];

  return {
    id,
    order_id: orderId,
    order_number: nullableString(row.order_number),
    delivery_id: stringValue(row.delivery_id),
    amount_collected: amountCollected,
    amount_remitted: amountRemitted,
    amount_outstanding: Math.max(numericValue(row.amount_outstanding), 0),
    amount_pending_review: Math.max(numericValue(row.amount_pending_review), 0),
    status: collectionStatus(row.status),
    collected_at: stringValue(row.collected_at),
    remitted_at: nullableString(row.remitted_at),
    disputed_at: nullableString(row.disputed_at),
    dispute_reason: nullableString(row.dispute_reason),
    submissions,
  };
}

function isDuplicateObjectError(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  return String(error.statusCode ?? '') === '409' || /duplicate|already exists/i.test(error.message ?? '');
}

function resolveProofFormat(proof: CodRemittanceProofFile): { extension: 'jpg' | 'png'; contentType: string } {
  const mimeType = proof.mimeType?.toLowerCase();
  const sourceName = `${proof.fileName ?? ''} ${proof.uri}`.toLowerCase().split('?')[0];

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

  throw new Error('صيغة الإثبات غير مدعومة. اختر صورة JPEG أو PNG.');
}

function friendlyRpcError(error: { code?: string; message?: string; details?: string }): Error {
  const raw = `${error.message ?? ''} ${error.details ?? ''}`.trim();
  const lower = raw.toLowerCase();

  if (error.code === 'PGRST202' || /schema cache|could not find the function/.test(lower)) {
    return new Error('ميزة تسليم التحصيل النقدي لم تُفعّل على الخادم بعد.');
  }
  if (/cod collection is disputed/.test(lower)) {
    return new Error('هذا التحصيل موقوف بسبب نزاع. انتظر مراجعة الإدارة قبل إرسال مبلغ جديد.');
  }
  if (/already remitted/.test(lower)) {
    return new Error('تم تسليم هذا التحصيل كاملًا بالفعل.');
  }
  if (/exceeds the unremitted|would exceed collected cash/.test(lower)) {
    return new Error('المبلغ أكبر من الرصيد المتاح للتسليم بعد احتساب الطلبات قيد المراجعة.');
  }
  if (/proof object was not found|invalid cod remittance proof/.test(lower)) {
    return new Error('لم يتحقق الخادم من ملف الإثبات. أعد اختيار الصورة ثم حاول مجددًا.');
  }
  if (/actor_not_active|blocked/.test(lower)) {
    return new Error('حساب المندوب موقوف حاليًا ولا يمكنه إرسال تحصيلات.');
  }
  if (/duplicate active remittance reference/.test(lower)) {
    return new Error('رقم مرجع الحوالة مستخدم في طلب قائم لهذا التحصيل.');
  }

  return new Error(raw || 'تعذّر تنفيذ عملية التحصيل النقدي.');
}

export function availableCodRemittanceAmount(collection: CodCollection): number {
  return Math.max(
    Math.round((collection.amount_outstanding - collection.amount_pending_review) * 100) / 100,
    0,
  );
}

export function createCodRemittanceIdempotencyKey(): string {
  return createDeliveryIdempotencyKey();
}

export async function listMyCodCollections(): Promise<CodCollection[]> {
  const { data, error } = await supabase.rpc('list_my_cod_collections');
  if (error) throw friendlyRpcError(error);

  return (Array.isArray(data) ? data : [])
    .map(normalizeCollection)
    .filter((item): item is CodCollection => Boolean(item));
}

export async function uploadCodRemittanceProof({
  userId,
  collectionId,
  idempotencyKey,
  proof,
}: UploadCodRemittanceProofInput): Promise<string> {
  const { extension, contentType } = resolveProofFormat(proof);
  const proofPath = `${userId}/cod-remittances/${collectionId}/${idempotencyKey}.${extension}`;
  const response = await fetch(proof.uri);
  const body = await response.arrayBuffer();

  if (body.byteLength < 1) {
    throw new Error('تعذّرت قراءة صورة الإثبات. اختر صورة جديدة وحاول مجددًا.');
  }
  if (body.byteLength > COD_REMITTANCE_PROOF_MAX_BYTES) {
    throw new Error('حجم صورة الإثبات أكبر من 10 ميجابايت.');
  }

  const { error } = await supabase.storage
    .from(COD_REMITTANCE_PROOF_BUCKET)
    .upload(proofPath, body, { contentType, upsert: false });

  if (error && !isDuplicateObjectError(error)) throw friendlyRpcError(error);
  return proofPath;
}

export async function submitCodRemittance({
  collectionId,
  amount,
  reference,
  proofPath,
  idempotencyKey,
}: SubmitCodRemittanceInput): Promise<CodRemittanceResult> {
  const { data, error } = await supabase.rpc('submit_cod_remittance', {
    p_collection_id: collectionId,
    p_amount: amount,
    p_reference: reference,
    p_proof_path: proofPath,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw friendlyRpcError(error);

  const row = asRecord(data);
  return {
    id: stringValue(row.id),
    collection_id: stringValue(row.collection_id),
    amount: numericValue(row.amount),
    status: submissionStatus(row.status),
    reference: stringValue(row.reference),
    proof_path: stringValue(row.proof_path),
    submitted_at: stringValue(row.submitted_at),
    idempotent_replay: row.idempotent_replay === true,
  };
}
