import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DirectionalIcon } from '../../components/DirectionalIcon';
import {
  getAdminCodCollections,
  getCodRemittanceProofLinks,
  reviewCodRemittance,
  setCodCollectionDispute,
  type CodCollection,
  type CodCollectionStatus,
  type CodRemittanceProofLink,
  type CodRemittanceStatus,
  type CodRemittanceSubmission,
} from '@marketplace/shared-hooks';
import { Alert } from '../../components/appAlert';
import { BREAKPOINTS, COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { translate, useTranslation } from '../../i18n';

const UI = {
  primary: COLORS.primary,
  primarySoft: COLORS.primarySoft,
  background: COLORS.background,
  card: COLORS.surface,
  text: COLORS.textPrimary,
  muted: COLORS.textMuted,
  border: COLORS.border,
  success: COLORS.success,
  successSoft: COLORS.accentMintSoft,
  warning: COLORS.warning,
  warningSoft: COLORS.secondarySoft,
  danger: COLORS.error,
  dangerSoft: COLORS.accentCoralSoft,
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
};

type Filter = 'all' | 'needs_review' | CodCollectionStatus;
type ReviewDecision = 'approved' | 'rejected' | 'disputed';
type ActionState =
  | { kind: 'submission'; decision: ReviewDecision; submission: CodRemittanceSubmission }
  | { kind: 'collection'; disputed: boolean };

const FILTERS: Array<{ value: Filter; labelKey: string }> = [
  { value: 'needs_review', labelKey: 'adminUi.codNeedsReview' },
  { value: 'disputed', labelKey: 'adminUi.codDisputes' },
  { value: 'collected', labelKey: 'adminUi.codNotRemitted' },
  { value: 'partially_remitted', labelKey: 'adminUi.codPartiallyRemitted' },
  { value: 'remitted', labelKey: 'adminUi.codCompleted' },
  { value: 'all', labelKey: 'adminUi.all' },
];

const COLLECTION_STATUS: Record<CodCollectionStatus, { labelKey: string; color: string; background: string }> = {
  collected: { labelKey: 'adminUi.codInCourierCustody', color: UI.warning, background: UI.warningSoft },
  partially_remitted: { labelKey: 'adminUi.codPartialTransfer', color: UI.primary, background: UI.primarySoft },
  remitted: { labelKey: 'adminUi.codFullyRemitted', color: UI.success, background: UI.successSoft },
  disputed: { labelKey: 'adminUi.codUnderDispute', color: UI.danger, background: UI.dangerSoft },
};

const SUBMISSION_STATUS: Record<CodRemittanceStatus, { labelKey: string; color: string; background: string }> = {
  pending: { labelKey: 'adminUi.awaitingReview', color: UI.warning, background: UI.warningSoft },
  approved: { labelKey: 'adminUi.approved', color: UI.success, background: UI.successSoft },
  rejected: { labelKey: 'adminUi.productRejected', color: UI.danger, background: UI.dangerSoft },
  disputed: { labelKey: 'adminUi.codSubmissionDisputed', color: UI.purple, background: UI.purpleSoft },
};

const DECISION_META: Record<ReviewDecision, { labelKey: string; titleKey: string; color: string }> = {
  approved: { labelKey: 'adminUi.codApproveTransfer', titleKey: 'adminUi.codApproveProof', color: UI.success },
  rejected: { labelKey: 'adminUi.codRejectTransfer', titleKey: 'adminUi.codRejectProof', color: UI.danger },
  disputed: { labelKey: 'adminUi.codOpenDispute', titleKey: 'adminUi.codSuspendOpenDispute', color: UI.purple },
};

function money(value?: number | null): string {
  return `${Number(value ?? 0).toFixed(2)} ${translate('adminUi.yer')}`;
}

function dateTime(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(translate('adminUi.locale'));
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/proof object was not found|invalid COD remittance proof|proof.*missing/i.test(message)) {
    return translate('adminUi.codProofMissingError');
  }
  if (/resolve disputed remittance submissions/i.test(message)) {
    return translate('adminUi.codResolveProofsFirst');
  }
  if (/already terminal/i.test(message)) {
    return translate('adminUi.codProofAlreadyResolved');
  }
  if (/exceed collected cash/i.test(message)) {
    return translate('adminUi.codAmountExceedsCustody');
  }
  return message || translate('adminUi.codGenericError');
}

