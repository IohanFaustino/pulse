"""Release-calendar scrapers and hardcoded fallback.

Public surface:
    - :class:`CalendarSource`, :class:`ReleaseRecord`, :class:`CalendarScrapeError`
    - :class:`IBGECalendarScraper`, :class:`BCBCalendarScraper`, :class:`HardcodedCalendar`
    - :class:`CalendarService`, :class:`CalendarRefreshReport`
    - :data:`SOURCE_TYPE_SCRAPED`, :data:`SOURCE_TYPE_HARDCODED`
"""

from api_extractor.calendar_scraper.base import (
    SOURCE_TYPE_HARDCODED,
    SOURCE_TYPE_SCRAPED,
    SOURCE_TYPES,
    CalendarScrapeError,
    CalendarSource,
    ReleaseRecord,
)
from api_extractor.calendar_scraper.bcb import BCBCalendarScraper
from api_extractor.calendar_scraper.hardcoded import HardcodedCalendar
from api_extractor.calendar_scraper.ibge import IBGECalendarScraper
from api_extractor.calendar_scraper.service import (
    CalendarRefreshReport,
    CalendarService,
)

__all__ = [
    "BCBCalendarScraper",
    "CalendarRefreshReport",
    "CalendarScrapeError",
    "CalendarService",
    "CalendarSource",
    "HardcodedCalendar",
    "IBGECalendarScraper",
    "ReleaseRecord",
    "SOURCE_TYPES",
    "SOURCE_TYPE_HARDCODED",
    "SOURCE_TYPE_SCRAPED",
]
