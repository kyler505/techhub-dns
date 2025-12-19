"""
Building Code Extraction and Mapping Utilities

This module provides functions to extract building abbreviations from location strings
and map addresses to building codes using the ArcGIS service from AggieMap.
"""

import re
import httpx
import logging
from typing import Optional, Dict, List, Any
from functools import lru_cache
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# ArcGIS service endpoint for TAMU buildings
ARCGIS_BUILDINGS_URL = "https://gis.cstx.gov/csgis/rest/services/IT_GIS/ITS_TAMU_Parking/MapServer/3/query"

# Cache for building data (refreshed daily)
_building_data_cache: Optional[Dict[str, Any]] = None
_cache_timestamp: Optional[datetime] = None
CACHE_DURATION = timedelta(days=1)

# Common Texas A&M building codes for validation
# This is used to validate extracted codes, not for mapping
COMMON_BUILDING_CODES = {
    "ACAD", "ZACH", "LAAH", "HELD", "BLOC", "AGGY", "ANEX", "RICH", "RUDD",
    "WCLB", "EVAN", "HALB", "HRBB", "KOLD", "MELC", "MSEN", "NEDU", "PETR",
    "RDER", "SCOT", "TAMU", "VIDI", "CHEM", "ETB", "ADMN", "THOM", "THOMPSON"
}


def normalize_address(address: str) -> str:
    """
    Normalize an address for consistent matching.
    - Converts to uppercase
    - Removes extra whitespace
    - Standardizes common abbreviations (St/Street, Ave/Avenue, etc.)
    """
    if not address:
        return ""

    # Convert to uppercase and strip
    normalized = address.upper().strip()

    # Replace multiple spaces with single space
    normalized = re.sub(r'\s+', ' ', normalized)

    # Standardize common abbreviations
    replacements = {
        r'\bST\b': 'STREET',
        r'\bAVE\b': 'AVENUE',
        r'\bBLVD\b': 'BOULEVARD',
        r'\bDR\b': 'DRIVE',
        r'\bRD\b': 'ROAD',
        r'\bCT\b': 'COURT',
        r'\bLN\b': 'LANE',
    }

    for pattern, replacement in replacements.items():
        normalized = re.sub(pattern, replacement, normalized)

    return normalized


def fetch_building_data_from_arcgis() -> Optional[Dict[str, Any]]:
    """
    Fetch building data from ArcGIS service.

    Returns:
        Dictionary with building data or None if fetch fails
    """
    logger.debug(f"Fetching building data from ArcGIS: {ARCGIS_BUILDINGS_URL}")
    try:
        params = {
            "where": "1=1",  # Get all buildings
            "outFields": "*",  # Get all fields
            "f": "json",  # JSON format
            "returnGeometry": "false"  # We don't need geometry
        }

        with httpx.Client(timeout=10.0) as client:
            response = client.get(ARCGIS_BUILDINGS_URL, params=params)
            response.raise_for_status()
            data = response.json()

            logger.debug(f"ArcGIS response status: {response.status_code}")
            logger.debug(f"ArcGIS response keys: {list(data.keys())}")

            if "features" in data:
                feature_count = len(data.get("features", []))
                logger.info(f"Successfully fetched {feature_count} building features from ArcGIS")

                # Log sample feature structure for debugging
                if feature_count > 0:
                    sample_feature = data["features"][0]
                    if "attributes" in sample_feature:
                        sample_attrs = sample_feature["attributes"]
                        logger.debug(f"Sample ArcGIS feature attribute fields: {list(sample_attrs.keys())}")
                        logger.debug(f"Sample ArcGIS feature attributes (first 3): {dict(list(sample_attrs.items())[:3])}")

                return data
            else:
                logger.warning("ArcGIS response missing 'features' key")
                logger.debug(f"ArcGIS response structure: {list(data.keys())}")
                return None

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching building data from ArcGIS: {e.response.status_code} - {e.response.text[:200]}")
        return None
    except Exception as e:
        logger.error(f"Error fetching building data from ArcGIS: {e}", exc_info=True)
        return None