export default function AdminCodCollectionsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const compact = width < BREAKPOINTS.compact;
  const columns = width >= BREAKPOINTS.desktop ? 2 : 1;
  const pagePadding = compact ? 12 : 20;
  const contentWidth = Math.min(Math.max(width - (pagePadding * 2), 280), 1280);
  const [collections, setCollections] = useState<CodCollection[]>([]);
  const [filter, setFilter] = useState<Filter>('needs_review');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<CodCollection | null>(null);
  const [proofLinks, setProofLinks] = useState<CodRemittanceProofLink[]>([]);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState('');
  const [action, setAction] = useState<ActionState | null>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const loadGeneration = useRef(0);
  const proofGeneration = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const generation = ++loadGeneration.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    setLoadError('');
    try {
      const rows = await getAdminCodCollections();
      if (generation === loadGeneration.current) setCollections(rows);
    } catch (error) {
      if (generation === loadGeneration.current) setLoadError(errorText(error));
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => {
      loadGeneration.current += 1;
      proofGeneration.current += 1;
    };
  }, [load]));

  const visibleCollections = useMemo(() => collections.filter((collection) => {
    if (filter === 'all') return true;
    if (filter === 'needs_review') {
      return collection.submissions.some((submission) =>
        submission.status === 'pending' || submission.status === 'disputed');
    }
    return collection.status === filter;
  }), [collections, filter]);

  const summary = useMemo(() => collections.reduce((result, collection) => ({
    outstanding: result.outstanding + Number(collection.amount_outstanding || 0),
    pending: result.pending + Number(collection.amount_pending_review || 0),
    reviews: result.reviews + collection.submissions.filter((submission) =>
      submission.status === 'pending' || submission.status === 'disputed').length,
    disputes: result.disputes + (collection.status === 'disputed' ? 1 : 0),
  }), { outstanding: 0, pending: 0, reviews: 0, disputes: 0 }), [collections]);

  const closeDetails = useCallback(() => {
    proofGeneration.current += 1;
    setSelected(null);
    setProofLinks([]);
    setProofError('');
    setAction(null);
    setReason('');
  }, []);

  const openDetails = useCallback((collection: CodCollection) => {
    const generation = ++proofGeneration.current;
    setSelected(collection);
    setProofLinks([]);
    setProofError('');
    setAction(null);
    setReason('');
    const paths = collection.submissions.map((submission) => submission.proof_path).filter(Boolean);
    if (paths.length === 0) {
      setProofLoading(false);
      return;
    }
    setProofLoading(true);
    void getCodRemittanceProofLinks(paths)
      .then((links) => {
        if (generation === proofGeneration.current) setProofLinks(links);
      })
      .catch((error) => {
        if (generation === proofGeneration.current) {
          setProofError(`${t('adminUi.codProofLinksFailed')}: ${errorText(error)}`);
        }
      })
      .finally(() => {
        if (generation === proofGeneration.current) setProofLoading(false);
      });
  }, []);

  const startSubmissionAction = (submission: CodRemittanceSubmission, decision: ReviewDecision) => {
    setAction({ kind: 'submission', submission, decision });
    setReason('');
  };

  const startCollectionAction = (disputed: boolean) => {
    setAction({ kind: 'collection', disputed });
    setReason('');
  };

  const submitAction = async () => {
    if (!selected || !action || processing) return;
    const cleanReason = reason.trim();
    if (cleanReason.length < 5) {
      Alert.alert(t('adminUi.withdrawDecisionReasonRequired'), t('adminUi.codDecisionReasonText'));
      return;
    }
    setProcessing(true);
    try {
      if (action.kind === 'submission') {
        await reviewCodRemittance(action.submission.id, action.decision, cleanReason);
      } else {
        await setCodCollectionDispute(selected.id, action.disputed, cleanReason);
      }
      const successMessage = action.kind === 'submission'
        ? action.decision === 'approved'
          ? t('adminUi.codSuccessApproved')
          : action.decision === 'rejected'
            ? t('adminUi.codSuccessRejected')
            : t('adminUi.codSuccessDisputed')
        : action.disputed
          ? t('adminUi.codCollectionDisputed')
          : t('adminUi.codDisputeClosed');
      closeDetails();
      await load();
      Alert.alert(t('adminUi.codDecisionSaved'), successMessage);
    } catch (error) {
      Alert.alert(t('adminUi.codDecisionNotSaved'), errorText(error));
    } finally {
      setProcessing(false);
    }
  };

  const renderSummary = () => (
    <View>
      <View style={s.summaryGrid}>
        <SummaryCard label={t('adminUi.codOutstandingCash')} value={money(summary.outstanding)} color={UI.warning} icon="cash-outline" />
        <SummaryCard label={t('adminUi.refundPending')} value={money(summary.pending)} color={UI.primary} icon="hourglass-outline" />
        <SummaryCard label={t('adminUi.codPendingProofs')} value={String(summary.reviews)} color={UI.purple} icon="document-attach-outline" />
        <SummaryCard label={t('adminUi.codOpenDisputes')} value={String(summary.disputes)} color={UI.danger} icon="alert-circle-outline" />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filters}
      >
        {FILTERS.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[s.filterChip, filter === item.value && s.filterChipActive]}
            onPress={() => setFilter(item.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item.value }}
          >
            <Text style={[s.filterText, filter === item.value && s.filterTextActive]}>{t(item.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loadError ? (
        <View style={s.errorBox}>
          <Ionicons name="alert-circle-outline" size={20} color={UI.danger} />
          <View style={s.errorContent}>
            <Text style={s.errorText}>{loadError}</Text>
            <TouchableOpacity onPress={() => void load()}><Text style={s.retryText}>{t('adminUi.retry')}</Text></TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderCollection = ({ item }: { item: CodCollection }) => {
    const meta = COLLECTION_STATUS[item.status];
    const reviewCount = item.submissions.filter((submission) =>
      submission.status === 'pending' || submission.status === 'disputed').length;
    return (
      <TouchableOpacity style={s.collectionCard} onPress={() => openDetails(item)} activeOpacity={0.8}>
        <View style={s.cardTopRow}>
          <View style={[s.statusBadge, { backgroundColor: meta.background }]}>
            <Text style={[s.statusBadgeText, { color: meta.color }]}>{t(meta.labelKey)}</Text>
          </View>
          <View style={s.orderInfo}>
            <Text style={s.orderNumber}>{t('adminUi.order')} {item.order_number ?? item.order_id.slice(0, 8)}</Text>
            <Text style={s.cardDate}>{t('adminUi.codCashReceived')}: {dateTime(item.collected_at)}</Text>
          </View>
        </View>

        <View style={s.identityRow}>
          <Ionicons name="bicycle-outline" size={17} color={UI.muted} />
          <Text style={s.identityText}>{t('adminUi.courier')}: {item.delivery_name || item.delivery_id.slice(0, 8)}</Text>
        </View>

        <View style={s.amountGrid}>
          <AmountCell label={t('adminUi.codCollected')} value={money(item.amount_collected)} />
          <AmountCell label={t('adminUi.codApprovedAmount')} value={money(item.amount_remitted)} />
          <AmountCell label={t('adminUi.codRemaining')} value={money(item.amount_outstanding)} emphasized />
        </View>

        <View style={s.cardFooter}>
          <View style={[s.reviewPill, reviewCount > 0 && s.reviewPillActive]}>
            <Text style={[s.reviewPillText, reviewCount > 0 && s.reviewPillTextActive]}>
              {reviewCount > 0 ? `${reviewCount} ${t('adminUi.codProofsNeedDecision')}` : `${item.submissions.length} ${t('adminUi.codRecordedTransfers')}`}
            </Text>
          </View>
          <View style={s.detailsLink}>
            <Text style={s.detailsLinkText}>{t('adminUi.codDetailsReview')}</Text>
            <DirectionalIcon name="chevron-back" size={17} color={UI.primary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingHorizontal: pagePadding + Math.max((width - contentWidth) / 2, 0) }]}>
        <View style={s.headerText}>
          <Text style={s.title}>{t('adminUi.codCollectionsTitle')}</Text>
          <Text style={s.subtitle}>{t('adminUi.codCollectionsSubtitle')}</Text>
        </View>
        <TouchableOpacity style={s.backButton} onPress={() => navigation.goBack()} accessibilityLabel={t('adminUi.back')}>
          <DirectionalIcon name="arrow-forward" size={22} color={UI.text} />
        </TouchableOpacity>
      </View>

      {loading && collections.length === 0 ? (
        <View style={s.centerState}>
          <ActivityIndicator size="large" color={UI.primary} />
          <Text style={s.stateText}>{t('adminUi.codLoading')}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleCollections}
          key={`cod-${columns}`}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? s.columnRow : undefined}
          keyExtractor={(item) => item.id}
          renderItem={renderCollection}
          ListHeaderComponent={renderSummary}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={UI.success} />
              <Text style={s.emptyTitle}>{t('adminUi.codEmptyTitle')}</Text>
              <Text style={s.emptyText}>{t('adminUi.codEmptyText')}</Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={UI.primary} />
          }
          contentContainerStyle={[s.listContent, { paddingHorizontal: pagePadding, width: contentWidth }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal
        visible={selected !== null}
        transparent
        animationType="slide"
        onRequestClose={closeDetails}
      >
        <View style={[s.modalOverlay, !compact && s.modalOverlayDesktop]}>
          <View style={[s.modalCard, !compact && s.modalCardDesktop, { width: Math.min(Math.max(width - 24, 280), 760) }]}>
            <View style={s.modalHeader}>
              <TouchableOpacity style={s.closeButton} onPress={closeDetails} disabled={processing}>
                <Ionicons name="close" size={22} color={UI.text} />
              </TouchableOpacity>
              <View style={s.modalHeaderText}>
                <Text style={s.modalTitle}>{t('adminUi.codCustodyDetails')}</Text>
                <Text style={s.modalSubtitle}>{t('adminUi.order')} {selected?.order_number ?? selected?.order_id.slice(0, 8)}</Text>
              </View>
            </View>

            {selected ? (
              <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
                <CollectionOverview collection={selected} />

                {selected.status === 'disputed' ? (
                  <View style={s.disputeBanner}>
                    <Ionicons name="warning-outline" size={22} color={UI.danger} />
                    <View style={s.disputeBannerText}>
                      <Text style={s.disputeTitle}>{t('adminUi.codCollectionDisputeTitle')}</Text>
                      <Text style={s.disputeReason}>{selected.dispute_reason || t('adminUi.codNoVisibleReason')}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={s.collectionActions}>
                  {selected.status === 'disputed' ? (
                    <TouchableOpacity
                      style={[s.outlineAction, { borderColor: UI.success }]}
                      onPress={() => startCollectionAction(false)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color={UI.success} />
                      <Text style={[s.outlineActionText, { color: UI.success }]}>{t('adminUi.codCloseDispute')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[s.outlineAction, { borderColor: UI.danger }]}
                      onPress={() => startCollectionAction(true)}
                    >
                      <Ionicons name="alert-circle-outline" size={18} color={UI.danger} />
                      <Text style={[s.outlineActionText, { color: UI.danger }]}>{t('adminUi.codOpenCollectionDispute')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>{t('adminUi.codTransferProofs')} ({selected.submissions.length})</Text>
                  {proofLoading ? <ActivityIndicator size="small" color={UI.primary} /> : null}
                </View>
                {proofError ? <Text style={s.inlineError}>{proofError}</Text> : null}

                {selected.submissions.length === 0 ? (
                  <View style={s.noSubmissions}>
                    <Text style={s.emptyText}>{t('adminUi.codNoTransferProofs')}</Text>
                  </View>
                ) : selected.submissions.map((submission) => {
                  const submissionMeta = SUBMISSION_STATUS[submission.status];
                  const proofLink = proofLinks.find((link) => link.path === submission.proof_path);
                  const reviewable = submission.status === 'pending' || submission.status === 'disputed';
                  return (
                    <View key={submission.id} style={s.submissionCard}>
                      <View style={s.submissionHeader}>
                        <View style={[s.statusBadge, { backgroundColor: submissionMeta.background }]}>
                          <Text style={[s.statusBadgeText, { color: submissionMeta.color }]}>{t(submissionMeta.labelKey)}</Text>
                        </View>
                        <View style={s.submissionAmountWrap}>
                          <Text style={s.submissionAmount}>{money(submission.amount)}</Text>
                          <Text style={s.cardDate}>{dateTime(submission.submitted_at)}</Text>
                        </View>
                      </View>

                      <InfoLine label={t('adminUi.transferReference')} value={submission.reference || '—'} selectable />
                      <InfoLine label={t('adminUi.codPrivateProofPath')} value={submission.proof_path} selectable />
                      {submission.review_note ? <InfoLine label={t('adminUi.refundDecisionNoteOptional')} value={submission.review_note} /> : null}
                      {submission.ledger_entry_id ? <InfoLine label={t('adminUi.codLedgerEntry')} value={submission.ledger_entry_id} selectable /> : null}

                      {proofLink ? (
                        <TouchableOpacity
                          style={s.proofButton}
                          onPress={() => void Linking.openURL(proofLink.signedUrl)}
                        >
                          <Ionicons name="open-outline" size={18} color={UI.primary} />
                          <Text style={s.proofButtonText}>{t('adminUi.codOpenPrivateProof')}</Text>
                        </TouchableOpacity>
                      ) : !proofLoading ? (
                        <Text style={s.proofUnavailable}>{t('adminUi.codProofLinkUnavailable')}</Text>
                      ) : null}

                      {reviewable ? (
                        <View style={s.submissionActions}>
                          {(['approved', 'rejected', 'disputed'] as ReviewDecision[])
                            .filter((decision) => decision !== submission.status)
                            .map((decision) => (
                              <TouchableOpacity
                                key={decision}
                                style={[s.smallAction, { borderColor: DECISION_META[decision].color }]}
                                onPress={() => startSubmissionAction(submission, decision)}
                              >
                                <Text style={[s.smallActionText, { color: DECISION_META[decision].color }]}>
                                  {t(DECISION_META[decision].labelKey)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                {action ? (
                  <View style={s.decisionPanel}>
                    <Text style={s.decisionTitle}>
                      {action.kind === 'submission'
                        ? t(DECISION_META[action.decision].titleKey)
                        : action.disputed ? t('adminUi.codOpenFullDispute') : t('adminUi.codCloseDispute')}
                    </Text>
                    {action.kind === 'submission' ? (
                      <Text style={s.decisionContext}>
                        {t('adminUi.amount')}: {money(action.submission.amount)} — {t('adminUi.transferReference')}: {action.submission.reference}
                      </Text>
                    ) : null}
                    <Text style={s.inputLabel}>{t('adminUi.decisionReasonRequiredPlaceholderShort')}</Text>
                    <TextInput
                      style={s.reasonInput}
                      value={reason}
                      onChangeText={setReason}
                      placeholder={t('adminUi.codDecisionReasonPlaceholder')}
                      placeholderTextColor="#94A3B8"
                      multiline
                      maxLength={2000}
                      editable={!processing}
                      textAlign="right"
                    />
                    <Text style={s.characterCount}>{reason.trim().length}/2000</Text>
                    <View style={s.decisionButtons}>
                      <TouchableOpacity style={s.cancelButton} onPress={() => { setAction(null); setReason(''); }} disabled={processing}>
                        <Text style={s.cancelButtonText}>{t('adminUi.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.confirmButton, processing && s.disabledButton]}
                        onPress={() => void submitAction()}
                        disabled={processing}
                      >
                        {processing ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                        <Text style={s.confirmButtonText}>{t('adminUi.codConfirmSaveDecision')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SummaryCard({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <View style={s.summaryCard}>
      <View style={[s.summaryIcon, { backgroundColor: `${color}14` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={s.summaryValue}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

function AmountCell({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <View style={s.amountCell}>
      <Text style={s.amountLabel}>{label}</Text>
      <Text style={[s.amountValue, emphasized && { color: UI.warning }]}>{value}</Text>
    </View>
  );
}

function InfoLine({ label, value, selectable = false }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View style={s.infoLine}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} selectable={selectable}>{value}</Text>
    </View>
  );
}

function CollectionOverview({ collection }: { collection: CodCollection }) {
  const { t } = useTranslation();
  const meta = COLLECTION_STATUS[collection.status];
  return (
    <View style={s.overviewCard}>
      <View style={s.overviewHeader}>
        <View style={[s.statusBadge, { backgroundColor: meta.background }]}>
          <Text style={[s.statusBadgeText, { color: meta.color }]}>{t(meta.labelKey)}</Text>
        </View>
        <Text style={s.overviewOrder}>{t('adminUi.order')} {collection.order_number ?? collection.order_id.slice(0, 8)}</Text>
      </View>
      <InfoLine label={t('adminUi.courier')} value={collection.delivery_name || collection.delivery_id} />
      <InfoLine label={t('adminUi.codCashReceivedDate')} value={dateTime(collection.collected_at)} />
      <View style={s.amountGrid}>
        <AmountCell label={t('adminUi.codCollected')} value={money(collection.amount_collected)} />
        <AmountCell label={t('adminUi.codApprovedAmount')} value={money(collection.amount_remitted)} />
        <AmountCell label={t('adminUi.codRemaining')} value={money(collection.amount_outstanding)} emphasized />
      </View>
      {Number(collection.amount_pending_review) > 0 ? (
        <Text style={s.pendingNote}>{t('adminUi.codAmountsAwaitingAdmin')}: {money(collection.amount_pending_review)}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.background },
  header: {
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 58 : 24, paddingBottom: 18,
    backgroundColor: UI.card, borderBottomWidth: 1, borderBottomColor: UI.border,
  },
  headerText: { flex: 1, alignItems: 'flex-end' },
  title: { color: UI.text, fontSize: 22, fontFamily: FONTS.bold, textAlign: 'right' },
  subtitle: { color: UI.muted, fontSize: 13, marginTop: 4, textAlign: 'right' },
  backButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center', marginLeft: 14 },
  listContent: { alignSelf: 'center', paddingTop: 12, paddingBottom: 96, flexGrow: 1 },
  columnRow: { gap: 12 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateText: { color: UI.muted, fontSize: 14 },
  summaryGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryCard: { minWidth: 145, flexGrow: 1, flexBasis: 150, backgroundColor: UI.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: UI.border, alignItems: 'flex-end' },
  summaryIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  summaryValue: { color: UI.text, fontSize: 19, fontFamily: FONTS.bold, textAlign: 'right' },
  summaryLabel: { color: UI.muted, fontSize: 12, marginTop: 3, textAlign: 'right' },
  filters: { flexDirection: 'row-reverse', gap: 8, paddingBottom: 16 },
  filterChip: { minHeight: 44, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.card, paddingHorizontal: 15, paddingVertical: 9 },
  filterChipActive: { backgroundColor: UI.primary, borderColor: UI.primary },
  filterText: { color: UI.muted, fontSize: 13, fontFamily: FONTS.semiBold },
  filterTextActive: { color: '#FFFFFF' },
  errorBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', backgroundColor: UI.dangerSoft, borderWidth: 1, borderColor: '#FECACA', borderRadius: 14, padding: 14, marginBottom: 14, gap: 10 },
  errorContent: { flex: 1, alignItems: 'flex-end' },
  errorText: { color: UI.danger, fontSize: 13, lineHeight: 20, textAlign: 'right' },
  retryText: { color: UI.primary, fontFamily: FONTS.bold, marginTop: 7 },
  collectionCard: { flex: 1, minWidth: 0, backgroundColor: UI.card, borderRadius: 16, borderWidth: 1, borderColor: UI.border, padding: 16, marginBottom: 12, ...Platform.select({ web: { boxShadow: '0 3px 12px rgba(15, 23, 42, 0.05)' } as any, default: { elevation: 1 } }) },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontFamily: FONTS.bold },
  orderInfo: { flex: 1, alignItems: 'flex-end' },
  orderNumber: { color: UI.text, fontSize: 17, fontFamily: FONTS.bold, textAlign: 'right' },
  cardDate: { color: UI.muted, fontSize: 11, marginTop: 4, textAlign: 'right' },
  identityRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginTop: 14 },
  identityText: { color: UI.muted, fontSize: 13, textAlign: 'right' },
  amountGrid: { flexDirection: 'row-reverse', gap: 8, marginTop: 14 },
  amountCell: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 11, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'flex-end' },
  amountLabel: { color: UI.muted, fontSize: 10, textAlign: 'right' },
  amountValue: { color: UI.text, fontSize: 13, fontFamily: FONTS.bold, marginTop: 4, textAlign: 'right' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 14, paddingTop: 13, gap: 8 },
  reviewPill: { backgroundColor: '#F1F5F9', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  reviewPillActive: { backgroundColor: UI.warningSoft },
  reviewPillText: { color: UI.muted, fontSize: 11, fontFamily: FONTS.semiBold },
  reviewPillTextActive: { color: UI.warning },
  detailsLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailsLinkText: { color: UI.primary, fontSize: 12, fontFamily: FONTS.bold },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 70 },
  emptyTitle: { color: UI.text, fontSize: 17, fontFamily: FONTS.bold, marginTop: 12 },
  emptyText: { color: UI.muted, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  modalOverlayDesktop: { justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: UI.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '94%', minHeight: '62%', overflow: 'hidden' },
  modalCardDesktop: { borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: UI.card, padding: 17, borderBottomWidth: 1, borderBottomColor: UI.border },
  closeButton: { width: 44, height: 44, borderRadius: 13, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  modalHeaderText: { flex: 1, alignItems: 'flex-end', marginLeft: 12 },
  modalTitle: { color: UI.text, fontSize: 18, fontFamily: FONTS.bold, textAlign: 'right' },
  modalSubtitle: { color: UI.muted, fontSize: 12, marginTop: 3, textAlign: 'right' },
  modalBody: { padding: 16, paddingBottom: 42 },
  overviewCard: { backgroundColor: UI.card, borderRadius: 16, borderWidth: 1, borderColor: UI.border, padding: 15 },
  overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  overviewOrder: { color: UI.text, fontSize: 16, fontFamily: FONTS.bold, textAlign: 'right' },
  infoLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 7 },
  infoLabel: { color: UI.muted, fontSize: 12, textAlign: 'right' },
  infoValue: { flex: 1, color: UI.text, fontSize: 12, fontFamily: FONTS.semiBold, textAlign: 'left' },
  pendingNote: { color: UI.warning, backgroundColor: UI.warningSoft, borderRadius: 9, padding: 10, marginTop: 10, fontSize: 12, fontFamily: FONTS.bold, textAlign: 'right' },
  disputeBanner: { flexDirection: 'row-reverse', alignItems: 'flex-start', backgroundColor: UI.dangerSoft, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', padding: 13, marginTop: 13, gap: 9 },
  disputeBannerText: { flex: 1, alignItems: 'flex-end' },
  disputeTitle: { color: UI.danger, fontFamily: FONTS.bold, fontSize: 13, textAlign: 'right' },
  disputeReason: { color: '#7F1D1D', fontSize: 12, marginTop: 4, lineHeight: 19, textAlign: 'right' },
  collectionActions: { alignItems: 'flex-end', marginTop: 12 },
  outlineAction: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: UI.card },
  outlineActionText: { fontSize: 12, fontFamily: FONTS.bold },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
  sectionTitle: { color: UI.text, fontSize: 16, fontFamily: FONTS.bold, textAlign: 'right' },
  inlineError: { color: UI.danger, backgroundColor: UI.dangerSoft, borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 19, textAlign: 'right', marginBottom: 10 },
  noSubmissions: { backgroundColor: UI.card, borderRadius: 14, borderWidth: 1, borderColor: UI.border, padding: 22 },
  submissionCard: { backgroundColor: UI.card, borderRadius: 16, borderWidth: 1, borderColor: UI.border, padding: 14, marginBottom: 11 },
  submissionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  submissionAmountWrap: { alignItems: 'flex-end' },
  submissionAmount: { color: UI.text, fontSize: 18, fontFamily: FONTS.bold },
  proofButton: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: UI.primarySoft, borderRadius: 11, padding: 11, marginTop: 10 },
  proofButtonText: { color: UI.primary, fontSize: 12, fontFamily: FONTS.bold },
  proofUnavailable: { color: UI.warning, backgroundColor: UI.warningSoft, borderRadius: 9, padding: 9, marginTop: 9, fontSize: 11, textAlign: 'right' },
  submissionActions: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 7, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 11, marginTop: 11 },
  smallAction: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  smallActionText: { fontSize: 11, fontFamily: FONTS.bold },
  decisionPanel: { backgroundColor: UI.card, borderRadius: 16, borderWidth: 1.5, borderColor: UI.primary, padding: 15, marginTop: 13 },
  decisionTitle: { color: UI.text, fontSize: 16, fontFamily: FONTS.bold, textAlign: 'right' },
  decisionContext: { color: UI.muted, fontSize: 12, marginTop: 5, textAlign: 'right' },
  inputLabel: { color: UI.text, fontSize: 12, fontFamily: FONTS.bold, textAlign: 'right', marginTop: 14, marginBottom: 7 },
  reasonInput: { minHeight: 96, maxHeight: 170, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: UI.border, borderRadius: 12, padding: 12, color: UI.text, fontSize: 13, textAlignVertical: 'top' },
  characterCount: { color: UI.muted, fontSize: 10, marginTop: 5, textAlign: 'left' },
  decisionButtons: { flexDirection: 'row', gap: 9, marginTop: 13 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: UI.border, borderRadius: 11, padding: 12, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: UI.muted, fontSize: 12, fontFamily: FONTS.bold },
  confirmButton: { flex: 2, flexDirection: 'row', gap: 7, backgroundColor: UI.primary, borderRadius: 11, padding: 12, alignItems: 'center', justifyContent: 'center' },
  confirmButtonText: { color: '#FFFFFF', fontSize: 12, fontFamily: FONTS.bold },
  disabledButton: { opacity: 0.65 },
});
