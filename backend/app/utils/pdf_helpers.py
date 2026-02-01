"""PDF utility helpers for text wrapping, page breaks, and pickline filtering.

This module consolidates duplicated PDF/text utility functions from multiple services
to ensure consistent behavior and reduce maintenance burden.
"""

from typing import Dict, Any, List, Optional, Union
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


def wrap_text(
    text: str,
    max_width: Union[int, float],
    font_name: str,
    font_size: int,
    pdf: Optional[canvas.Canvas] = None
) -> List[str]:
    """Wrap text to fit within max_width, respecting explicit newlines.
    
    Args:
        text: The text to wrap
        max_width: Maximum width in points
        font_name: Name of the font to use for width calculations
        font_size: Size of the font
        pdf: Optional canvas instance. If provided, uses pdf.stringWidth(); 
             otherwise uses reportlab.pdfbase.pdfmetrics.stringWidth()
    
    Returns:
        List of wrapped lines
    """
    if not text:
        return []

    # Use pdf.stringWidth if canvas provided, otherwise use module-level function
    width_func = pdf.stringWidth if pdf else stringWidth

    # First split on explicit newlines to respect intentional line breaks
    paragraphs = str(text).split('\n')
    lines = []

    for paragraph in paragraphs:
        if not paragraph.strip():
            # Preserve blank lines
            lines.append("")
            continue

        words = paragraph.split()
        current_line = ""

        for word in words:
            test_line = f"{current_line} {word}".strip()
            if width_func(test_line, font_name, font_size) <= max_width:
                current_line = test_line
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word

        if current_line:
            lines.append(current_line)

    return lines


def check_page_break(
    pdf: canvas.Canvas,
    y_offset: Union[int, float],
    height: Union[int, float],
    threshold: Union[int, float] = 60,
    reset_offset: Union[int, float] = 50
) -> Union[int, float]:
    """Check if page break is needed and return updated y_offset.
    
    Args:
        pdf: The canvas to draw on
        y_offset: Current Y position
        height: Page height
        threshold: Y position below which a page break is triggered
        reset_offset: Y position to reset to after a page break
    
    Returns:
        Updated y_offset (either current position or reset position after page break)
    """
    if y_offset < threshold:
        pdf.showPage()
        return height - reset_offset
    return y_offset


def filter_picklines(inflow_data: Dict[str, Any], pick_lines: List[Dict]) -> List[Dict]:
    """Filter pick lines to show only unshipped items.
    
    Compares pickLines against packLines to determine which items
    have already been shipped and removes them from the result.
    
    Args:
        inflow_data: The inFlow order data containing packLines
        pick_lines: The list of pick lines to filter
    
    Returns:
        List of unshipped pick line items
    """
    pack_lines = inflow_data.get("packLines", [])

    # Build summary of shipped quantities & serials
    shipped_items = {}
    for pack in pack_lines:
        pid = pack.get("productId")
        if not pid:
            continue
        qty_raw = pack.get("quantity", {}).get("standardQuantity", 0)
        try:
            qty = float(qty_raw) if qty_raw else 0.0
        except (ValueError, TypeError):
            qty = 0.0
        serials = pack.get("quantity", {}).get("serialNumbers", [])

        if pid not in shipped_items:
            shipped_items[pid] = {
                "quantity": 0.0,
                "serialNumbers": set()
            }

        shipped_items[pid]["quantity"] += qty
        shipped_items[pid]["serialNumbers"].update(serials)

    # Track picked items
    tracked_orders = {}
    for pick in pick_lines:
        pid = pick.get("productId")
        if not pid:
            continue
        qty_raw = pick.get("quantity", {}).get("standardQuantity", 0)
        try:
            qty = float(qty_raw) if qty_raw else 0.0
        except (ValueError, TypeError):
            qty = 0.0
        serials = pick.get("quantity", {}).get("serialNumbers", [])

        if pid not in tracked_orders:
            tracked_orders[pid] = {
                **pick,
                "quantity": {
                    "standardQuantity": qty,
                    "serialNumbers": list(serials)
                }
            }
        else:
            tracked_orders[pid]["quantity"]["standardQuantity"] += qty
            tracked_orders[pid]["quantity"]["serialNumbers"].extend(serials)

    # Subtract shipped from picked to get unshipped
    unshipped = []
    for pid, pick in tracked_orders.items():
        picked_qty = pick["quantity"]["standardQuantity"]
        picked_serials = pick["quantity"].get("serialNumbers", [])
        track_serials = pick.get("product", {}).get("trackSerials", False)

        shipped = shipped_items.get(pid, {"quantity": 0.0, "serialNumbers": set()})
        shipped_qty = shipped["quantity"]
        shipped_serials = shipped["serialNumbers"]

        remaining_qty = picked_qty - shipped_qty

        if remaining_qty <= 0:
            continue  # everything shipped

        unshipped_entry = {
            **pick,
            "quantity": {
                "standardQuantity": str(remaining_qty),
                "serialNumbers": []
            }
        }

        if track_serials:
            # Remove shipped serials from picked serials
            remaining_serials = [sn for sn in picked_serials if sn not in shipped_serials]
            unshipped_entry["quantity"]["serialNumbers"] = remaining_serials
            # Adjust quantity to number of serials remaining
            unshipped_entry["quantity"]["standardQuantity"] = str(len(remaining_serials))

        unshipped.append(unshipped_entry)

    return unshipped
