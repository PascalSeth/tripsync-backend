import { config } from "dotenv"
config()

export const env = {
  PORT: process.env.PORT || "3000",
  DATABASE_URL: process.env.DATABASE_URL!,
  DIRECT_URL: process.env.DIRECT_URL!,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY!,
  JWT_SECRET: process.env.JWT_SECRET!,
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN!,
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY!,
  PAYSTACK_CALLBACK_URL: process.env.PAYSTACK_CALLBACK_URL!,
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_KEY: process.env.SUPABASE_KEY!,
}
