#!/usr/bin/env python3
"""
Fetch a URL using curl_cffi with browser TLS impersonation.
Bypasses Cloudflare bot protection that blocks Node.js fetch / standard curl.

Usage: python3 fetch_with_curl_cffi.py <url>
Output: raw HTML to stdout, exit 1 on error.
"""
import sys
import os

if len(sys.argv) < 2:
    print("Usage: fetch_with_curl_cffi.py <url>", file=sys.stderr)
    sys.exit(1)

url = sys.argv[1]

try:
    from curl_cffi import requests

    resp = requests.get(
        url,
        impersonate="chrome131",
        timeout=30,
        headers={
            "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://www.google.com/",
            "DNT": "1",
        },
    )

    if resp.status_code != 200:
        print(f"HTTP {resp.status_code} for {url}", file=sys.stderr)
        sys.exit(1)

    sys.stdout.write(resp.text)

except ImportError:
    print("curl_cffi not installed. Run: pip3 install curl-cffi", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"Error fetching {url}: {e}", file=sys.stderr)
    sys.exit(1)
