// Auto-generated Database type for Supabase client generic
// يُستخدم مع createClient<Database>()

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          phone: string | null;
          full_name: string;
          avatar_url: string | null;
          role: 'customer' | 'merchant' | 'delivery' | 'admin';
          is_active: boolean;
          is_verified: boolean;
          admin_role_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email?: string | null;
          phone?: string | null;
          full_name: string;
          avatar_url?: string | null;
          role: 'customer' | 'merchant' | 'delivery' | 'admin';
          is_active?: boolean;
          is_verified?: boolean;
          admin_role_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          phone?: string | null;
          full_name?: string;
          avatar_url?: string | null;
          role?: 'customer' | 'merchant' | 'delivery' | 'admin';
          is_active?: boolean;
          is_verified?: boolean;
          updated_at?: string;
        };
      };
      merchant_profiles: {
        Row: {
          id: string;
          user_id: string;
          store_name: string;
          store_slug: string;
          store_logo_url: string | null;
          store_banner_url: string | null;
          store_description: string | null;
          store_category: string | null;
          commercial_register: string | null;
          address: string | null;
          city: string | null;
          latitude: number | null;
          longitude: number | null;
          rating: number;
          total_reviews: number;
          is_approved: boolean;
          commission_rate: number;
          bank_account: string | null;
          bank_name: string | null;
          service_area_ids: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          store_name: string;
          store_slug: string;
          store_logo_url?: string | null;
          store_banner_url?: string | null;
          store_description?: string | null;
          store_category?: string | null;
          commercial_register?: string | null;
          address?: string | null;
          city?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          rating?: number;
          total_reviews?: number;
          is_approved?: boolean;
          commission_rate?: number;
          bank_account?: string | null;
          bank_name?: string | null;
          service_area_ids?: string[];
          created_at?: string;
        };
        Update: {
          store_name?: string;
          store_logo_url?: string | null;
          store_banner_url?: string | null;
          store_description?: string | null;
          address?: string | null;
          city?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          is_approved?: boolean;
        };
      };
      delivery_profiles: {
        Row: {
          id: string;
          user_id: string;
          national_id: string | null;
          vehicle_type: 'motorcycle' | 'car' | 'bicycle' | null;
          vehicle_plate: string | null;
          current_latitude: number | null;
          current_longitude: number | null;
          is_online: boolean;
          is_approved: boolean;
          rating: number;
          total_deliveries: number;
          wallet_balance: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          national_id?: string | null;
          vehicle_type?: 'motorcycle' | 'car' | 'bicycle' | null;
          vehicle_plate?: string | null;
          current_latitude?: number | null;
          current_longitude?: number | null;
          is_online?: boolean;
          is_approved?: boolean;
          rating?: number;
          total_deliveries?: number;
          wallet_balance?: number;
          created_at?: string;
        };
        Update: {
          current_latitude?: number | null;
          current_longitude?: number | null;
          is_online?: boolean;
          is_approved?: boolean;
          rating?: number;
          total_deliveries?: number;
          wallet_balance?: number;
        };
      };
      customer_profiles: {
        Row: {
          id: string;
          user_id: string;
          loyalty_points: number;
          wallet_balance: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          loyalty_points?: number;
          wallet_balance?: number;
          created_at?: string;
        };
        Update: {
          loyalty_points?: number;
          wallet_balance?: number;
        };
      };
      products: {
        Row: {
          id: string;
          merchant_id: string;
          category_id: string | null;
          name: string;
          name_ar: string | null;
          description: string | null;
          description_ar: string | null;
          base_price: number;
          sale_price: number | null;
          sku: string | null;
          is_active: boolean;
          is_featured: boolean;
          weight: number | null;
          total_sold: number;
          rating: number;
          tags: string[];
          share_url: string | null;
          og_image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          merchant_id: string;
          category_id?: string | null;
          name: string;
          name_ar?: string | null;
          description?: string | null;
          description_ar?: string | null;
          base_price: number;
          sale_price?: number | null;
          sku?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          weight?: number | null;
          tags?: string[];
          created_at?: string;
        };
        Update: {
          name?: string;
          name_ar?: string | null;
          description?: string | null;
          base_price?: number;
          sale_price?: number | null;
          is_active?: boolean;
          is_featured?: boolean;
          tags?: string[];
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          customer_id: string;
          merchant_id: string;
          delivery_id: string | null;
          address_id: string;
          group_id: string | null;
          status: string;
          subtotal: number | null;
          delivery_fee: number;
          discount_amount: number;
          platform_commission: number | null;
          tax_amount: number;
          total_amount: number | null;
          payment_method: string | null;
          payment_status: string;
          coupon_id: string | null;
          notes: string | null;
          is_scheduled: boolean;
          scheduled_at: string | null;
          estimated_delivery_time: string | null;
          delivered_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          cancellation_reason_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          customer_id: string;
          merchant_id: string;
          delivery_id?: string | null;
          address_id: string;
          group_id?: string | null;
          status?: string;
          subtotal?: number | null;
          delivery_fee?: number;
          discount_amount?: number;
          tax_amount?: number;
          total_amount?: number | null;
          payment_method?: string | null;
          payment_status?: string;
          coupon_id?: string | null;
          notes?: string | null;
          is_scheduled?: boolean;
          created_at?: string;
        };
        Update: {
          status?: string;
          delivery_id?: string | null;
          platform_commission?: number | null;
          estimated_delivery_time?: string | null;
          delivered_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          payment_status?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          body: string | null;
          type: string | null;
          data: Record<string, unknown> | null;
          is_read: boolean;
          channel: string;
          sent_at: string | null;
          failed_reason: string | null;
          push_claim_token: string | null;
          push_claimed_at: string | null;
          push_dispatched_at: string | null;
          push_attempt_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          body?: string | null;
          type?: string | null;
          data?: Record<string, unknown> | null;
          is_read?: boolean;
          channel?: string;
          sent_at?: string | null;
          push_claim_token?: string | null;
          push_claimed_at?: string | null;
          push_dispatched_at?: string | null;
          push_attempt_count?: number;
          created_at?: string;
        };
        Update: {
          is_read?: boolean;
        };
      };
      // باقي الجداول — نفس النمط
      [key: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Views: {
      v_order_summary: {
        Row: {
          id: string;
          order_number: string;
          status: string;
          total_amount: number | null;
          platform_commission: number | null;
          created_at: string;
          customer_name: string | null;
          customer_phone: string | null;
          store_name: string | null;
          delivery_name: string | null;
          delivery_address: string | null;
        };
      };
      v_developer_earnings: {
        Row: {
          date: string;
          daily_commission: number;
          orders_count: number;
        };
      };
    };
    Functions: Record<string, unknown>;
    Enums: Record<string, unknown>;
  };
}
