import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '@marketplace/shared-hooks';

export default function CartScreen({ navigation }: any) {
  const { getItemsByStore, getTotalPrice, updateQuantity, removeFromCart, items } = useCartStore();

  const groupedItems = getItemsByStore();
  const totalPrice = getTotalPrice();

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <View style={styles.emptyIconCircle}>
          <Ionicons name="cart-outline" size={48} color="#9CA3AF" />
        </View>
        <Text style={styles.emptyTitle}>السلة فارغة</Text>
        <Text style={styles.emptySub}>تصفح المتاجر وأضف ما يعجبك إلى السلة</Text>
        <TouchableOpacity 
          style={styles.browseBtn}
          onPress={() => navigation.navigate('Home', { screen: 'StoresList' })}
          activeOpacity={0.8}
        >
          <Text style={styles.browseBtnText}>تصفح المتاجر</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>سلة المشتريات</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {Object.entries(groupedItems).map(([storeId, storeItems]) => (
          <View key={storeId} style={styles.storeCard}>
            <View style={styles.storeHeader}>
              <Ionicons name="storefront-outline" size={18} color="#111827" />
              <Text style={styles.storeName}>{storeItems[0].storeName}</Text>
            </View>
            
            {storeItems.map((item) => (
              <View key={item.id} style={styles.cartItem}>
                <View style={styles.itemImageWrap}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.itemImage} resizeMode="cover" />
                  ) : (
                    <Ionicons name="cube-outline" size={24} color="#6B7280" />
                  )}
                </View>
                
                <View style={styles.itemInfo}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    <TouchableOpacity onPress={() => removeFromCart(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.itemBottomRow}>
                    <Text style={styles.itemPrice}>{item.price} ر.ي</Text>
                    
                    <View style={styles.quantityWrap}>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, item.quantity - 1)}>
                        <Ionicons name="remove" size={16} color="#111827" />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{item.quantity}</Text>
                      <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.id, item.quantity + 1)}>
                        <Ionicons name="add" size={16} color="#111827" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Bottom Summary */}
      <View style={styles.bottomBar}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>الإجمالي المبدئي</Text>
          <Text style={styles.summaryValue}>{totalPrice} ر.ي</Text>
        </View>
        <TouchableOpacity 
          style={styles.checkoutBtn}
          onPress={() => navigation.navigate('Checkout')}
          activeOpacity={0.8}
        >
          <Text style={styles.checkoutBtnText}>إتمام الطلب</Text>
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    fontWeight: '500',
  },
  browseBtn: {
    backgroundColor: '#111827',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
  },
  browseBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  storeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 16,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  cartItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  itemImageWrap: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 16, // RTL
    overflow: 'hidden',
  },
  itemImage: {
    width: 80,
    height: 80,
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 12,
    lineHeight: 20,
    textAlign: 'left',
  },
  itemBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  quantityWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  qtyText: {
    width: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.03,
    shadowRadius: 20,
    elevation: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 20,
    color: '#111827',
    fontWeight: '800',
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 16,
  },
  checkoutBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
