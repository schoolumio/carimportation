process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://autovault:autovault@localhost:5432/autovault_test";
process.env.APP_SECRET = "test-secret-0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.DATA_ENCRYPTION_KEY = "1f1c2a3b4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8";
process.env.SANDBOX_WEBHOOK_SECRET = "test-sandbox-webhook-secret-123456";
process.env.STORAGE_DIR = "./storage/test";
process.env.PAYMENT_PROVIDER = "SANDBOX";
process.env.EMAIL_TRANSPORT = "console";
(process.env as Record<string, string>).NODE_ENV = "test";
