import http.server
import pathlib
import socketserver
import subprocess
import threading

from playwright.sync_api import sync_playwright


ROOT = pathlib.Path(__file__).resolve().parents[3]
DOCS = ROOT / "apps" / "docs"
OUT = DOCS / "dist"
SHOTS = DOCS / ".generated" / "browser-regression"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


def main():
    subprocess.run(["node", "src/cli.mjs", "build"], cwd=DOCS, check=True)
    SHOTS.mkdir(parents=True, exist_ok=True)

    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(OUT), **kwargs)
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            try:
                desktop = browser.new_page(viewport={"width": 1440, "height": 1100})
                desktop.goto(f"{base}/start/overview/", wait_until="networkidle")
                desktop.screenshot(path=str(SHOTS / "overview-desktop.png"), full_page=False)
                desktop.keyboard.press("/")
                desktop.locator("#docs-search-modal-input").fill("privacy")
                desktop.locator(".search-dialog-results a").first.wait_for(state="visible")
                desktop.keyboard.press("ArrowDown")
                active = desktop.locator(".search-dialog-results a.is-active")
                active.wait_for(state="visible")
                assert active.count() == 1
                desktop.screenshot(path=str(SHOTS / "search-command-menu.png"), full_page=False)
                desktop.keyboard.press("Escape")
                assert desktop.locator("[data-search-modal]").is_hidden()

                desktop.evaluate("localStorage.setItem('nullark-docs-theme', 'light')")
                desktop.reload(wait_until="networkidle")
                assert desktop.locator("body").get_attribute("data-theme") == "light"
                desktop.screenshot(path=str(SHOTS / "overview-light.png"), full_page=False)

                mobile = browser.new_page(viewport={"width": 390, "height": 1100}, is_mobile=True)
                mobile.goto(f"{base}/users/deposit/", wait_until="networkidle")
                mobile.screenshot(path=str(SHOTS / "deposit-mobile-closed.png"), full_page=False)
                mobile.locator("[data-mobile-nav-toggle]").click()
                assert mobile.locator("body").evaluate("node => node.classList.contains('sidebar-open')")
                mobile.locator("#docs-sidebar").wait_for(state="visible")
                mobile.screenshot(path=str(SHOTS / "deposit-mobile-nav-open.png"), full_page=False)
            finally:
                browser.close()
        server.shutdown()


if __name__ == "__main__":
    main()
