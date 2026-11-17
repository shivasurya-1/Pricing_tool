# Scratch-only settings: the project's settings unchanged, except uploaded files go to scratch.
import os
from config.settings import *  # noqa: F401,F403
MEDIA_ROOT = os.environ["SCRATCH_MEDIA_ROOT"]
