import urllib.request
import json

BASE_URL = "http://localhost:8000/api/delivery-runs"

def main():
    print("Checking active runs...")
    try:
        req = urllib.request.Request(f"{BASE_URL}/active")
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
