#!/usr/bin/env python3
"""
Test script for Teams recipient notifications via Power Automate.

Usage:
    python scripts/test_teams_recipient.py <recipient_email>

Examples:
    python scripts/test_teams_recipient.py kcao@tamu.edu
    python scripts/test_teams_recipient.py test@tamu.edu --order TH4013
"""

import sys
import os
import argparse

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.config import settings
from app.services.teams_recipient_service import teams_recipient_service


def main():
    parser = argparse.ArgumentParser(
        description="Test Teams recipient notification via Power Automate"
    )
    parser.add_argument(
        "recipient_email",
        help="Recipient's email address (e.g., kcao@tamu.edu)"
    )
    parser.add_argument(
        "--order",
        default="TEST001",
        help="Order number to use in test (default: TEST001)"
    )
    parser.add_argument(
        "--runner",
        default="Test Runner",
        help="Delivery runner name (default: Test Runner)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Send notification even if disabled in config (for testing)"
    )

    args = parser.parse_args()

    print(f"\n{'='*60}")
    print("Teams Recipient Notification Test")
    print(f"{'='*60}")
    print(f"Recipient: {args.recipient_email}")
    print(f"Order: {args.order}")
    print(f"Runner: {args.runner}")
    print(f"{'='*60}\n")

    # Check configuration
    print("Step 1: Checking configuration...")
    print(f"  TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED: {settings.teams_recipient_notifications_enabled}")
    print(f"  POWER_AUTOMATE_FLOW_URL: {'Configured' if settings.power_automate_flow_url else 'NOT SET'}")

    if not settings.teams_recipient_notifications_enabled:
        print("\n  ⚠️  Teams recipient notifications are DISABLED")
        if args.force:
            print("  → Forcing send due to --force flag")
            # Temporarily enable for this test
            teams_recipient_service.enabled = True
        else:
            print("  → Set TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED=true in .env to enable")
            print("  → Or use --force flag to test anyway")
            sys.exit(0)

    if not settings.power_automate_flow_url:
        print("\n  ❌ POWER_AUTOMATE_FLOW_URL is not set!")
        print("  → Configure this in your .env file with the Power Automate HTTP trigger URL")
        sys.exit(1)

    # Send test notification
    print("\nStep 2: Sending test notification...")

    success = teams_recipient_service.send_delivery_notification(
        recipient_email=args.recipient_email,
        recipient_name="Test Recipient",
        order_number=args.order,
        delivery_runner=args.runner,
        estimated_time="15-20 minutes"
    )

    if success:
        print(f"  ✓ Notification sent successfully!")
        print(f"\n  Check Teams for {args.recipient_email}")
    else:
        print(f"  ✗ Failed to send notification")
        print("  Check logs for more details")

    print(f"\n{'='*60}")
    print("Test complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
