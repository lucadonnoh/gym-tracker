#!/bin/bash
# Copy production database and test locally
#
# This script copies the production database from the server and runs
# the app locally against it for testing.
#
# Usage:
#   ./scripts/test-with-prod-db.sh
#
# Prerequisites:
#   - SSH access to the server (donnoh@192.168.1.61)
#   - The PROD_DB_PATH environment variable set, or update the path below

set -e

SERVER="donnoh@192.168.1.61"
# Coolify stores volumes in /var/lib/docker/volumes/<volume-name>/_data/
# Update this path based on your Coolify deployment
PROD_DB_PATH="${PROD_DB_PATH:-/var/lib/coolify/gym-tracker/gym.db}"
LOCAL_TEST_DB="./gym-test.db"

echo "Copying production database from $SERVER..."
scp "$SERVER:$PROD_DB_PATH" "$LOCAL_TEST_DB"

echo "Starting local server with test database..."
echo "Press Ctrl+C to stop"
echo ""

DATABASE_PATH="$LOCAL_TEST_DB" npm start
