#!/usr/bin/env python3
"""
Open DingTalk web and test the interview bot.
This script launches a browser and navigates to DingTalk.
"""

from playwright.sync_api import sync_playwright
import time
import sys


def main():
    print("[Playwright] Starting browser...")

    with sync_playwright() as p:
        # Launch browser in non-headless mode so user can see
        browser = p.chromium.launch(headless=False)

        # Create context with larger viewport
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        print("[Playwright] Browser opened")
        print("[Playwright] Navigating to DingTalk...")

        # Navigate to DingTalk web
        page.goto("https://im.dingtalk.com/")

        print("[Playwright] Waiting for page to load...")
        page.wait_for_load_state("networkidle")

        # Take initial screenshot
        page.screenshot(path="dingtalk_initial.png", full_page=True)
        print("[Playwright] Screenshot saved: dingtalk_initial.png")

        # Print current URL
        print(f"[Playwright] Current URL: {page.url}")

        # Check if we need to login
        page_content = page.content()

        if "login" in page_content.lower() or "扫码" in page_content:
            print("[Playwright] DingTalk requires login")
            print("[Playwright] Please scan QR code to login...")

            # Wait for user to login (you can adjust this time)
            print("[Playwright] Waiting 30 seconds for login...")
            time.sleep(30)

            # Take screenshot after potential login
            page.screenshot(path="dingtalk_after_login.png", full_page=True)
            print("[Playwright] Screenshot saved: dingtalk_after_login.png")

        print("\n[Playwright] Browser is open. You can now:")
        print("1. Scan QR code if needed")
        print("2. Find the 'open glo BOT' robot")
        print("3. Send message '开始' to test")
        print("\nPress Ctrl+C to close browser...")

        # Keep browser open
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[Playwright] Closing browser...")

        browser.close()
        print("[Playwright] Browser closed")


if __name__ == "__main__":
    main()
