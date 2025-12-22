#!/usr/bin/env python3
"""Clean up instrumentation from files"""

def clean_file(filepath):
    """Remove all agent log instrumentation from a file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Remove lines that are part of agent log regions
    cleaned_lines = []
    skip_until_endregion = False

    for line in lines:
        if '# #region agent log' in line:
            skip_until_endregion = True
            continue
        elif skip_until_endregion and '# #endregion' in line:
            skip_until_endregion = False
            continue
        elif skip_until_endregion:
            continue
        else:
            cleaned_lines.append(line)

    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(cleaned_lines)

if __name__ == "__main__":
    # Clean the files
    clean_file('app/services/order_service.py')
    clean_file('app/services/teams_service.py')
    print("Cleaned instrumentation from service files")
