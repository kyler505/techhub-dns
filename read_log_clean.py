
path = '.logs/error.log'
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

start_line = 24467 - 1 # 0-indexed
end_line = min(len(lines), start_line + 50)

print(f"Reading lines {start_line} to {end_line}")
for i in range(start_line, end_line):
    print(lines[i].strip())
