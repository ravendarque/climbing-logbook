-- destructive-migration: the report and feedback forms are limited by the SUBMISSION_LIMITER binding since #1049, so nothing reads or writes rate_limits.
DROP TABLE rate_limits;
