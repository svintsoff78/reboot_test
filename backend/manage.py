#!/usr/bin/env python
import os
import sys

sys.dont_write_bytecode = True

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
from django.core.management import execute_from_command_line

execute_from_command_line(sys.argv)
