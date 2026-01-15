
import os

path = '.logs/error.log'
file_size = os.path.getsize(path)
buffer_size = 8192
lines = []
with open(path, 'rb') as f:
    segment_count = 0
    # Read file from end
    for pos in range(file_size, 0, -buffer_size):
        start = max(0, pos - buffer_size)
        f.seek(start)
        chunk = f.read(pos - start)
        # Split by newline
        chunk_lines = chunk.decode('utf-8', errors='ignore').splitlines()
        # Add to lines (reversed because we read chunks backwards, but lines are forward in chunk)
        # We need to prepend chunk_lines to lines
        lines = chunk_lines + lines

        # Stop if we have enough lines
        if len(lines) > 2000:
            break

# Now search in these last lines (which are the end of the file)
# Search for Traceback REVERSE
for i in range(len(lines) - 1, -1, -1):
    if "Traceback (most recent call last)" in lines[i]:
        print(f"FOUND TRACEBACK at offset {i}")
        # Print next 50 lines
        for j in range(i, min(len(lines), i + 50)):
            print(lines[j])
        break
else:
    print("No traceback found in last 2000 lines")
