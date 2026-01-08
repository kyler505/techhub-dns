#!/usr/bin/env python3
"""
Test script for Order Details PDF generation and email sending.

Usage:
    python scripts/test_order_details.py <order_number> <email_address>

Examples:
    python scripts/test_order_details.py TH000121 test@example.com
    python scripts/test_order_details.py TH000121 kcao@tamu.edu
"""

import sys
import os
import argparse

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.services.inflow_service import InflowService
from app.services.pdf_service import pdf_service
from app.services.email_service import email_service


def main():
    parser = argparse.ArgumentParser(
        description="Test Order Details PDF generation and email sending"
    )
    parser.add_argument(
        "order_number",
        help="inFlow order number (e.g., TH000121)"
    )
    parser.add_argument(
        "email",
        help="Email address to send the test PDF to"
    )
    parser.add_argument(
        "--no-email",
        action="store_true",
        help="Generate PDF only, don't send email"
    )
    parser.add_argument(
        "--save",
        type=str,
        help="Save PDF to specified path"
    )

    args = parser.parse_args()

    print(f"\n{'='*60}")
    print("Order Details PDF Test Script")
    print(f"{'='*60}")
    print(f"Order Number: {args.order_number}")
    print(f"Email: {args.email}")
    print(f"{'='*60}\n")

    # Step 1: Fetch order from inFlow
    print("Step 1: Fetching order from inFlow API...")
    inflow_service = InflowService()

    # Try to find by order number
    inflow_data = inflow_service.get_order_by_number_sync(args.order_number)

    if not inflow_data:
        print(f"  ERROR: Order '{args.order_number}' not found in inFlow")
        sys.exit(1)

    print(f"  ✓ Found order: {inflow_data.get('orderNumber')}")
    print(f"    - Contact: {inflow_data.get('contactName', 'N/A')}")
    print(f"    - Email: {inflow_data.get('email', 'N/A')}")
    print(f"    - Lines: {len(inflow_data.get('lines', []))} item(s)")

    # Step 2: Generate PDF
    print("\nStep 2: Generating Order Details PDF...")
    try:
        pdf_bytes = pdf_service.generate_order_details_pdf(inflow_data)
        print(f"  ✓ Generated PDF: {len(pdf_bytes):,} bytes")
    except Exception as e:
        print(f"  ERROR: Failed to generate PDF: {e}")
        sys.exit(1)

    # Step 3: Save PDF if requested
    if args.save:
        print(f"\nStep 3: Saving PDF to {args.save}...")
        try:
            with open(args.save, 'wb') as f:
                f.write(pdf_bytes)
            print(f"  ✓ Saved PDF to: {args.save}")
        except Exception as e:
            print(f"  ERROR: Failed to save PDF: {e}")
    else:
        # Save to default location
        default_path = f"storage/OrderDetails_{args.order_number}.pdf"
        os.makedirs("storage", exist_ok=True)
        with open(default_path, 'wb') as f:
            f.write(pdf_bytes)
        print(f"\n  → PDF saved to: {default_path}")

    # Step 4: Send email (unless --no-email)
    if args.no_email:
        print("\n  (Skipping email - --no-email flag set)")
    else:
        print(f"\nStep 4: Sending email to {args.email}...")

        # Check SMTP configuration
        from app.config import settings
        if not settings.smtp_host:
            print("  WARNING: SMTP_HOST not configured in .env")
            print("  Email will not be sent. Configure SMTP settings to enable.")
        else:
            customer_name = inflow_data.get("contactName", "Test User")
            order_number = args.order_number

            success = email_service.send_order_details_email(
                to_address=args.email,
                order_number=order_number,
                customer_name=customer_name,
                pdf_content=pdf_bytes
            )

            if success:
                print(f"  ✓ Email sent successfully to {args.email}")
            else:
                print(f"  ✗ Failed to send email. Check SMTP configuration.")

    print(f"\n{'='*60}")
    print("Test complete!")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
