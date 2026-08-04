import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getWishlist, removeFromWishlist, useAuthStore, WishlistItem } from '@marketplace/shared-hooks';
import { COLORS, FONTS, RADIUS } from '@marketplace/shared-utils';
import { Alert } from '../../../components/appAlert';
import { CustomerProductCard } from '../../../components/customer/CustomerProductCard';
import { CustomerResponsiveShell, useCustomerLayout } from '../../../components/customer/CustomerResponsiveShell';
import { t, tv } from '@marketplace/shared-i18n';

export default function FavoritesScreen({ navigation }: any): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const layout = useCustomerLayout();
  const columns = layout.width < 680 ? 1 : layout.width < 980 ? 2 : layout.width < 1320 ? 3 : 4;
  const gap = layout.compact ? 10 : 16;
  const cardWidth = columns === 1 ? layout.usableWidth : (layout.usableWidth - gap * (columns - 1)) / columns;
  const user = useAuthStore((state) => state.user);
  const [favorites, setFavorites] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoadError('');
    try {
      setFavorites(await getWishlist(user.id));
    } catch (error) {
      setLoadError(error instanceof Error && error.message ? error.message : 'تعذّر تحميل المفضلة.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const removeFavorite = async (productId: string) => {
    if (!user?.id) return;
    const removed = favorites.find((favorite) => favorite.product_id === productId);
    if (!removed) return;
    setFavorites((current) => current.filter((favorite) => favorite.product_id !== productId));
    try {
      await removeFromWishlist(user.id, productId);
    } catch (error: any) {
      setFavorites((current) => current.some((favorite) => favorite.product_id === productId) ? current : [removed, ...current]);
      Alert.alert('تعذّر إزالة المنتج', error?.message ?? 'لم تتغير قائمة المفضلة. حاول مجددًا.');
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <CustomerResponsiveShell style={styles.headerShell}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel={t('العودة')}
          >
            <Ionicons name="arrow-forward" size={21} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>{t('المفضلة')}</Text>
            <Text style={styles.headerSubtitle}>{t('كل اختياراتك المحفوظة في مكان واحد')}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </CustomerResponsiveShell>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : loadError ? (
        <View style={styles.centerState} accessibilityRole="alert">
          <View style={[styles.stateIcon, styles.errorIcon]}>
            <Ionicons name="cloud-offline-outline" size={38} color={COLORS.error} />
          </View>
          <Text style={styles.emptyTitle}>{t('تعذّر تحميل المفضلة')}</Text>
          <Text style={styles.emptyText}>{tv(loadError)}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => { setLoading(true); void load(); }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>{t('إعادة المحاولة')}</Text>
          </TouchableOpacity>
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons name="heart-outline" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('قائمتك بانتظار اختياراتك')}</Text>
          <Text style={styles.emptyText}>{t('اضغط على أيقونة القلب في أي منتج ليظهر هنا.')}</Text>
        </View>
      ) : (
        <FlatList
          key={`favorites-columns-${columns}`}
          data={favorites}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            {
              width: '100%',
              maxWidth: 1320,
              paddingHorizontal: layout.gutter,
              gap,
            },
          ]}
          columnWrapperStyle={columns > 1 ? [styles.row, { gap }] : undefined}
          ListHeaderComponent={(
            <View style={styles.listHeader}>
              <Text style={styles.listCount}>{t('{0} منتج محفوظ', [tv(favorites.length)])}</Text>
              <Text style={styles.listTitle}>{t('اختياراتك')}</Text>
            </View>
          )}
          renderItem={({ item }) => item.products ? (
            <CustomerProductCard
              product={item.products}
              variant={columns === 1 ? 'list' : 'grid'}
              style={{ width: cardWidth }}
              favorite
              onPress={() => navigation.navigate('Home', { screen: 'ProductDetails', params: { productId: item.product_id } })}
              onToggleFavorite={() => void removeFavorite(item.product_id)}
            />
          ) : (
            <View style={[styles.unavailableCard, { width: cardWidth }]}>
              <Ionicons name="alert-circle-outline" size={25} color={COLORS.textMuted} />
              <Text style={styles.unavailableText}>{t('هذا المنتج لم يعد متاحاً')}</Text>
              <TouchableOpacity style={styles.removeButton} onPress={() => void removeFavorite(item.product_id)} accessibilityRole="button">
                <Text style={styles.removeText}>{t('إزالة من القائمة')}</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  headerShell: {
    minHeight: 78,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.surface,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 18,
  },
  headerSubtitle: {
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    marginTop: 1,
  },
  headerSpacer: {
    width: 44,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  stateIcon: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 29,
    backgroundColor: COLORS.primarySoft,
    marginBottom: 16,
  },
  errorIcon: {
    backgroundColor: COLORS.accentCoralSoft,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 17,
    textAlign: 'center',
  },
  emptyText: {
    maxWidth: 420,
    color: COLORS.textMuted,
    fontFamily: FONTS.regular,
    fontSize: 12.5,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 5,
  },
  retryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    marginTop: 15,
  },
  retryText: {
    color: COLORS.surface,
    fontFamily: FONTS.semiBold,
    fontSize: 12,
  },
  listContent: {
    alignSelf: 'center',
    paddingTop: 18,
    paddingBottom: 110,
  },
  row: {
    flexDirection: 'row-reverse',
  },
  listHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  listTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontSize: 18,
  },
  listCount: {
    color: COLORS.textMuted,
    fontFamily: FONTS.medium,
    fontSize: 11,
  },
  unavailableCard: {
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  unavailableText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.medium,
    fontSize: 12,
  },
  removeText: {
    color: COLORS.error,
    fontFamily: FONTS.semiBold,
    fontSize: 11,
  },
  removeButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
