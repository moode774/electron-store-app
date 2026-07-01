-- ============================================================
-- ORDER LIFECYCLE AUTOMATION
-- أتمتة ما بعد تغيّر حالة الطلب: أرباح المندوب، سجل الحالات، الإشعارات.
-- كل شيء idempotent وغير مُتلِف:
--   * الدوال/التريغرات الجديدة تُعاد بأمان (DROP TRIGGER IF EXISTS + CREATE).
--   * الدوال التي قد تكون موجودة أصلاً في القاعدة الحية (notify_order_events,
--     award_loyalty_on_delivery) تُنشأ فقط إن لم تكن موجودة — فلا نلمس نسخة الإنتاج.
-- ============================================================

-- ---- 1) أرباح المندوب عند التسليم (فجوة حقيقية: الشاشة كانت فارغة دائماً) ----
CREATE OR REPLACE FUNCTION public.award_delivery_earning()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_fee NUMERIC;
BEGIN
  -- فقط عند الانتقال الفعلي إلى "تم التسليم" ومع وجود مندوب مُسنَد
  IF NEW.status = 'delivered'
     AND COALESCE(OLD.status, '') <> 'delivered'
     AND NEW.delivery_id IS NOT NULL THEN

    v_fee := COALESCE(NEW.delivery_fee, 0);

    INSERT INTO public.delivery_earnings (delivery_id, order_id, base_earning, total_earning)
    VALUES (NEW.delivery_id, NEW.id, v_fee, v_fee);

    UPDATE public.delivery_profiles
       SET total_deliveries = COALESCE(total_deliveries, 0) + 1,
           wallet_balance   = COALESCE(wallet_balance, 0) + v_fee
     WHERE id = NEW.delivery_id;

    -- ختم وقت التسليم إن لم يُضبط
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE UPDATE حتى نتمكن من ضبط delivered_at ضمن نفس الصف
DROP TRIGGER IF EXISTS trg_award_delivery_earning ON public.orders;
CREATE TRIGGER trg_award_delivery_earning
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.award_delivery_earning();

-- ---- 2) سجل حالات الطلب (order_tracking) ----------------------
-- العملاء ممنوعون من الكتابة المباشرة (RLS)، فنسجّل الحالات عبر تريغر آمن.
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_tracking (order_id, status, created_by)
    VALUES (NEW.id, NEW.status, COALESCE(NEW.delivery_id, NEW.merchant_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_status ON public.orders;
CREATE TRIGGER trg_log_order_status
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

-- ---- 3) إشعارات دورة حياة الطلب (fresh-build فقط؛ لا يُلمس الإنتاج) ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'notify_order_events'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.notify_order_events()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
      DECLARE v_label TEXT;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          -- إشعار التاجر بطلب جديد
          INSERT INTO public.notifications (user_id, title, body, type, channel)
          VALUES (NEW.merchant_id, 'طلب جديد',
                  'لديك طلب جديد رقم ' || NEW.order_number, 'order_new', 'in_app');
          RETURN NEW;
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
          v_label := CASE NEW.status
            WHEN 'preparing'  THEN 'قبل المتجر طلبك وبدأ التجهيز'
            WHEN 'ready'      THEN 'طلبك جاهز وبانتظار المندوب'
            WHEN 'assigned'   THEN 'تم إسناد طلبك لمندوب توصيل'
            WHEN 'on_the_way' THEN 'مندوبك في الطريق إليك'
            WHEN 'delivered'  THEN 'تم تسليم طلبك، بالهناء والشفاء'
            WHEN 'cancelled'  THEN 'تم إلغاء طلبك'
            ELSE NULL END;
          IF v_label IS NOT NULL THEN
            INSERT INTO public.notifications (user_id, title, body, type, channel)
            VALUES (NEW.customer_id, 'تحديث طلبك',
                    v_label || ' (' || NEW.order_number || ')', 'order_status', 'in_app');
          END IF;
        END IF;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.notify_order_events() FROM anon, authenticated, public;';

    DROP TRIGGER IF EXISTS trg_notify_order_events ON public.orders;
    CREATE TRIGGER trg_notify_order_events
      AFTER INSERT OR UPDATE OF status ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.notify_order_events();
  END IF;
END $$;

-- ---- 3.5) تحديث ملخص المحادثة عند وصول رسالة (fresh-build فقط) ----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'on_chat_message'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.on_chat_message()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
      DECLARE v_customer UUID; v_merchant UUID;
      BEGIN
        SELECT customer_id, merchant_id INTO v_customer, v_merchant
        FROM public.chat_conversations WHERE id = NEW.conversation_id;

        UPDATE public.chat_conversations
           SET last_message    = NEW.message,
               last_message_at = NEW.created_at,
               customer_unread = customer_unread + (CASE WHEN NEW.sender_id = v_customer THEN 0 ELSE 1 END),
               merchant_unread = merchant_unread + (CASE WHEN NEW.sender_id = v_merchant THEN 0 ELSE 1 END)
         WHERE id = NEW.conversation_id;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.on_chat_message() FROM anon, authenticated, public;';

    DROP TRIGGER IF EXISTS trg_on_chat_message ON public.chat_messages;
    CREATE TRIGGER trg_on_chat_message
      AFTER INSERT ON public.chat_messages
      FOR EACH ROW EXECUTE FUNCTION public.on_chat_message();
  END IF;
END $$;

-- ---- 4) نقاط ولاء العميل عند التسليم (fresh-build فقط) --------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'award_loyalty_on_delivery'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.award_loyalty_on_delivery()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
      DECLARE v_points INTEGER; v_new_balance INTEGER;
      BEGIN
        IF NEW.status = 'delivered' AND COALESCE(OLD.status,'') <> 'delivered' THEN
          -- نقطة واحدة لكل 100 من قيمة الطلب
          v_points := FLOOR(COALESCE(NEW.total_amount, 0) / 100);
          IF v_points > 0 THEN
            UPDATE public.customer_profiles
               SET loyalty_points = COALESCE(loyalty_points, 0) + v_points
             WHERE user_id = NEW.customer_id
             RETURNING loyalty_points INTO v_new_balance;

            INSERT INTO public.loyalty_transactions (user_id, action, points, balance_after)
            VALUES (NEW.customer_id, 'order_delivered', v_points, v_new_balance);
          END IF;
        END IF;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.award_loyalty_on_delivery() FROM anon, authenticated, public;';

    DROP TRIGGER IF EXISTS trg_award_loyalty ON public.orders;
    CREATE TRIGGER trg_award_loyalty
      AFTER UPDATE OF status ON public.orders
      FOR EACH ROW EXECUTE FUNCTION public.award_loyalty_on_delivery();
  END IF;
END $$;
