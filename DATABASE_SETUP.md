# Database Setup Guide

## Current Setup

**Local Database**: Yes, we're currently using a local PostgreSQL database.

The default connection is:
```
postgresql://localhost:5432/voyaj
```

This is configured in `src/config/index.js` and can be overridden with the `DATABASE_URL` environment variable.

## Supabase Migration

**Will these issues apply to Supabase?** 

**No!** Supabase uses PostgreSQL, so:
- ✅ Same UUID requirements (already fixed in tests)
- ✅ Same schema works
- ✅ Same queries work
- ✅ Just change the `DATABASE_URL` connection string

The only thing that changes is the connection string:
- Local: `postgresql://localhost:5432/voyaj`
- Supabase: `postgresql://[user]:[password]@[host]:[port]/[database]`

## Test Database Setup

For running tests, you have two options:

### Option 1: Use Test Database (Recommended)

Create a separate test database:

```bash
# Create test database
createdb voyaj_test

# Set test database URL
export TEST_DATABASE_URL=postgresql://localhost:5432/voyaj_test

# Run migrations on test database
DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate

# Run tests
npm test
```

### Option 2: Use Mock Database (Current)

The tests use a mock database for most tests. However, some integration tests that use real agents will still hit the real database.

To use only mocks, ensure tests don't import real agents that use the database.

## Fixes Applied

1. ✅ **UUID Generation**: All test helpers now use `crypto.randomUUID()` instead of string IDs
2. ✅ **Mock Database**: Updated to generate proper UUIDs
3. ✅ **Test Helpers**: Updated to use UUIDs by default

## Running Tests

### With Test Database
```bash
# Set up test database
export TEST_DATABASE_URL=postgresql://localhost:5432/voyaj_test
npm test
```

### With Mock Database Only
```bash
# Tests that don't require real database will work
npm run test:unit  # Some will work
npm run test:edge-cases  # All should work
```

## Supabase Connection String Format

When you switch to Supabase, your connection string will look like:

```
postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

Just update your `.env` file:
```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres
```

That's it! No code changes needed.

## Notes

- The schema uses UUIDs (PostgreSQL's `gen_random_uuid()`)
- All foreign keys reference UUIDs
- Tests now generate proper UUIDs
- Same code works for local PostgreSQL and Supabase


