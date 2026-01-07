import urllib.request
import urllib.parse
import json

BASE_URL = "http://localhost:8000/api/delivery-runs"
RUN_ID = "cf352689-bb3a-45ac-9acc-ed4be076c99a"

def main():
    url = f"{BASE_URL}/{RUN_ID}/finish"
    print(f"Attempting to finish run {RUN_ID}...")

    req = urllib.request.Request(url, method="PUT")
    try:
        with urllib.request.urlopen(req) as response:
            print("Success!")
            print(json.dumps(json.loads(response.read()), indent=2))
    except urllib.error.HTTPError as e:
        print(f"Status: {e.code}")
        try:
            error_body = e.read().decode()
            print(f"Full Error: {error_body}")
        except Exception as parse_error:
            print(f"Raw Error Body: {error_body}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
