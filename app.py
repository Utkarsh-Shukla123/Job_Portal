import csv
import json
import os
import sys
import urllib.parse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from scraper import run_scraper

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(BASE_DIR, "jobs_output.csv")
JSON_FILE = os.path.join(BASE_DIR, "jobs_output.json")

def load_jobs_from_csv():
    if not os.path.exists(CSV_FILE):
        return []
    jobs = []
    try:
        with open(CSV_FILE, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Clean null or string representation of null
                cleaned = {}
                for k, v in row.items():
                    if v in [None, "None", "nan", "NaN"]:
                        cleaned[k] = ""
                    else:
                        cleaned[k] = v
                jobs.append(cleaned)
    except Exception as e:
        print(f"Error loading CSV: {e}")
    return jobs

def load_jobs_from_json():
    if not os.path.exists(JSON_FILE):
        return None
    try:
        with open(JSON_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

class JobPortalRequestHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Serve static files from BASE_DIR
        parsed = urllib.parse.urlparse(path)
        path = parsed.path
        if path == "/":
            path = "/index.html"
        return os.path.join(BASE_DIR, path.lstrip("/"))

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/jobs":
            jobs = load_jobs_from_json() or load_jobs_from_csv()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "count": len(jobs), "jobs": jobs}).encode("utf-8"))
            return

        elif path == "/api/stats":
            jobs = load_jobs_from_json() or load_jobs_from_csv()
            
            sites = {}
            remote_count = 0
            job_types = {}
            salaries = []
            skills_freq = {}

            for j in jobs:
                # Site count
                s = j.get("site", "unknown").lower()
                sites[s] = sites.get(s, 0) + 1
                
                # Remote count
                is_rem = str(j.get("is_remote", "")).lower() in ["true", "1", "yes"]
                if is_rem or "remote" in j.get("location", "").lower():
                    remote_count += 1
                    
                # Job type count
                jt = j.get("job_type", "unspecified").lower() or "unspecified"
                job_types[jt] = job_types.get(jt, 0) + 1

                # Salary range parse
                try:
                    min_sal = float(j.get("min_amount", 0) or 0)
                    max_sal = float(j.get("max_amount", 0) or 0)
                    if min_sal > 0 or max_sal > 0:
                        avg_sal = max_sal if max_sal > 0 else min_sal
                        if j.get("interval", "").lower() == "hourly":
                            avg_sal = avg_sal * 2080 # Yearly equivalent
                        if avg_sal > 10000 and avg_sal < 500000:
                            salaries.append(avg_sal)
                except (ValueError, TypeError):
                    pass

                # Skills count
                sk_str = j.get("skills", "")
                if sk_str:
                    for sk in sk_str.split(","):
                        sk_clean = sk.strip().title()
                        if sk_clean and len(sk_clean) > 1:
                            skills_freq[sk_clean] = skills_freq.get(sk_clean, 0) + 1

            stats = {
                "total_jobs": len(jobs),
                "site_distribution": sites,
                "remote_count": remote_count,
                "onsite_count": len(jobs) - remote_count,
                "job_types": job_types,
                "avg_salary": round(sum(salaries) / len(salaries), 2) if salaries else 0,
                "max_salary": max(salaries) if salaries else 0,
                "min_salary": min(salaries) if salaries else 0,
                "top_skills": dict(sorted(skills_freq.items(), key=lambda x: x[1], reverse=True)[:15])
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success", "stats": stats}).encode("utf-8"))
            return

        elif path == "/api/export":
            query = urllib.parse.parse_qs(parsed.query)
            fmt = query.get("format", ["csv"])[0].lower()
            
            jobs = load_jobs_from_json() or load_jobs_from_csv()

            if fmt == "json":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Disposition", 'attachment; filename="jobs_export.json"')
                self.end_headers()
                self.wfile.write(json.dumps(jobs, indent=2).encode("utf-8"))
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/csv")
                self.send_header("Content-Disposition", 'attachment; filename="jobs_export.csv"')
                self.end_headers()
                if os.path.exists(CSV_FILE):
                    with open(CSV_FILE, "rb") as f:
                        self.wfile.write(f.read())
                else:
                    self.wfile.write(b"No data available")
            return

        # Serve static file
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/scrape":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body.decode("utf-8")) if body else {}
                search_term = data.get("search_term", "Software Engineer")
                location = data.get("location", "San Francisco, CA")
                results_wanted = int(data.get("results_wanted", 5))
                site_names = data.get("site_name", ["indeed", "linkedin", "zip_recruiter"])
                hours_old = int(data.get("hours_old", 72))
                is_remote = bool(data.get("is_remote", False))
                job_type = data.get("job_type", None)

                print(f"Triggering background scrape: {search_term} in {location}")
                
                scraped_jobs = run_scraper(
                    site_names=site_names,
                    search_term=search_term,
                    location=location,
                    results_wanted=results_wanted,
                    hours_old=hours_old,
                    is_remote=is_remote,
                    job_type=job_type,
                    output_format="both",
                    output_dir=BASE_DIR
                )

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "message": f"Successfully scraped {len(scraped_jobs)} jobs!",
                    "count": len(scraped_jobs),
                    "jobs": scraped_jobs
                }).encode("utf-8"))

            except Exception as e:
                print(f"Scrape API error: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

def main():
    print("=" * 60)
    print(f"🚀 Job Search Portal Server running on http://localhost:{PORT}")
    print(f"📂 Serving workspace: {BASE_DIR}")
    print(f"📊 Live endpoints: /api/jobs | /api/stats | /api/scrape | /api/export")
    print("=" * 60)
    
    server = HTTPServer(("0.0.0.0", PORT), JobPortalRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()

if __name__ == "__main__":
    main()
