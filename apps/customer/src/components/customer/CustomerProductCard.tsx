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
import { FONTS } from '@marketplace/shared-utils';
import { useTranslation, localized } from '../../i18n';
import { directional } from '../../i18n/directionalStyles';
import { CT, CT_RADIUS, formatAmount } from '../../theme/customerTheme';

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
  const { t } = useTranslation();
  const images = useMemo(() => imageCandidates(product), [product]);
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = images[imageIndex];
  const displayName = localized(product.name_ar, product.name);
  const price = product.sale_price ?? product.base_price;
  const discount = product.sale_price && product.base_price > 0
    ? Math.max(0, Math.round(((product.base_price - product.sale_price) / product.base_price) * 100))
    : 0;
  const rating = Number(product.rating ?? 0);
  const isList = variant === 'list';

  return (
    <TouchableOpacity
      style={[styles.card, isList && styles.cardList, style]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${t('customer.priceLabel')} ${formatAmount(price)} ${t('customer.yemeniRial')}`}
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
            <Ionicons name="bag-handle-outline" size={isList ? 26 : 34} color={CT.navyTint} />
          </View>
        )}
        {discount > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discount}%</Text>
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
            accessibilityLabel={favorite ? t('customer.removeFavorite') : t('customer.addFavorite')}
            accessibilityState={{ selected: favorite }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={17}
              color={favorite ? CT.danger : CT.ink}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.info, isList && styles.infoList]}>
        {product.merchant_profiles?.store_name ? (
          <Text style={styles.storeName} numberOfLines={1}>{product.merchant_profiles.store_name}</Text>
        ) : null}
        <Text style={[styles.name, isList && styles.nameList]} numberOfLines={2}>{displayName}</Text>

        {rating > 0 || product.total_sold > 0 ? (
          <View style={styles.metaRow}>
            {rating > 0 ? (
              <View style={styles.ratingChip}>
                <Ionicons name="star" size={11} color={CT.star} />
                <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
              </View>
            ) : null}
            {product.total_sold > 0 ? (
              <Text style={styles.soldText} numberOfLines={1}>
                {formatAmount(product.total_sold)} {t('customer.soldCount')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <View style={styles.priceCol}>
            <Text style={styles.price} numberOfLines={1}>
              {formatAmount(price)}
              <Text style={styles.currency}> {t('merchant.currencyYER')}</Text>
            </Text>
            {product.sale_price ? (
              <Text style={styles.oldPrice} numberOfLines={1}>{formatAmount(product.base_price)}</Text>
            ) : null}
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
              accessibilityLabel={quickActionNeedsOptions ? `${t('customer.chooseOptions')} ${displayName}` : `${t('customer.addToCartAccessibility')} ${displayName}`}
              accessibilityState={{ disabled: quickActionDisabled }}
            >
              <Ionicons
                name="add"
                size={22}
                color={quickActionDisabled ? CT.inkMuted : CT.surface}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = directional(StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CT.hairline,
    borderRadius: CT_RADIUS.lg,
    backgroundColor: CT.surface,
  },
  cardList: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    padding: 10,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: CT.surfaceMuted,
  },
  mediaList: {
    width: 108,
    minWidth: 108,
    aspectRatio: 1,
    borderRadius: CT_RADIUS.md,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.navy,
  },
  discountText: {
    color: CT.ivory,
    fontFamily: FONTS.bold,
    fontSize: 10.5,
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CT_RADIUS.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  info: {
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  infoList: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 2,
    paddingHorizontal: 12,
  },
  storeName: {
    maxWidth: '100%',
    color: CT.inkMuted,
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    marginBottom: 2,
    textAlign: 'right',
  },
  name: {
    width: '100%',
    minHeight: 38,
    color: CT.ink,
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'right',
  },
  nameList: {
    minHeight: 0,
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  ratingChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    color: CT.ink,
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  soldText: {
    flexShrink: 1,
    color: CT.inkMuted,
    fontFamily: FONTS.regular,
    fontSize: 10.5,
  },
  footerRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
  },
  priceCol: {
    flex: 1,
    minHeight: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  price: {
    color: CT.navy,
    fontFamily: FONTS.bold,
    fontSize: 15,
    textAlign: 'right',
  },
  currency: {
    color: CT.inkSecondary,
    fontFamily: FONTS.medium,
    fontSize: 10,
  },
  oldPrice: {
    color: CT.inkMuted,
    fontFamily: FONTS.regular,
    fontSize: 11,
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  quickButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CT_RADIUS.pill,
    backgroundColor: CT.navy,
  },
  quickButtonDisabled: {
    backgroundColor: CT.surfaceMuted,
  },
}), 'rtl');
