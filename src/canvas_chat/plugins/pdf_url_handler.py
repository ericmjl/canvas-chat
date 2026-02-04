"""PDF URL Fetch Handler Plugin

PDF URLs are no longer matched by URL pattern. The main /api/fetch-url flow
does one GET, checks response Content-Type, and if application/pdf returns
the PDF result (pdf_url) so the frontend can show the viewer. This module
remains for backwards compatibility and in case a plugin wants to use
PdfUrlHandler explicitly; it is not registered with UrlFetchRegistry.
"""

import logging

logger = logging.getLogger(__name__)

# PDF detection is content-type based in app.py fetch_url (no URL patterns).
# PdfUrlHandler is not registered; any URL that returns Content-Type: application/pdf
# is handled in the main path and returns pdf_url for the frontend viewer.
logger.info(
    "PDF URL fetch handler plugin loaded (PDF handled by content-type in fetch_url)"
)
