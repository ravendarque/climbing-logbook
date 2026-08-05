-- Better Auth's own schema (#20) -- user/session/account/verification,
-- plus the username plugin's `username`/`displayUsername` columns on
-- `user`. Generated via `pnpm run auth:generate` against auth.config.mjs
-- (see that file's header comment) and committed verbatim, not hand-
-- written -- matches this repo's existing "regenerate offline, commit the
-- output" convention (scripts/generate-countries.mjs,
-- scripts/generate-world-map.mjs), so nothing at deploy/dev time depends
-- on the generator itself. Do not hand-edit -- rerun the generate command
-- and produce a new numbered migration for any schema change instead
-- (e.g. adding a plugin), so Better Auth's own runtime queries stay in
-- sync with whatever it thinks its schema looks like.

create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "username" text unique, "displayUsername" text);

create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

create index "session_userId_idx" on "session" ("userId");

create index "account_userId_idx" on "account" ("userId");

create index "verification_identifier_idx" on "verification" ("identifier");
