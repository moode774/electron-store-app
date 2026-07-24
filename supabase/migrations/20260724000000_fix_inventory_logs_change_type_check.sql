-- Fix constraint on inventory_logs.change_type to allow order reservations, releases, and return restocks
ALTER TABLE public.inventory_logs
  DROP CONSTRAINT IF EXISTS inventory_logs_change_type_check;

ALTER TABLE public.inventory_logs
  ADD CONSTRAINT inventory_logs_change_type_check
  CHECK (
    change_type IS NULL OR change_type IN (
      'reservation',
      'release',
      'return_restock',
      'add',
      'subtract',
      'set',
      'purchase',
      'sale',
      'adjustment',
      'return',
      'initial_stock',
      'manual_adjustment',
      'cancel',
      'refund',
      'order_reservation',
      'order_release'
    )
  );
