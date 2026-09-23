@php
    $code = 503;
    $title = 'Back in a moment';
    $emoji = '☁️';
    $message = $exception?->getMessage() ?: 'The planner is temporarily unavailable. Please try again in a minute.';
    $actionUrl = url()->current();
    $actionLabel = 'Try again';
@endphp
@extends('errors.layout')
