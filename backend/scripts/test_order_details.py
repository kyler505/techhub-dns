#!/usr/bin/env python3
"""
Test script for Order Details PDF generation and email sending.

Flow:
1. Check SharePoint for existing PDF
2. If not found, generate and upload to SharePoint
3. Send email with PDF

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
from app.config import settings


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
        "--force-generate",
        action="store_true",
        help="Force regenerate PDF even if it exists in SharePoint"
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

    pdf_bytes = None
    pdf_filename = f"{args.order_number}.pdf"
    pdf_source = "generated"

    # Step 2: Check SharePoint for existing PDF (unless --force-generate)
    if not args.force_generate:
        print("\nStep 2: Checking SharePoint for existing PDF...")
        try:
            from app.services.sharepoint_service import get_sharepoint_service
            sp_service = get_sharepoint_service()

            if sp_service.is_enabled:
                print(f"  → SharePoint enabled, checking for: order-details/{pdf_filename}")
                existing_pdf = sp_service.download_file("order-details", pdf_filename)

                if existing_pdf:
                    print(f"  ✓ Found existing PDF in SharePoint: {len(existing_pdf):,} bytes")
                    pdf_bytes = existing_pdf
                    pdf_source = "sharepoint"
                else:
                    print(f"  → PDF not found in SharePoint")
            else:
                print("  → SharePoint not enabled, skipping check")
        except Exception as e:
            print(f"  WARNING: Error checking SharePoint: {e}")
    else:
        print("\nStep 2: Skipping SharePoint check (--force-generate)")

    # Step 3: Generate PDF if not found
    if pdf_bytes is None:
        print("\nStep 3: Generating Order Details PDF...")
        try:
            pdf_bytes = pdf_service.generate_order_details_pdf(inflow_data)
            print(f"  ✓ Generated PDF: {len(pdf_bytes):,} bytes")
        except Exception as e:
            print(f"  ERROR: Failed to generate PDF: {e}")
            sys.exit(1)

        # Upload to SharePoint
        try:
            from app.services.sharepoint_service import get_sharepoint_service
            sp_service = get_sharepoint_service()

            if sp_service.is_enabled:
                print("  → Uploading to SharePoint...")
                sp_url = sp_service.upload_file(pdf_bytes, "order-details", pdf_filename)
                print(f"  ✓ Uploaded to SharePoint: {sp_url}")
        except Exception as e:
            print(f"  WARNING: Failed to upload to SharePoint: {e}")

        # Save locally
        default_dir = "storage/order_details"
        os.makedirs(default_dir, exist_ok=True)
        default_path = f"{default_dir}/{pdf_filename}"
        with open(default_path, 'wb') as f:
            f.write(pdf_bytes)
        print(f"  → PDF saved to: {default_path}")
    else:
        print(f"\nStep 3: Using existing PDF from {pdf_source}")

    # Step 4: Send email (unless --no-email)
    if args.no_email:
        print("\n  (Skipping email - --no-email flag set)")
    else:
        print(f"\nStep 4: Sending email to {args.email}...")

        # For testing, we send email directly using the flow URL
        # This bypasses the POWER_AUTOMATE_EMAIL_ENABLED check since this is a test script
        if not settings.power_automate_email_flow_url:
            print("  ERROR: POWER_AUTOMATE_EMAIL_FLOW_URL not configured in .env")
            print("  Cannot send email without a Power Automate flow URL.")
        else:
            customer_name = inflow_data.get("contactName", "Test User")
            order_number = args.order_number

            # Call the email service directly with force=True to bypass enabled check
            success = email_service.send_order_details_email(
                to_address=args.email,
                order_number=order_number,
                customer_name=customer_name,
                pdf_content=pdf_bytes,
                force=True
            )

            if success:
                print(f"  ✓ Email sent successfully to {args.email}")
            else:
                print(f"  ✗ Failed to send email. Check Power Automate flow URL.")

    print(f"\n{'='*60}")
    print(f"Test complete! (PDF source: {pdf_source})")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
