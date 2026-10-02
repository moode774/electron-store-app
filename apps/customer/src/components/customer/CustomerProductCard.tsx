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
import { useTranslation, localized } from '../../i18n';
import { directional } from '../../i18n/directionalStyles';

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
  const isList = variant === 'list';

  return (
    <TouchableOpacity
      style={[styles.card, isList && styles.cardList, style]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayName}, ${t('customer.priceLabel')} ${price} ${t('customer.yemeniRial')}`}
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
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={18}
              color={favorite ? "#2F5BFF" : "#6F7580"}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.info, isList && styles.infoList]}>
        {product.merchant_profiles?.store_name ? (
          <Text style={styles.storeName} numberOfLines={1}>{product.merchant_profiles.store_name}</Text>
        ) : null}
        <Text style={[styles.name, isList && styles.nameList]} numberOfLines={2}>{displayName}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={13} color="#F4B740" />
          <Text style={styles.ratingText}>{Number(product.rating ?? 0).toFixed(1)}</Text>
          {product.total_sold > 0 ? <Text style={styles.soldText}>• {product.total_sold} {t('customer.soldCount')}</Text> : null}
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{price} <Text style={styles.currency}>{t('merchant.currencyYER')}</Text></Text>
          {product.sale_price ? <Text style={styles.oldPrice}>{product.base_price}</Text> : null}
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
          accessibilityLabel={quickActionNeedsOptions ? `${t('customer.chooseOptions')} ${displayName}` : `${t('customer.addToCartAccessibility')} ${displayName}`}
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

const styles = directional(StyleSheet.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E9ECF1',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  cardList: {
    minHeight: 132,
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    padding: 10,
  },
  media: {
    width: '100%',
    aspectRatio: 1.06,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F5F6F8',
  },
  mediaList: {
    width: 112,
    minWidth: 112,
    aspectRatio: 1,
    borderRadius: 14,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F5F8',
  },
  discountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 24,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: '#17191F',
  },
  discountText: {
    color: '#FFFFFF',
    fontFamily: FONTS.bold,
    fontSize: 10,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9ECF1',
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  info: {
    minHeight: 140,
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 54,
  },
  infoList: {
    flex: 1,
    minHeight: 112,
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 14,
    paddingLeft: 58,
  },
  storeName: {
    maxWidth: '100%',
    color: '#8A909B',
    fontFamily: FONTS.semiBold,
    fontSize: 10,
    marginBottom: 3,
    textAlign: 'right',
  },
  name: {
    width: '100%',
    minHeight: 40,
    color: '#1B1D22',
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
    marginTop: 6,
  },
  ratingText: {
    color: '#353941',
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  soldText: {
    color: '#969BA5',
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
    color: '#17191F',
    fontFamily: FONTS.bold,
    fontSize: 16,
    textAlign: 'right',
  },
  currency: {
    color: '#777D89',
    fontFamily: FONTS.medium,
    fontSize: 10,
  },
  oldPrice: {
    color: '#9DA2AC',
    fontFamily: FONTS.regular,
    fontSize: 11,
    textDecorationLine: 'line-through',
  },
  quickButton: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#2F5BFF',
  },
  quickButtonDisabled: {
    opacity: 0.4,
  },
}), 'rtl');
