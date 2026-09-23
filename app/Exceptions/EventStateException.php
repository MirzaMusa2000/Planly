<?php

namespace App\Exceptions;

use RuntimeException;

/** An event can't make the requested transition (e.g. confirming a cancelled event). */
class EventStateException extends RuntimeException {}
