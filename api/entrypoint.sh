#!/bin/sh
set -e

echo "Starting NestJS API..."

# Wait for database to be ready
echo "Waiting for database to be ready..."
until nc -z ${DATABASE_HOST:-db} ${DATABASE_PORT:-5432}; do
    echo "Database is unavailable - sleeping"
    sleep 2
done
echo "Database is ready!"

# Generate Prisma client (needed when source is volume-mounted in dev)
echo "Generating Prisma client..."
npx prisma generate

# Run Prisma migrations
echo "Running database migrations..."
npx prisma migrate deploy
echo "Migrations completed!"

# tsx is a devDependency, so this only runs in the dev image.
if [ -x node_modules/.bin/tsx ]; then
    echo "Seeding content bank if empty..."
    SEED_IF_EMPTY=1 npm run seed
fi

echo "Setup complete! Starting application..."

# Execute the main command
exec "$@"
