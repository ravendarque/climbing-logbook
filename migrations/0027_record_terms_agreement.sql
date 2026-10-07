-- Which version of the terms of use each account agreed to at sign-up, and when.
ALTER TABLE "user" ADD COLUMN termsVersion TEXT;
ALTER TABLE "user" ADD COLUMN termsAgreedAt DATE;
