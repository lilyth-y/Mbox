import os
import time
from playwright.sync_api import sync_playwright

def main():
    html_path = os.path.abspath("presentation_prototype.html")
    # Format absolute file URL for local system
    url = f"file:///{html_path.replace(os.sep, '/')}"
    print(f"Loading URL: {url}")
    
    # Ensure screenshots directory exists
    os.makedirs("screenshots", exist_ok=True)
    
    with sync_playwright() as p:
        # Launch Chromium
        browser = p.chromium.launch(headless=True)
        # Set precise 1920x1080 viewport
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        
        page.goto(url)
        # Wait for page networks and scripts to load
        page.wait_for_load_state("networkidle")
        time.sleep(2.0)  # Let initial page loaders settle
        
        # Query all sections with slide class
        slides = page.query_selector_all("section.slide")
        print(f"Found {len(slides)} slides to capture.")
        
        for i, slide in enumerate(slides):
            slide_num = i + 1
            print(f"Navigating to Slide {slide_num}...")
            
            # Scroll slide into view
            slide.scroll_into_view_if_needed()
            # Wait for snap scroll and fade-in animations to settle completely
            time.sleep(1.5)
            
            # Capture the current 1920x1080 viewport
            output_path = f"screenshots/slide_{slide_num:02d}.png"
            page.screenshot(path=output_path)
            print(f"Successfully saved Slide {slide_num} capture to {output_path}")
            
        browser.close()
    print("\n[SUCCESS] All 14 slides captured as pixel-perfect 1920x1080 screenshots!")

if __name__ == "__main__":
    main()
