import argparse
import csv
import json
import os
import sys
from datetime import datetime
import pandas as pd
from jobspy import scrape_jobs

def run_scraper(
    site_names=None,
    search_term="Software Engineer",
    location="San Francisco, CA",
    results_wanted=10,
    hours_old=72,
    country_indeed="USA",
    is_remote=False,
    job_type=None,
    output_format="both",
    output_dir="."
):
    if site_names is None:
        site_names = ["indeed", "linkedin", "zip_recruiter"]
        
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting JobSpy Scrape...")
    print(f" Target Sites    : {', '.join(site_names)}")
    print(f" Search Term     : '{search_term}'")
    print(f" Location        : '{location}'")
    print(f" Results Wanted  : {results_wanted} per site")
    print(f" Hours Old       : {hours_old}h")
    print(f" Remote Only     : {is_remote}")
    if job_type:
        print(f" Job Type        : {job_type}")
        
    try:
        scrape_kwargs = {
            "site_name": site_names,
            "search_term": search_term,
            "location": location,
            "results_wanted": results_wanted,
            "hours_old": hours_old,
            "country_indeed": country_indeed,
            "is_remote": is_remote,
            "verbose": 1
        }
        if job_type and job_type.lower() != "all":
            scrape_kwargs["job_type"] = job_type.lower()

        jobs_df = scrape_jobs(**scrape_kwargs)
        
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Scrape finished! Total jobs found: {len(jobs_df)}")
        
        if jobs_df is None or jobs_df.empty:
            print("No jobs found for specified criteria.")
            return []
            
        # Standardize missing columns
        expected_cols = [
            "id", "site", "job_url", "job_url_direct", "title", "company", 
            "location", "date_posted", "job_type", "salary_source", "interval", 
            "min_amount", "max_amount", "currency", "is_remote", "job_level", 
            "job_function", "listing_type", "emails", "description", 
            "company_industry", "company_url", "company_logo", "company_url_direct", 
            "company_addresses", "company_num_employees", "company_revenue", 
            "company_description", "skills", "experience_range", "company_rating", 
            "company_reviews_count", "vacancy_count", "work_from_home_type"
        ]
        
        for col in expected_cols:
            if col not in jobs_df.columns:
                jobs_df[col] = None

        # Clean NaN values
        jobs_df = jobs_df.fillna("")

        csv_path = os.path.join(output_dir, "jobs_output.csv")
        json_path = os.path.join(output_dir, "jobs_output.json")

        if output_format in ["csv", "both"]:
            jobs_df.to_csv(csv_path, quoting=csv.QUOTE_NONNUMERIC, escapechar="\\", index=False)
            print(f" Saved CSV to: {os.path.abspath(csv_path)}")

        records = jobs_df.to_dict(orient="records")

        if output_format in ["json", "both"]:
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(records, f, indent=2, default=str)
            print(f" Saved JSON to: {os.path.abspath(json_path)}")

        return records

    except Exception as e:
        print(f"Error executing scrape: {str(e)}", file=sys.stderr)
        raise e

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JobSpy Multi-Board Job Scraper Engine")
    parser.add_argument("--sites", nargs="+", default=["indeed", "linkedin", "zip_recruiter"], help="Sites to scrape")
    parser.add_argument("--search", type=str, default="Software Engineer", help="Search query")
    parser.add_argument("--location", type=str, default="San Francisco, CA", help="Location filter")
    parser.add_argument("--results", type=int, default=10, help="Results wanted per site")
    parser.add_argument("--hours", type=int, default=72, help="Max hours since posted")
    parser.add_argument("--remote", action="store_true", help="Remote jobs only")
    parser.add_argument("--type", type=str, default=None, help="Job type (fulltime, parttime, internship, contract)")
    parser.add_argument("--format", type=str, choices=["csv", "json", "both"], default="both", help="Output format")

    args = parser.parse_args()

    run_scraper(
        site_names=args.sites,
        search_term=args.search,
        location=args.location,
        results_wanted=args.results,
        hours_old=args.hours,
        is_remote=args.remote,
        job_type=args.type,
        output_format=args.format
    )
