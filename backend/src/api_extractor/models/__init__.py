"""ORM model package.

Importing this package ensures all models are registered with `Base.metadata`
before Alembic autogenerate or `create_all` is called.
"""

from api_extractor.models.observation import Observation
from api_extractor.models.release import Release
from api_extractor.models.revision import Revision
from api_extractor.models.series import Series
from api_extractor.models.user_prefs import CardTransform, Pin, UserPrefs

__all__ = [
    "Series",
    "Observation",
    "Revision",
    "Release",
    "UserPrefs",
    "Pin",
    "CardTransform",
]
