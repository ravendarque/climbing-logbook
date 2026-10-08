-- destructive-migration: nothing has used Better Auth's rateLimit table since #1292 went live in v2.98.0.
DROP TABLE "rateLimit";
