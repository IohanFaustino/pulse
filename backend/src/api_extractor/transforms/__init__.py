"""Transform engine package.

Public API surface consumed by the API layer (Phase 5):

    from api_extractor.transforms import TransformSpec, TransformService

The ``TransformService`` is the single entry point; it handles cache-aside
logic transparently. ``TransformSpec`` is the Pydantic v2 request model used
in the API router body.
"""

from api_extractor.transforms.cache import RedisCache
from api_extractor.transforms.registry import TRANSFORMS, apply
from api_extractor.transforms.service import TransformService
from api_extractor.transforms.spec import TransformOp, TransformSpec

__all__ = [
    "TRANSFORMS",
    "RedisCache",
    "TransformOp",
    "TransformService",
    "TransformSpec",
    "apply",
]
