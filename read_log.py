
import os

log_path = '.logs/error.log'
with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

# Find last "Traceback"
last_idx = -1
for i in range(len(lines) - 1, -1, -1):
    if "Traceback (most recent call last):" in lines[i]:
        last_idx = i
        break

if last_idx != -1:
    print(f"Found Traceback at line {last_idx + 1}")
    # Print from that line until we see a new timestamp or run out of lines
    # (Just printing 100 lines to be safe)
    print("".join(lines[last_idx:last_idx+100]))
else:
    print("No Traceback found.")
