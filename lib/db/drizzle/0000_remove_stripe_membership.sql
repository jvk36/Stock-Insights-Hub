DO $$
BEGIN
  IF to_regclass('public.memberships') IS NOT NULL THEN
    UPDATE "memberships"
    SET "role" = 'free', "updated_at" = NOW()
    WHERE "role" <> 'admin';

    DROP INDEX IF EXISTS "memberships_stripe_customer_idx";

    ALTER TABLE "memberships"
      DROP COLUMN IF EXISTS "stripe_customer_id",
      DROP COLUMN IF EXISTS "stripe_subscription_id",
      DROP COLUMN IF EXISTS "subscription_status",
      DROP COLUMN IF EXISTS "plan",
      DROP COLUMN IF EXISTS "current_period_end";
  END IF;
END
$$;