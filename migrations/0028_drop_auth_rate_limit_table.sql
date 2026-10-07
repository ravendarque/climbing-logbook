-- destructive-migration: Better Auth's rate limiter is off; the Rate Limiting binding counts auth requests instead (#1292).
DROP TABLE "rateLimit";
