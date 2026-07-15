CREATE OR REPLACE FUNCTION public.notify_refund_participants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_merchant_user uuid; v_order_number text;
BEGIN
  SELECT m.user_id,o.order_number INTO v_merchant_user,v_order_number FROM public.orders o JOIN public.merchant_profiles m ON m.id=o.merchant_id WHERE o.id=NEW.order_id;
  IF TG_OP='INSERT' THEN INSERT INTO public.notifications(user_id,title,body,type,is_read,channel) VALUES(v_merchant_user,'طلب استرجاع جديد','يوجد طلب استرجاع للطلب '||COALESCE(v_order_number,''),'refund_request',false,'in_app');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN INSERT INTO public.notifications(user_id,title,body,type,is_read,channel) VALUES(NEW.customer_id,'تحديث طلب الاسترجاع','تم تحديث طلب الاسترجاع للطلب '||COALESCE(v_order_number,'')||' إلى: '||NEW.status,'refund_update',false,'in_app'); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_refund_participants ON public.refund_requests;
CREATE TRIGGER trg_notify_refund_participants AFTER INSERT OR UPDATE OF status ON public.refund_requests FOR EACH ROW EXECUTE FUNCTION public.notify_refund_participants();
