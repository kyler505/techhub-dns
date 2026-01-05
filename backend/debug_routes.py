"""Debug script to list all registered routes in Flask app"""
import sys
sys.path.insert(0, '.')

from app.main import app

print("=" * 60)
print("REGISTERED FLASK ROUTES:")
print("=" * 60)
for rule in app.url_map.iter_rules():
    methods = ','.join(sorted(rule.methods - {'OPTIONS', 'HEAD'}))
    print(f"{rule.endpoint:40s} {methods:15s} {rule.rule}")
print("=" * 60)
