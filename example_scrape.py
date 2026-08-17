import csv
import os
from jobspy import scrape_jobs

def main():
    print("=== JobSpy Local Runner ===")
    print("Scraping job listings across sites...")
    
    # Scrape jobs with desired parameters
    jobs = scrape_jobs(
        site_name=["indeed", "linkedin", "zip_recruiter"],
        search_term="software engineer",
        location="San Francisco, CA",
        results_wanted=5,
        hours_old=72,
        country_indeed='USA',
        verbose=1
    )
    
    print(f"\nScrape complete! Total jobs found: {len(jobs)}")
    
    if not jobs.empty:
        print("\n--- Preview of scraped jobs ---")
        print(jobs[['site', 'title', 'company', 'location', 'job_url']].head())
        
        output_file = "jobs_output.csv"
        jobs.to_csv(output_file, quoting=csv.QUOTE_NONNUMERIC, escapechar="\\", index=False)
        print(f"\nResults successfully saved to: {os.path.abspath(output_file)}")
    else:
        print("No jobs found matching the search criteria.")

if __name__ == "__main__":
    main()
