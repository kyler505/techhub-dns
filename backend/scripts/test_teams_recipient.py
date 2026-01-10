#!/usr/bin/env python3
"""
Test script for Teams recipient notifications via SharePoint queue.

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
        description="Test Teams recipient notification via SharePoint queue"
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
    print("Teams Recipient Notification Test (SharePoint Queue)")
    print(f"{'='*60}")
    print(f"Recipient: {args.recipient_email}")
    print(f"Order: {args.order}")
    print(f"Runner: {args.runner}")
    print(f"{'='*60}\n")

    # Check configuration
    print("Step 1: Checking configuration...")
    print(f"  TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED: {settings.teams_recipient_notifications_enabled}")

    # Check SharePoint
    try:
        from app.services.sharepoint_service import get_sharepoint_service
        sp_service = get_sharepoint_service()
        print(f"  SHAREPOINT_ENABLED: {sp_service.is_enabled}")
        if sp_service._site_id:
            print(f"  SharePoint authenticated: ✓")
        else:
            print(f"  SharePoint authenticated: Not yet (will authenticate on first use)")
    except Exception as e:
        print(f"  SharePoint: Error - {e}")
        sys.exit(1)

    if not settings.teams_recipient_notifications_enabled and not args.force:
        print("\n  ⚠️  Teams recipient notifications are DISABLED")
        print("  → Set TEAMS_RECIPIENT_NOTIFICATIONS_ENABLED=true in .env to enable")
        print("  → Or use --force flag to test anyway")

    # Queue test notification
    print("\nStep 2: Queueing notification to SharePoint...")

    success = teams_recipient_service.send_delivery_notification(
        recipient_email=args.recipient_email,
        recipient_name="Test Recipient",
        order_number=args.order,
        delivery_runner=args.runner,
        estimated_time="15-20 minutes",
        force=args.force
    )

    if success:
        print(f"  ✓ Notification queued successfully!")
        print(f"\n  Check SharePoint folder: General/delivery-storage/teams-queue/")
        print(f"  → Power Automate flow should pick up the JSON file and send Teams message")
    else:
        print(f"  ✗ Failed to queue notification")
        print("  Check logs for more details")

    print(f"\n{'='*60}")
    print("Test complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
