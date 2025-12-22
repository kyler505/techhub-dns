#!/usr/bin/env python3
"""
Manual migration runner to bypass SQLAlchemy compatibility issues with Python 3.14
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database URL from environment
database_url = os.getenv('DATABASE_URL')
if not database_url:
    print("DATABASE_URL environment variable not found")
    sys.exit(1)

# Parse the database URL
# Format: postgresql://user:password@host:port/database
if not database_url.startswith('postgresql://'):
    print("Invalid DATABASE_URL format")
    sys.exit(1)

# Extract connection parameters
url_parts = database_url.replace('postgresql://', '').split('@')
if len(url_parts) != 2:
    print("Invalid DATABASE_URL format")
    sys.exit(1)

user_pass = url_parts[0].split(':')
if len(user_pass) != 2:
    print("Invalid DATABASE_URL format")
    sys.exit(1)

host_port_db = url_parts[1].split('/')
if len(host_port_db) != 2:
    print("Invalid DATABASE_URL format")
    sys.exit(1)

host_port = host_port_db[0].split(':')
if len(host_port) != 2:
    print("Invalid DATABASE_URL format")
    sys.exit(1)

db_params = {
    'host': host_port[0],
    'port': int(host_port[1]),
    'user': user_pass[0],
    'password': user_pass[1],
    'database': host_port_db[1]
}

def run_migration():
    """Run the status standardization migration manually"""

    print("Connecting to database...")
    try:
        conn = psycopg2.connect(**db_params)
        conn.autocommit = False  # Use transactions
        cursor = conn.cursor()

        print("Checking current migration state...")

        # Check if our migration is already applied
        cursor.execute("SELECT version_num FROM alembic_version")
        current_version = cursor.fetchone()

        if current_version and current_version[0] == '34d179c32c4f':
            print("Migration 34d179c32c4f is already applied!")
            conn.close()
            return

        print(f"Current migration version: {current_version[0] if current_version else 'None'}")

        # Check if there are any orders to migrate
        cursor.execute("SELECT COUNT(*) FROM orders")
        order_count = cursor.fetchone()[0]
        print(f"Found {order_count} orders to potentially update")

        # Check current status distribution
        cursor.execute("SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status")
        status_counts = cursor.fetchall()
        print("Current status distribution:")
        for status, count in status_counts:
            print(f"  {status}: {count}")

        print("\nRunning migration: standardize_status_names")

        # Update status values from camelCase to kebab-case
        updates = [
            ("Picked", "picked"),
            ("PreDelivery", "pre-delivery"),
            ("InDelivery", "in-delivery"),
            ("Shipping", "shipping"),
            ("Delivered", "delivered"),
            ("Issue", "issue")
        ]

        total_updated = 0
        for old_status, new_status in updates:
            cursor.execute(
                "UPDATE orders SET status = %s WHERE status = %s",
                (new_status, old_status)
            )
            updated_count = cursor.rowcount
            if updated_count > 0:
                print(f"Updated {updated_count} orders from '{old_status}' to '{new_status}'")
                total_updated += updated_count

        # Update alembic version
        cursor.execute(
            "UPDATE alembic_version SET version_num = %s WHERE version_num = %s",
            ('34d179c32c4f', current_version[0] if current_version else None)
        )

        conn.commit()
        print(f"\nMigration completed successfully! Updated {total_updated} orders total.")

        # Verify the migration
        cursor.execute("SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status")
        new_status_counts = cursor.fetchall()
        print("\nNew status distribution:")
        for status, count in new_status_counts:
            print(f"  {status}: {count}")

        cursor.close()
        conn.close()

    except Exception as e:
        print(f"Error during migration: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
