#!/usr/bin/env python3
"""
Pattern Discovery Script for Order Remarks

This script fetches and analyzes all orders from Inflow API (including fulfilled/historical)
to discover common patterns in orderRemarks that indicate alternative delivery locations.

Usage:
    # Activate virtual environment first (if using .venv in backend folder)
    cd backend
    .venv\Scripts\activate  # Windows
    # or
    source .venv/bin/activate  # Linux/Mac

    # Generate report only (dry run to preview)
    python scripts/analyze_order_patterns.py --dry-run

    # Generate report and save to file
    python scripts/analyze_order_patterns.py

    # Generate report with custom output path
    python scripts/analyze_order_patterns.py --output reports/pattern_analysis.json

    # Generate report and update code automatically
    python scripts/analyze_order_patterns.py --update-code

    # Preview code changes before updating
    python scripts/analyze_order_patterns.py --update-code --dry-run

    # Use custom minimum frequency threshold
    python scripts/analyze_order_patterns.py --min-frequency 10

    # Or run from project root with full path
    python -m backend.scripts.analyze_order_patterns --dry-run
"""

import re
import json
import argparse
import sys
from collections import Counter, defaultdict
from typing import Dict, List, Tuple, Optional, Any
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
from app.services.inflow_service import InflowService


class PatternAnalyzer:
    """Analyzes order remarks to discover delivery location patterns."""

    def __init__(self, min_frequency: int = 5):
        self.min_frequency = min_frequency
        self.pattern_stats = defaultdict(int)
        self.pattern_examples = defaultdict(list)
        self.order_matches = defaultdict(list)
        self.common_prefixes = [
            "deliver", "delivery", "drop", "location", "room", "building",
            "bring", "take", "place", "ship", "send", "move"
        ]
        self.common_separators = ["to", "at", "in", "for", ":", "-", ">"]

    @staticmethod
    def extract_shipping_address(inflow_data: Dict[str, Any]) -> Optional[str]:
        """Extract shipping address from inflow_data."""
        if not inflow_data:
            return None
        shipping = inflow_data.get("shippingAddress", {})
        return shipping.get("address1") if shipping else None

    @staticmethod
    def extract_order_remarks(inflow_data: Dict[str, Any]) -> Optional[str]:
        """Extract order remarks from inflow_data."""
        if not inflow_data:
            return None
        return inflow_data.get("orderRemarks", "")

    @staticmethod
    def extract_delivery_location(inflow_data: Dict[str, Any]) -> Optional[str]:
        """Extract delivery location - could be from shipping address or custom fields."""
        if not inflow_data:
            return None
        # Try shipping address first
        shipping = inflow_data.get("shippingAddress", {})
        if shipping and shipping.get("address1"):
            return shipping.get("address1")
        return None

    def find_location_patterns(self, remarks: str, delivery_location: str,
                              shipping_address: Optional[str]) -> List[Tuple[str, str]]:
        """
        Find potential location patterns in remarks.
        Returns list of (pattern_phrase, extracted_location) tuples.
        """
        if not remarks:
            return []

        patterns_found = []
        remarks_lower = remarks.lower()

        # If we have a delivery_location, try to find it in remarks
        # and extract the phrase that precedes it
        if delivery_location:
            delivery_lower = delivery_location.lower()

            # Only analyze if delivery_location differs from shipping_address
            # (indicates alternative location was used)
            if shipping_address and delivery_lower == shipping_address.lower():
                return []

            # Look for the delivery location mentioned in remarks
            # This helps us find the context/phrase that precedes it
            # Escape special regex characters but allow partial matches
            location_words = delivery_location.split()
            if location_words:
                # Try to find the location in remarks (allowing for some variation)
                location_pattern = r'\b' + r'\s+'.join([re.escape(word) for word in location_words[:3]])  # First 3 words

                # Find all occurrences of the location in remarks
                for match in re.finditer(location_pattern, remarks_lower, re.IGNORECASE):
                    # Look backwards from the match to find the phrase
                    start_pos = match.start()
                    context_start = max(0, start_pos - 100)  # Look back up to 100 chars
                    context = remarks_lower[context_start:start_pos]

                    # Find common prefixes before the location
                    for prefix in self.common_prefixes:
                        for separator in self.common_separators:
                            # Check if prefix + separator appears before location
                            pattern = rf'{prefix}\s*{re.escape(separator)}\s*'
                            sep_match = re.search(pattern + r'[^\r\n,;]*?' + location_pattern,
                                                remarks_lower[context_start:match.end()],
                                                re.IGNORECASE)
                            if sep_match:
                                phrase = f"{prefix} {separator}"
                                patterns_found.append((phrase, delivery_location))
                                break

        # Also look for generic patterns that might match
        # Find phrases like "deliver to X", "location: X", etc.
        # This helps discover patterns even when delivery_location isn't set
        generic_patterns = [
            # Pattern: word + separator + location
            r'(\b\w+\s+(?:to|at|in|for)\s+)([A-Z0-9][^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)',
            # Pattern: "location:" or "room:" or "building:" followed by location
            r'(\b(?:location|room|building|deliver|delivery|drop)\s*[:>-]\s*)([A-Z0-9][^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)',
        ]

        for pattern in generic_patterns:
            matches = re.finditer(pattern, remarks, re.IGNORECASE)
            for match in matches:
                phrase = match.group(1).strip()
                potential_location = match.group(2).strip()
                # Clean up the location
                potential_location = re.sub(r'[.,;:]+$', '', potential_location)
                # Filter out very short or very long locations
                if potential_location and 3 <= len(potential_location) <= 100:
                    # Check if it looks like a location (has letters/numbers, not just punctuation)
                    if re.search(r'[A-Za-z0-9]', potential_location):
                        patterns_found.append((phrase, potential_location))

        # Remove duplicates while preserving order
        seen = set()
        unique_patterns = []
        for phrase, location in patterns_found:
            key = (phrase.lower().strip(), location.lower().strip())
            if key not in seen:
                seen.add(key)
                unique_patterns.append((phrase, location))

        return unique_patterns

    def analyze_inflow_order(self, inflow_order: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze a single Inflow order and return analysis results."""
        remarks = self.extract_order_remarks(inflow_order)
        shipping_address = self.extract_shipping_address(inflow_order)
        delivery_location = self.extract_delivery_location(inflow_order)
        order_number = inflow_order.get("orderNumber", "Unknown")

        result = {
            "order_id": order_number,
            "inflow_order_id": order_number,
            "has_remarks": bool(remarks),
            "has_alternative_location": False,
            "patterns_found": []
        }

        if not remarks:
            return result

        # Check if delivery location differs from shipping address
        has_alternative = False
        if delivery_location and shipping_address:
            if delivery_location.lower() != shipping_address.lower():
                has_alternative = True
        elif delivery_location:
            # If we have delivery_location but no shipping_address,
            # it might be from remarks
            has_alternative = True

        result["has_alternative_location"] = has_alternative

        # Find patterns
        patterns = self.find_location_patterns(remarks, delivery_location, shipping_address)
        result["patterns_found"] = patterns

        # Update statistics
        for phrase, location in patterns:
            pattern_key = phrase.lower().strip()
            self.pattern_stats[pattern_key] += 1
            if len(self.pattern_examples[pattern_key]) < 10:  # Keep max 10 examples
                self.pattern_examples[pattern_key].append({
                    "order_id": order_number,
                    "remarks": remarks[:200],  # Truncate for report
                    "location": location,
                    "delivery_location": delivery_location,
                    "shipping_address": shipping_address
                })
            self.order_matches[pattern_key].append(order_number)

        return result

    def generate_regex_patterns(self) -> List[Dict[str, Any]]:
        """Generate regex patterns from discovered phrases."""
        regex_patterns = []

        for phrase, count in sorted(self.pattern_stats.items(),
                                   key=lambda x: x[1], reverse=True):
            if count < self.min_frequency:
                continue

            # Convert phrase to regex pattern
            # Clean up the phrase
            phrase_clean = phrase.strip().lower()

            # Build regex pattern based on the phrase structure
            # Handle different phrase formats
            if ':' in phrase_clean or '>' in phrase_clean or '-' in phrase_clean:
                # Format: "word:" or "word>" or "word -"
                # Extract the word before the separator
                match = re.match(r'(\w+)\s*([:>-])', phrase_clean)
                if match:
                    word = match.group(1)
                    separator = match.group(2)
                    regex = rf'{re.escape(word)}\s*{re.escape(separator)}\s+([^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)'
                else:
                    # Fallback: use the phrase as-is
                    regex = re.escape(phrase_clean) + r'\s+([^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)'
            else:
                # Format: "word to" or "word at" etc.
                words = phrase_clean.split()
                if len(words) >= 2:
                    # First word(s) + separator + location
                    prefix = ' '.join(words[:-1])  # All but last word
                    separator = words[-1]  # Last word (to, at, in, etc.)
                    regex = rf'{re.escape(prefix)}\s+{re.escape(separator)}\s+([^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)'
                else:
                    # Single word - make it flexible
                    regex = rf'\b{re.escape(phrase_clean)}\s+([^\r\n,;]+?)(?:\s*[-–—]|\s*$|\r|\n|,|;|$)'

            regex_patterns.append({
                "phrase": phrase_clean,
                "regex": regex,
                "frequency": count,
                "examples": self.pattern_examples[phrase][:5],  # Top 5 examples
                "order_count": len(set(self.order_matches[phrase]))
            })

        return regex_patterns


async def fetch_all_orders_from_inflow(min_frequency: int = 5) -> Dict[str, Any]:
    """Fetch and analyze all orders from Inflow API, including fulfilled/historical orders."""
    print("Fetching ALL orders from Inflow API (including fulfilled/historical orders)...")

    inflow_service = InflowService()
    analyzer = PatternAnalyzer(min_frequency=min_frequency)
    results = []
    orders_with_remarks = 0
    orders_with_alternative = 0
    all_orders = []

    # Fetch orders with different statuses to get all historical orders
    # We'll fetch: fulfilled, unfulfilled, and all active orders
    statuses_to_fetch = [
        ("fulfilled", True),   # Fulfilled orders (historical)
        ("unfulfilled", True), # Unfulfilled orders
        (None, False),         # Inactive orders (historical)
    ]

    print("\nFetching orders from Inflow API...")
    total_fetched = 0

    for inventory_status, is_active in statuses_to_fetch:
        status_label = inventory_status or "inactive"
        active_label = "active" if is_active else "inactive"
        print(f"\nFetching {status_label} {active_label} orders...")

        page = 0
        per_page = 100
        fetched_this_status = 0

        while True:
            try:
                orders = await inflow_service.fetch_orders(
                    inventory_status=inventory_status,
                    is_active=is_active,
                    count=per_page,
                    skip=page * per_page
                )

                if not orders:
                    break

                all_orders.extend(orders)
                fetched_this_status += len(orders)
                total_fetched += len(orders)

                print(f"  Fetched {fetched_this_status} {status_label} orders (total: {total_fetched})...")

                # If we got fewer than per_page, we've reached the end
                if len(orders) < per_page:
                    break

                page += 1

                # Safety limit: don't fetch more than 10000 pages per status
                if page >= 10000:
                    print(f"  ⚠️  Reached page limit for {status_label} orders")
                    break

            except Exception as e:
                print(f"  Error fetching {status_label} orders (page {page}): {e}")
                break

    print(f"\nTotal orders fetched from Inflow: {len(all_orders)}")

    if not all_orders:
        print("No orders found in Inflow API.")
        return {
            "summary": {
                "total_orders": 0,
                "orders_with_remarks": 0,
                "orders_with_alternative_locations": 0,
                "patterns_discovered": 0,
                "min_frequency_threshold": min_frequency
            },
            "patterns": [],
            "pattern_statistics": {},
            "raw_results": []
        }

    print("\nAnalyzing orders...")
    print(f"  This may take a while for large datasets...")
    for i, order in enumerate(all_orders):
        # Show progress every 100 orders, or every 1000 for very large datasets
        progress_interval = 1000 if len(all_orders) > 10000 else 100
        if (i + 1) % progress_interval == 0 or (i + 1) == len(all_orders):
            percentage = ((i + 1) / len(all_orders)) * 100
            print(f"  Processed {i + 1}/{len(all_orders)} orders ({percentage:.1f}%)...")

        result = analyzer.analyze_inflow_order(order)
        results.append(result)

        if result["has_remarks"]:
            orders_with_remarks += 1
        if result["has_alternative_location"]:
            orders_with_alternative += 1

    print(f"\nAnalysis complete!")
    print(f"  Orders with remarks: {orders_with_remarks}")
    print(f"  Orders with alternative locations: {orders_with_alternative}")

    # Generate regex patterns
    print("\nGenerating regex patterns...")
    regex_patterns = analyzer.generate_regex_patterns()
    print(f"  Found {len(regex_patterns)} patterns meeting frequency threshold (>{min_frequency})")

    # Build report
    report = {
        "summary": {
            "total_orders": len(all_orders),
            "orders_with_remarks": orders_with_remarks,
            "orders_with_alternative_locations": orders_with_alternative,
            "patterns_discovered": len(regex_patterns),
            "min_frequency_threshold": min_frequency
        },
        "patterns": regex_patterns,
        "pattern_statistics": dict(analyzer.pattern_stats),
        "raw_results": results[:100]  # Include first 100 for reference
    }

    return report


def update_code_with_patterns(report: Dict[str, Any], dry_run: bool = False) -> bool:
    """Update order_service.py with discovered patterns."""
    patterns = report.get("patterns", [])
    if not patterns:
        print("No patterns to update.")
        return False

    service_file = Path(__file__).parent.parent / "app" / "services" / "order_service.py"

    if not service_file.exists():
        print(f"Error: Could not find {service_file}")
        return False

    # Read current file
    with open(service_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Find the patterns array section
    pattern_start_idx = None
    pattern_end_idx = None

    for i, line in enumerate(lines):
        if 'patterns = [' in line:
            pattern_start_idx = i
        elif pattern_start_idx is not None and line.strip().startswith(']'):
            pattern_end_idx = i
            break

    if pattern_start_idx is None or pattern_end_idx is None:
        print("Error: Could not find patterns array in order_service.py")
        return False

    # Build new patterns array
    # Keep the comment line before patterns
    new_pattern_lines = []

    # Add existing comment if present
    if pattern_start_idx > 0 and '#' in lines[pattern_start_idx - 1]:
        new_pattern_lines.append(lines[pattern_start_idx - 1].rstrip() + '\n')

    new_pattern_lines.append("        patterns = [\n")

    # Add existing patterns (if any) - look for lines between [ and ]
    existing_patterns = []
    for i in range(pattern_start_idx + 1, pattern_end_idx):
        line = lines[i].strip()
        if line and not line.startswith('#') and line.startswith('r\''):
            existing_patterns.append(line)

    # Add existing patterns first
    for pattern_line in existing_patterns:
        new_pattern_lines.append(f"            {pattern_line},\n")

    # Add separator comment if we have both existing and new patterns
    if existing_patterns and patterns:
        new_pattern_lines.append("            # Auto-discovered patterns (from pattern analysis):\n")

    # Add new discovered patterns
    for pattern_info in patterns:
        regex = pattern_info["regex"]
        phrase = pattern_info["phrase"]
        frequency = pattern_info["frequency"]
        # Escape single quotes in regex for Python string
        regex_escaped = regex.replace("'", "\\'")
        comment = f"  # \"{phrase}\" (found {frequency} times)"
        new_pattern_lines.append(f"            r'{regex_escaped}', {comment}\n")

    new_pattern_lines.append("        ]\n")

    # Reconstruct file
    new_lines = (
        lines[:pattern_start_idx - (1 if pattern_start_idx > 0 and '#' in lines[pattern_start_idx - 1] else 0)] +
        new_pattern_lines +
        lines[pattern_end_idx + 1:]
    )

    if dry_run:
        print("\n=== DRY RUN: Would update patterns array ===")
        print("New patterns section:")
        print(''.join(new_pattern_lines))
        return False

    # Write updated file
    with open(service_file, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(f"\nUpdated {service_file} with {len(patterns)} discovered patterns")
    print(f"  (Preserved {len(existing_patterns)} existing patterns)")
    return True


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Analyze order remarks to discover delivery location patterns"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="backend/scripts/pattern_analysis_report.json",
        help="Output file path for the analysis report (default: backend/scripts/pattern_analysis_report.json)"
    )
    parser.add_argument(
        "--update-code",
        action="store_true",
        help="Automatically update order_service.py with discovered patterns"
    )
    parser.add_argument(
        "--min-frequency",
        type=int,
        default=5,
        help="Minimum frequency threshold for including patterns (default: 5)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without updating code or writing files"
    )

    args = parser.parse_args()

    try:
        # Run analysis (async function)
        report = asyncio.run(fetch_all_orders_from_inflow(min_frequency=args.min_frequency))

        # Save report
        if not args.dry_run:
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(report, f, indent=2, ensure_ascii=False)
            print(f"\nReport saved to {output_path}")
        else:
            print("\n=== DRY RUN: Would save report ===")
            print(f"Summary: {json.dumps(report['summary'], indent=2)}")
            print(f"\nTop 5 patterns:")
            for pattern in report['patterns'][:5]:
                print(f"  - {pattern['phrase']}: {pattern['frequency']} occurrences")

        # Update code if requested
        if args.update_code:
            update_code_with_patterns(report, dry_run=args.dry_run)
        elif not args.dry_run:
            print("\nUse --update-code to automatically update order_service.py with discovered patterns")
            print("Use --dry-run to preview changes first")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
