"""Repository package.

Exports all repo classes for convenient import by services and tests.
"""

from api_extractor.repos.base import BaseRepo
from api_extractor.repos.observation_repo import ObservationRepo
from api_extractor.repos.release_repo import ReleaseRepo
from api_extractor.repos.series_repo import SeriesRepo
from api_extractor.repos.user_prefs_repo import UserPrefsRepo

__all__ = [
    "BaseRepo",
    "SeriesRepo",
    "ObservationRepo",
    "ReleaseRepo",
    "UserPrefsRepo",
]
