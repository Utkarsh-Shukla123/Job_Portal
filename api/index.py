import json
import os
import csv
from http.server import BaseHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_FILE = os.path.join(BASE_DIR, "jobs_output.csv")
JSON_FILE = os.path.join(BASE_DIR, "jobs_output.json")

def get_jobs():
    if os.path.exists(JSON_FILE):
        try:
            with open(JSON_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    if os.path.exists(CSV_FILE):
        jobs = []
        try:
            with open(CSV_FILE, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    cleaned = {k: ("" if v in [None, "None", "nan", "NaN"] else v) for k, v in row.items()}
                    jobs.append(cleaned)
            return jobs
        except Exception:
            pass
    return []

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        jobs = get_jobs()
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response_data = {
            "status": "success",
            "count": len(jobs),
            "jobs": jobs
        }
        self.wfile.write(json.dumps(response_data).encode('utf-8'))
        return