def get_building_data() -> Optional[Dict[str, Any]]:
    """
    Get building data from cache or fetch from ArcGIS.
    Caches data for 1 day to reduce API calls.

    Returns:
        Building data dictionary or None if unavailable
    """
    global _building_data_cache, _cache_timestamp

    # Check if cache is valid
    if _building_data_cache is not None and _cache_timestamp is not None:
        cache_age = datetime.now() - _cache_timestamp
        if cache_age < CACHE_DURATION:
            logger.debug(f"Using cached building data (age: {cache_age})")
            return _building_data_cache
        else:
            logger.debug(f"Cache expired (age: {cache_age}), fetching new data")

    # Fetch new data
    logger.debug("Fetching new building data from ArcGIS")
    data = fetch_building_data_from_arcgis()
    if data:
        _building_data_cache = data
        _cache_timestamp = datetime.now()
        feature_count = len(data.get('features', []))
        logger.info(f"Cached {feature_count} buildings from ArcGIS")

    return data


def extract_building_code_from_location(location: str) -> Optional[str]:
    """
    Extract building code from a location string.

    Examples:
        "LAAH 424" -> "LAAH"
        "Annex 3.645" -> "ANEX"
        "ACAD 205C" -> "ACAD"
        "ZACH 101" -> "ZACH"

    Args:
        location: Location string that may contain a building code

    Returns:
        Building code if found, None otherwise
    """
    if not location:
        logger.debug("extract_building_code_from_location: empty location")
        return None

    location_upper = location.upper().strip()
    logger.debug(f"extract_building_code_from_location: attempting to extract from '{location}' (normalized: '{location_upper}')")

    # Track which patterns we're checking for debugging
    patterns_checked = []

    # Pattern 1: Building code at start followed by space and room number
    # Examples: "LAAH 424", "ACAD 205C", "ZACH 101"
    patterns_checked.append("Pattern 1: Building code at start")
    match = re.match(r'^([A-Z]{2,6})\s+[0-9A-Z]', location_upper)
    if match:
        potential_code = match.group(1)
        logger.debug(f"Pattern 1 matched: '{potential_code}'")
        if potential_code in COMMON_BUILDING_CODES:
            logger.info(f"Extracted building code from location '{location}': {potential_code} (Pattern 1)")
            return potential_code
        else:
            logger.debug(f"Pattern 1 matched '{potential_code}' but not in COMMON_BUILDING_CODES")

    # Pattern 2: "Annex" or "Annex Building" -> "ANEX"
    patterns_checked.append("Pattern 2: Annex")
    if location_upper.startswith("ANNEX"):
        logger.info(f"Extracted building code from location '{location}': ANEX (Pattern 2)")
        return "ANEX"

    # Pattern 3: Building code in parentheses
    # Example: "Room 101 (ACAD)"
    patterns_checked.append("Pattern 3: Building code in parentheses")
    match = re.search(r'\(([A-Z]{2,6})\)', location_upper)
    if match:
        potential_code = match.group(1)
        logger.debug(f"Pattern 3 matched: '{potential_code}'")
        if potential_code in COMMON_BUILDING_CODES:
            logger.info(f"Extracted building code from location '{location}': {potential_code} (Pattern 3)")
            return potential_code

    # Pattern 4: Building code after comma or dash
    # Example: "Room 101, ACAD" or "101 - ACAD"
    patterns_checked.append("Pattern 4: Building code after comma/dash")
    match = re.search(r'[,;]\s*([A-Z]{2,6})(?:\s|$)', location_upper)
    if match:
        potential_code = match.group(1)
        logger.debug(f"Pattern 4 matched: '{potential_code}'")
        if potential_code in COMMON_BUILDING_CODES:
            logger.info(f"Extracted building code from location '{location}': {potential_code} (Pattern 4)")
            return potential_code

    # Pattern 5: Check if entire location is a building code (2-6 uppercase letters)
    patterns_checked.append("Pattern 5: Exact building code match")
    if re.match(r'^[A-Z]{2,6}$', location_upper) and location_upper in COMMON_BUILDING_CODES:
        logger.info(f"Extracted building code from location '{location}': {location_upper} (Pattern 5)")
        return location_upper

    # Pattern 6: Building name patterns (e.g., "Wehner Bldg", "Wehner Building", "339 Wehner Bldg")
    # Map common building names to codes
    # Order matters: more specific patterns first
    building_name_patterns = [
        # Building names with common suffixes (most specific first)
        (r'\bWEHNER\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "WCLB"),
        (r'\bZACHRY\s+(?:BLDG|BLDG\.|BUILDING|HALL|ENGINEERING)\b', "ZACH"),
        (r'\bACADEMIC\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "ACAD"),
        (r'\bLANGFORD\s+(?:BLDG|BLDG\.|BUILDING|HALL|ARCHITECTURE)\b', "LAAH"),
        (r'\bHELDENFELS\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "HELD"),
        (r'\bBLOCKER\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "BLOC"),
        (r'\bRUDDER\s+(?:BLDG|BLDG\.|BUILDING|HALL|TOWER)\b', "RUDD"),
        (r'\bRICHARDSON\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "RICH"),
        (r'\bEVANS\s+(?:BLDG|BLDG\.|BUILDING|HALL|LIBRARY)\b', "EVAN"),
        (r'\bHALBOUTY\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "HALB"),
        (r'\bHARRINGTON\s+(?:BLDG|BLDG\.|BUILDING|HALL|TOWER)\b', "HRBB"),
        (r'\bKOLDUS\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "KOLD"),
        (r'\bMEMORIAL\s+STUDENT\s+CENTER\b', "MELC"),
        (r'\bPETROLEUM\s+(?:BLDG|BLDG\.|BUILDING|HALL|ENGINEERING)\b', "PETR"),
        (r'\bSCOTES\s+(?:BLDG|BLDG\.|BUILDING|HALL)\b', "SCOT"),

        # Building names alone (word boundaries)
        (r'\bWEHNER\b', "WCLB"),
        (r'\bZACHRY\b', "ZACH"),
        (r'\bACADEMIC\b', "ACAD"),
        (r'\bLANGFORD\b', "LAAH"),
        (r'\bHELDENFELS\b', "HELD"),
        (r'\bBLOCKER\b', "BLOC"),
        (r'\bRUDDER\b', "RUDD"),
        (r'\bRICHARDSON\b', "RICH"),
        (r'\bEVANS\b', "EVAN"),
        (r'\bHALBOUTY\b', "HALB"),
        (r'\bHARRINGTON\b', "HRBB"),
        (r'\bKOLDUS\b', "KOLD"),
        (r'\bMELC\b', "MELC"),
        (r'\bMSC\b', "MELC"),
        (r'\bPETROLEUM\b', "PETR"),
        (r'\bSCOTES\b', "SCOT"),

        # Building number patterns (e.g., "Building 418" → BLOC for Blocker)
        # Note: These are context-dependent and may need refinement
        (r'\bBUILDING\s+418\b', "BLOC"),  # Blocker Building
    ]

    # Pattern 6: Building name patterns
    patterns_checked.append(f"Pattern 6: Building name patterns ({len(building_name_patterns)} patterns)")
    for pattern, code in building_name_patterns:
        if re.search(pattern, location_upper):
            logger.info(f"Extracted building code from location '{location}': {code} (Pattern 6: {pattern})")
            return code

    logger.debug(f"No building code extracted from location '{location}' after checking {len(patterns_checked)} pattern types: {', '.join(patterns_checked)}")
    return None


def match_address_to_building(address: str, building_data: Dict[str, Any]) -> Optional[str]:
    """
    Match an address to a building code using ArcGIS building data.

    Args:
        address: Full address string (e.g., "400 Bizzell Street")
        building_data: Building data from ArcGIS service

    Returns:
        Building code if match found, None otherwise
    """
    if not address or not building_data:
        logger.debug(f"match_address_to_building: missing address or building_data (address={address}, building_data={'present' if building_data else 'None'})")
        return None

    normalized_address = normalize_address(address)
    features = building_data.get("features", [])

    logger.info(f"Attempting to match address '{address}' (normalized: '{normalized_address}') against {len(features)} building features")

    # Log sample feature structure for debugging
    if features:
        sample_feature = features[0]
        sample_attrs = sample_feature.get("attributes", {})
        all_field_names = list(sample_attrs.keys())
        logger.debug(f"ArcGIS sample feature has {len(all_field_names)} fields: {all_field_names}")
        logger.debug(f"ArcGIS sample feature full attributes: {sample_attrs}")

    # Try to match address against building data
    # ArcGIS features for this service have attributes like:
    # - Address, BldgName, Abbrev, BldgAbbr, etc.
    # We normalize attribute keys to uppercase for case-insensitive lookups.
    matches_checked = 0
    features_without_address_fields = 0

    for feature in features:
        raw_attributes = feature.get("attributes", {}) or {}
        # Make attribute lookup case-insensitive by uppercasing keys
        attributes = {str(k).upper(): v for k, v in raw_attributes.items()}

        # Check various address fields that might exist
        building_address = None
        address_field_used = None
        for field in [
            "ADDRESS",          # e.g. "1983 Flight Line Rd"
            "STREET",
            "STREET_ADDRESS",
            "FULL_ADDRESS",
            "BLDGNAME",         # building name sometimes contains a pseudo-address
        ]:
        # NOTE: attributes keys are already uppercased above
            if field in attributes and attributes[field]:
                building_address = str(attributes[field]).upper().strip()
                address_field_used = field
                break

        if not building_address:
            features_without_address_fields += 1
            continue

        matches_checked += 1
        if matches_checked <= 5:  # Log first 5 matches for debugging
            logger.debug(f"Checking feature {matches_checked}: address field '{address_field_used}' = '{building_address}'")

        # Normalize building address for comparison
        normalized_building_address = normalize_address(building_address)

        # Try exact match
        if normalized_address == normalized_building_address:
            logger.debug(f"Exact match found: '{normalized_address}' == '{normalized_building_address}'")
            # Get building code from attributes
            for code_field in [
                "BUILDING_CODE",
                "CODE",
                "ABBREV",      # ArcGIS "Abbrev"
                "ABBREVIATION",
                "BLDGABBR",    # ArcGIS "BldgAbbr"
            ]:
                if code_field in attributes and attributes[code_field]:
                    code_value = str(attributes[code_field]).upper().strip()
                    logger.info(
                        f"Matched address '{address}' to building code '{code_value}' "
                        f"(exact match, field: {code_field})"
                    )
                    return code_value
            logger.debug(f"Exact match found but no building code field available. Available fields: {list(attributes.keys())}")

        # Try partial match (address contains building address or vice versa)
        if normalized_address in normalized_building_address or normalized_building_address in normalized_address:
            # Ensure reasonable match length
            if len(normalized_address) >= 10 or len(normalized_building_address) >= 10:
                logger.debug(
                    f"Partial match found: '{normalized_address}' in '{normalized_building_address}' or vice versa"
                )
                for code_field in [
                    "BUILDING_CODE",
                    "CODE",
                    "ABBREV",
                    "ABBREVIATION",
                    "BLDGABBR",
                ]:
                    if code_field in attributes and attributes[code_field]:
                        code_value = str(attributes[code_field]).upper().strip()
                        logger.info(
                            f"Matched address '{address}' to building code '{code_value}' "
                            f"(partial match, field: {code_field})"
                        )
                        return code_value
                logger.debug(f"Partial match found but no building code field available. Available fields: {list(attributes.keys())}")

    logger.warning(f"No match found for address '{address}' after checking {matches_checked} features with address fields (out of {len(features)} total features, {features_without_address_fields} had no address fields)")
    return None


def get_building_code_from_address(address: str) -> Optional[str]:
    """
    Get building code from a full address using ArcGIS building data.

    Args:
        address: Full address string (e.g., "400 Bizzell Street")

    Returns:
        Building code if found, None otherwise
    """
    if not address:
        logger.debug("get_building_code_from_address: empty address")
        return None

    logger.debug(f"get_building_code_from_address: looking up '{address}'")
    building_data = get_building_data()
    if not building_data:
        logger.warning(f"Building data unavailable, cannot match address '{address}'")
        return None

    result = match_address_to_building(address, building_data)
    if result:
        logger.info(f"Successfully matched address '{address}' to building code '{result}'")
    else:
        logger.debug(f"No building code found for address '{address}'")
    return result


def get_building_abbreviation(location: Optional[str], address: Optional[str]) -> Optional[str]:
    """
    Get building abbreviation from location or address.
    Priority: location string > ArcGIS address matching > None

    Args:
        location: Location string (may be from order remarks or alternative location)
        address: Full shipping address

    Returns:
        Building code if found, None otherwise
    """
    logger.debug(f"get_building_abbreviation called with location='{location}', address='{address}'")

    # First, try to extract from location string (e.g., "LAAH 424")
    if location:
        logger.debug(f"Attempting to extract building code from location string: '{location}'")
        building_code = extract_building_code_from_location(location)
        if building_code:
            logger.info(f"Found building code '{building_code}' from location string '{location}'")
            return building_code
        else:
            logger.debug(f"No building code found in location string '{location}'")

    # If no building code in location, try ArcGIS address matching
    if address:
        logger.debug(f"Attempting to match building code from address: '{address}'")
        building_code = get_building_code_from_address(address)
        if building_code:
            logger.info(f"Found building code '{building_code}' from address '{address}'")
            return building_code
        else:
            logger.debug(f"No building code found for address '{address}'")

    logger.debug(f"No building code found for location='{location}', address='{address}'")
    return None
