import React, { useMemo, useState } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProductSummary } from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { t, tv } from '@marketplace/shared-i18n';

type Props = {
  product: ProductSummary;
  variant?: 'grid' | 'list';
  style?: StyleProp<ViewStyle>;
  favorite?: boolean;
  onPress: () => void;
  onToggleFavorite?: () => void;
  onQuickAction?: () => void;
  quickActionNeedsOptions?: boolean;
  quickActionDisabled?: boolean;
};

function imageCandidates(product: ProductSummary): string[] {
  return [
    product.og_image_url,
    ...[...(product.product_images ?? [])]
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
      .map((image) => image.url),
  ].filter((url): url is string => Boolean(url));
}

export function CustomerProductCard({
  product,
  variant = 'grid',
  style,
  favorite = false,
  onPress,
  onToggleFavorite,
  onQuickAction,
  quickActionNeedsOptions = false,
  quickActionDisabled = false,
}: Props): React.JSX.Element {
  const images = useMemo(() => imageCandidates(product), [product]);
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = images[imageIndex];
  const price = product.sale_price ?? product.base_price;
  const discount = product.sale_price && product.base_price > 0
    ? Math.max(0, Math.round(((product.base_price - product.sale_price) / product.base_price) * 100))
    : 0;
  const isList = variant === 'list';

  return (
    <TouchableOpacity
      style={[styles.card, isList && styles.cardList, style]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('{0}، السعر {1} ريال يمني', [tv(product.name), tv(price)])}
    >
      <View style={[styles.media, isList && styles.mediaList]}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageIndex((index) => index + 1)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="bag-handle-outline" size={isList ? 30 : 40} color={COLORS.primaryLight} />
          </View>
        )}
        {discount > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{tv(discount)}%</Text>
          </View>
        ) : null}
        {onToggleFavorite ? (
          <TouchableOpacity
            style={styles.favoriteButton}
            onPress={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            accessibilityRole="button"
            accessibilityLabel={favorite ? t('إزالة من المفضلة') : t('إضافة إلى المفضلة')}
            accessibilityState={{ selected: favorite }}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={18}
              color={favorite ? COLORS.accentCoral : COLORS.textSecondary}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.info, isList && styles.infoList]}>
        {product.merchant_profiles?.store_name ? (
          <Text style={styles.storeName} numberOfLines={1}>{tv(product.merchant_profiles.store_name)}</Text>
        ) : null}
        <Text style={[styles.name, isList && styles.nameList]} numberOfLines={2}>{tv(product.name)}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={13} color="#F4B740" />
          <Text style={styles.ratingText}>{tv(Number(product.rating ?? 0).toFixed(1))}</Text>
          {product.total_sold > 0 ? <Text style={styles.soldText}>{t('• {0} مبيع', [tv(product.total_sold)])}</Text> : null}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{tv(price)} <Text style={styles.currency}>{t('ر.ي')}</Text></Text>
          {product.sale_price ? <Text style={styles.oldPrice}>{tv(product.base_price)}</Text> : null}
        </View>
      </View>

      {onQuickAction ? (
        <TouchableOpacity
          style={[styles.quickButton, quickActionDisabled && styles.quickButtonDisabled]}
          onPress={(event) => {
            event.stopPropagation();
            onQuickAction();
          }}
          disabled={quickActionDisabled}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={quickActionNeedsOptions ? t('اختيار خيارات {0}', [tv(product.name)]) : t('إضافة {0} إلى السلة', [tv(product.name)])}
          accessibilityState={{ disabled: quickActionDisabled }}
        >
          <Ionicons
            name={quickActionNeedsOptions ? 'options-outline' : 'bag-add-outline'}
            size={18}
            color={COLORS.surface}
          />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 2,
  },
  cardList: {
    minHeight: 132,
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    padding: 10,
  },
  media: {
    width: '100%',
    aspectRatio: 1.03,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceMuted,
  },
  mediaList: {
    width: 112,
    minWidth: 112,
    aspectRatio: 1,
    borderRadius: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  discountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accentCoral,
  },
  discountText: {
    color: COLORS.surface,
    fontFamily: FONTS.bold,
    fontSize: 10,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  info: {
    minHeight: 168,
    alignItems: 'flex-end',
    padding: 14,
    paddingBottom: 64,
  },
  infoList: {
    flex: 1,
    minHeight: 112,
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 14,
    paddingLeft: 60,
  },
  storeName: {
    maxWidth: '100%',
    color: COLORS.primary,
    fontFamily: FONTS.semiBold,
    fontSize: 10.5,
    marginBottom: 3,
    textAlign: 'right',
  },
  name: {
    width: '100%',
    minHeight: 40,
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
  },
  nameList: {
    minHeight: 0,
    fontSize: 15,
    lineHeight: 22,
  },
  ratingRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 7,
  },
  ratingText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  soldText: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 10,
  },
  priceRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'baseline',
    gap: 7,
    marginTop: 8,
  },
  price: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 17,
    textAlign: 'right',
  },
  currency: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.medium,
    fontSize: 10,
  },
  oldPrice: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  quickButton: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  quickButtonDisabled: {
    opacity: 0.4,
  },
});
